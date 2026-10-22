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
  wouldCreateDependencyCycle,
} from '@/lib/validation/cross-universe';

interface EventParticipantRow {
  id: string;
  event_id: string;
  character_id: string;
  role: string | null;
  notes: string | null;
  character_name: string;
  character_epithet: string | null;
}

interface EventDependencyRow {
  id: string;
  event_id: string;
  predecessor_event_id: string;
  reason: string | null;
  predecessor_title: string;
  predecessor_year: number;
}

interface EventSecretUsageRow {
  id: string;
  event_id: string;
  secret_id: string;
  character_id: string | null;
  notes: string | null;
  secret_title: string;
  secret_severity: string;
  character_name: string | null;
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id: universeId, eventId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const eventRes = await query<UniverseEvent & { location_name: string | null; chapter_title: string | null }>(
      `SELECT e.*, l.name as location_name, ch.title as chapter_title
       FROM events e
       LEFT JOIN locations l ON e.location_id = l.id
       LEFT JOIN chapters ch ON e.chapter_id = ch.id
       WHERE e.id = $1 AND e.universe_id = $2`,
      [eventId, universeId]
    );

    if (eventRes.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventRes.rows[0];

    // Participants
    const partsRes = await query<EventParticipantRow>(
      `SELECT ep.*, c.name as character_name, c.epithet as character_epithet
       FROM event_participants ep
       JOIN characters c ON ep.character_id = c.id
       WHERE ep.event_id = $1
       ORDER BY c.name ASC`,
      [eventId]
    );

    // Dependencies (predecessors)
    const depsRes = await query<EventDependencyRow>(
      `SELECT ed.*, pe.title as predecessor_title, pe.timestamp_year as predecessor_year
       FROM event_dependencies ed
       JOIN events pe ON ed.predecessor_event_id = pe.id
       WHERE ed.event_id = $1
       ORDER BY pe.timestamp_year ASC`,
      [eventId]
    );

    // Secret usages
    const secretsRes = await query<EventSecretUsageRow>(
      `SELECT se.*, s.title as secret_title, s.severity as secret_severity, c.name as character_name
       FROM secret_events se
       JOIN secrets s ON se.secret_id = s.id
       LEFT JOIN characters c ON se.character_id = c.id
       WHERE se.event_id = $1`,
      [eventId]
    );

    return NextResponse.json({
      event: {
        ...event,
        participants: partsRes.rows,
        dependencies: depsRes.rows,
        secret_usages: secretsRes.rows,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch event';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id: universeId, eventId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const title = body.title?.trim();
    const description = body.description !== undefined ? body.description?.trim() || null : undefined;
    const sequenceNumber = body.sequence_number !== undefined && body.sequence_number !== null ? Number(body.sequence_number) : undefined;
    const timestampYear = body.timestamp_year !== undefined && body.timestamp_year !== null ? Number(body.timestamp_year) : undefined;
    const locationId = body.location_id !== undefined ? (body.location_id?.trim() || null) : undefined;
    const chapterId = body.chapter_id !== undefined ? (body.chapter_id?.trim() || null) : undefined;
    const isDeathEvent = body.is_death_event !== undefined ? Boolean(body.is_death_event) : undefined;

    if (!title || title.length === 0) {
      return NextResponse.json({ error: 'Event title is required' }, { status: 400 });
    }
    if (timestampYear !== undefined && isNaN(timestampYear)) {
      return NextResponse.json({ error: 'Valid timestamp year is required' }, { status: 400 });
    }

    const updatedEvent = await transaction(async (tx) => {
      // Validate location and chapter if provided
      if (locationId) {
        await validateLocationInUniverse(tx, locationId, universeId);
      }
      if (chapterId) {
        await validateChapterInUniverse(tx, chapterId, universeId);
      }

      await tx.query(
        `UPDATE events
         SET title = $1,
             description = COALESCE($2, description),
             sequence_number = COALESCE($3, sequence_number),
             timestamp_year = COALESCE($4, timestamp_year),
             location_id = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE location_id END,
             chapter_id = CASE WHEN $6::text IS NOT NULL THEN $6 ELSE chapter_id END,
             is_death_event = COALESCE($7, is_death_event),
             updated_at = NOW()
         WHERE id = $8 AND universe_id = $9`,
        [title, description, sequenceNumber, timestampYear, locationId, chapterId, isDeathEvent, eventId, universeId]
      );

      // If participants array explicitly provided, replace
      if (Array.isArray(body.participants)) {
        await tx.query('DELETE FROM event_participants WHERE event_id = $1', [eventId]);
        const seenCharacters = new Set<string>();
        for (const p of body.participants) {
          if (!p.character_id) continue;
          if (seenCharacters.has(p.character_id)) {
            throw new Error(`Duplicate participant character '${p.character_id}'`);
          }
          seenCharacters.add(p.character_id);
          await validateCharacterInUniverse(tx, p.character_id, universeId);
          await tx.query(
            `INSERT INTO event_participants (id, event_id, character_id, role, notes)
             VALUES ($1, $2, $3, $4, $5)`,
            [`part-${crypto.randomUUID().slice(0, 12)}`, eventId, p.character_id, p.role?.trim() || null, p.notes?.trim() || null]
          );
        }
      }

      // If dependencies array explicitly provided, replace
      if (Array.isArray(body.dependencies)) {
        await tx.query('DELETE FROM event_dependencies WHERE event_id = $1', [eventId]);
        const seenPredecessors = new Set<string>();
        for (const d of body.dependencies) {
          if (!d.predecessor_event_id) continue;
          if (d.predecessor_event_id === eventId) {
            throw new Error('Event cannot depend on itself');
          }
          if (seenPredecessors.has(d.predecessor_event_id)) {
            throw new Error(`Duplicate predecessor dependency '${d.predecessor_event_id}'`);
          }
          seenPredecessors.add(d.predecessor_event_id);
          await validateEventInUniverse(tx, d.predecessor_event_id, universeId);

          const isCycle = await wouldCreateDependencyCycle(tx, eventId, d.predecessor_event_id);
          if (isCycle) {
            throw new Error(`Causal dependency cycle detected with predecessor '${d.predecessor_event_id}'`);
          }

          await tx.query(
            `INSERT INTO event_dependencies (id, event_id, predecessor_event_id, dependency_type)
             VALUES ($1, $2, $3, $4)`,
            [`dep-${crypto.randomUUID().slice(0, 12)}`, eventId, d.predecessor_event_id, d.dependency_type || 'requires_predecessor']
          );
        }
      }

      const res = await tx.query<UniverseEvent>('SELECT * FROM events WHERE id = $1', [eventId]);
      if (res.rows.length === 0) {
        throw new Error('Event not found');
      }
      return res.rows[0];
    });

    return NextResponse.json({ event: updatedEvent });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update event';
    const status = message.includes('does not belong') || message.includes('cycle') || message.includes('Duplicate') || message.includes('cannot depend')
      ? 400
      : message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { id: universeId, eventId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const res = await query(
      'DELETE FROM events WHERE id = $1 AND universe_id = $2 RETURNING id',
      [eventId, universeId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedEventId: eventId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete event';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
