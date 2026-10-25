import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query, transaction } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { UniverseEvent } from '@/lib/db/types';
import {
  validateLocationInUniverse,
  validateChapterInUniverse,
  validateCharacterInUniverse,
  validateEventInUniverse,
  validateSecretInUniverse,
  wouldCreateDependencyCycle,
} from '@/lib/validation/cross-universe';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: universeId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q')?.trim().toLowerCase();

    let sql = `
      SELECT e.*,
        l.name as location_name,
        ch.title as chapter_title,
        (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = e.id) as participants_count,
        (SELECT COUNT(*)::int FROM event_dependencies ed WHERE ed.event_id = e.id) as dependencies_count
      FROM events e
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN chapters ch ON e.chapter_id = ch.id
      WHERE e.universe_id = $1
    `;
    const params: unknown[] = [universeId];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (LOWER(e.title) LIKE $${params.length} OR LOWER(COALESCE(e.description, '')) LIKE $${params.length})`;
    }

    sql += ` ORDER BY e.timestamp_year ASC, e.sequence_number ASC`;

    const res = await query<UniverseEvent & { location_name: string | null; chapter_title: string | null; participants_count: number; dependencies_count: number }>(sql, params);

    return NextResponse.json({ events: res.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch events';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: universeId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const title = body.title?.trim();
    const description = body.description !== undefined ? body.description?.trim() || null : null;
    const sequenceNumber = body.sequence_number !== undefined && body.sequence_number !== null ? Number(body.sequence_number) : 0;
    const timestampYear = body.timestamp_year !== undefined && body.timestamp_year !== null ? Number(body.timestamp_year) : null;
    const locationId = body.location_id?.trim() || null;
    const chapterId = body.chapter_id?.trim() || null;
    const isDeathEvent = Boolean(body.is_death_event);

    const participants: Array<{ character_id: string; role?: string; notes?: string }> = Array.isArray(body.participants) ? body.participants : [];
    const dependencies: Array<{ predecessor_event_id: string; dependency_type?: 'requires_predecessor' | 'causal' | 'chronological' }> = Array.isArray(body.dependencies) ? body.dependencies : [];
    const secretUsages: Array<{ secret_id: string; character_id?: string; usage_type?: 'used' | 'revealed' | 'referenced' }> = Array.isArray(body.secret_usages) ? body.secret_usages : [];

    if (!title || title.length === 0) {
      return NextResponse.json({ error: 'Event title is required' }, { status: 400 });
    }
    if (timestampYear === null || isNaN(timestampYear)) {
      return NextResponse.json({ error: 'Valid timestamp year is required' }, { status: 400 });
    }

    const eventId = `evt-${crypto.randomUUID().slice(0, 12)}`;

    const createdEvent = await transaction(async (tx) => {
      // 1. Cross-universe integrity validation
      if (locationId) {
        await validateLocationInUniverse(tx, locationId, universeId);
      }
      if (chapterId) {
        await validateChapterInUniverse(tx, chapterId, universeId);
      }

      // 2. Validate participants
      const seenCharacters = new Set<string>();
      for (const p of participants) {
        if (!p.character_id) continue;
        if (seenCharacters.has(p.character_id)) {
          throw new Error(`Duplicate participant character '${p.character_id}' in event`);
        }
        seenCharacters.add(p.character_id);
        await validateCharacterInUniverse(tx, p.character_id, universeId);
      }

      // 3. Validate dependencies & cycles
      const seenPredecessors = new Set<string>();
      for (const d of dependencies) {
        if (!d.predecessor_event_id) continue;
        if (d.predecessor_event_id === eventId) {
          throw new Error('Event cannot depend on itself');
        }
        if (seenPredecessors.has(d.predecessor_event_id)) {
          throw new Error(`Duplicate predecessor dependency '${d.predecessor_event_id}' in event`);
        }
        seenPredecessors.add(d.predecessor_event_id);
        await validateEventInUniverse(tx, d.predecessor_event_id, universeId);

        const isCycle = await wouldCreateDependencyCycle(tx, eventId, d.predecessor_event_id);
        if (isCycle) {
          throw new Error(`Causal dependency cycle detected with predecessor '${d.predecessor_event_id}'`);
        }
      }

      // 4. Validate secret usages
      for (const su of secretUsages) {
        if (!su.secret_id) continue;
        await validateSecretInUniverse(tx, su.secret_id, universeId);
        if (su.character_id) {
          await validateCharacterInUniverse(tx, su.character_id, universeId);
        }
      }

      // 5. Insert event
      await tx.query(
        `INSERT INTO events (id, universe_id, title, description, sequence_number, timestamp_year, location_id, chapter_id, is_death_event, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [eventId, universeId, title, description, sequenceNumber, timestampYear, locationId, chapterId, isDeathEvent]
      );

      // 6. Insert participants
      for (const p of participants) {
        if (!p.character_id) continue;
        await tx.query(
          `INSERT INTO event_participants (id, event_id, character_id, role, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [`part-${crypto.randomUUID().slice(0, 12)}`, eventId, p.character_id, p.role?.trim() || null, p.notes?.trim() || null]
        );
      }

      // 7. Insert dependencies
      for (const d of dependencies) {
        if (!d.predecessor_event_id) continue;
        await tx.query(
          `INSERT INTO event_dependencies (id, event_id, predecessor_event_id, dependency_type)
           VALUES ($1, $2, $3, $4)`,
          [`dep-${crypto.randomUUID().slice(0, 12)}`, eventId, d.predecessor_event_id, d.dependency_type || 'requires_predecessor']
        );
      }

      // 8. Insert secret usages
      for (const su of secretUsages) {
        if (!su.secret_id) continue;
        await tx.query(
          `INSERT INTO secret_events (id, event_id, secret_id, character_id, usage_type)
           VALUES ($1, $2, $3, $4, $5)`,
          [`sevt-${crypto.randomUUID().slice(0, 12)}`, eventId, su.secret_id, su.character_id || null, su.usage_type || 'used']
        );
      }

      const res = await tx.query<UniverseEvent>('SELECT * FROM events WHERE id = $1', [eventId]);
      return res.rows[0];
    });

    return NextResponse.json({ event: createdEvent }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create event';
    const status = message.includes('Authentication')
      ? 401
      : message.includes('Unauthorized') || message.includes('read-only')
      ? 403
      : message.includes('not found')
      ? 404
      : (message.includes('does not belong') || message.includes('cycle') || message.includes('Duplicate participant') || message.includes('cannot depend'))
      ? 400
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
