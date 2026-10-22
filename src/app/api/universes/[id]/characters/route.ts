import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Character } from '@/lib/db/types';

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
    const status = searchParams.get('status')?.trim();

    let sql = `
      SELECT c.*,
        (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.character_id = c.id) as events_count,
        (SELECT COUNT(*)::int FROM character_secrets cs WHERE cs.character_id = c.id) as secrets_count,
        (SELECT COUNT(*)::int FROM relationships r WHERE r.source_character_id = c.id OR r.target_character_id = c.id) as relationships_count
      FROM characters c
      WHERE c.universe_id = $1
    `;
    const params: unknown[] = [universeId];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (LOWER(c.name) LIKE $${params.length} OR LOWER(COALESCE(c.epithet, '')) LIKE $${params.length} OR LOWER(c.bio) LIKE $${params.length})`;
    }

    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND c.status = $${params.length}`;
    }

    sql += ` ORDER BY c.created_at ASC`;

    const res = await query<Character & { events_count: number; secrets_count: number; relationships_count: number }>(sql, params);

    return NextResponse.json({ characters: res.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch characters';
    const status = message.includes('not found') ? 404 : 403;
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
    const name = body.name?.trim();
    const epithet = body.epithet?.trim() || null;
    const bio = body.bio?.trim();
    const birthYear = body.birth_year !== undefined && body.birth_year !== '' && body.birth_year !== null ? Number(body.birth_year) : null;
    const deathYear = body.death_year !== undefined && body.death_year !== '' && body.death_year !== null ? Number(body.death_year) : null;
    const deathConfirmed = Boolean(body.death_confirmed);
    const deathExceptionNotes = body.death_exception_notes?.trim() || null;
    const status = body.status?.trim() || 'alive';

    if (!name || name.length === 0) {
      return NextResponse.json({ error: 'Character name is required' }, { status: 400 });
    }
    if (!bio || bio.length === 0) {
      return NextResponse.json({ error: 'Character biography is required' }, { status: 400 });
    }

    if (birthYear !== null && deathYear !== null && deathYear < birthYear) {
      return NextResponse.json(
        { error: `Death year (${deathYear}) cannot precede birth year (${birthYear})` },
        { status: 400 }
      );
    }

    const validStatuses = ['alive', 'deceased', 'ascended', 'displaced', 'unknown'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Check unique name in universe
    const existing = await query(
      'SELECT id FROM characters WHERE universe_id = $1 AND LOWER(name) = LOWER($2)',
      [universeId, name]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: `A character named "${name}" already exists in this universe` },
        { status: 400 }
      );
    }

    const charId = `char-${crypto.randomUUID().slice(0, 12)}`;

    await query(
      `INSERT INTO characters (id, universe_id, name, epithet, bio, birth_year, death_year, death_confirmed, death_exception_notes, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
      [charId, universeId, name, epithet, bio, birthYear, deathYear, deathConfirmed, deathExceptionNotes, status]
    );

    const created = await query<Character>('SELECT * FROM characters WHERE id = $1', [charId]);

    return NextResponse.json({ character: created.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create character';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
