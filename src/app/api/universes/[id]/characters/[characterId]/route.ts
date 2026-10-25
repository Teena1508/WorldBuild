import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Character, Relationship } from '@/lib/db/types';

interface CharacterEventParticipation {
  id: string;
  title: string;
  timestamp_year: number;
  sequence_number: number;
  role: string | null;
  notes: string | null;
  location_name: string | null;
}

interface CharacterKnownSecret {
  character_secret_id: string;
  learned_year: number | null;
  notes: string | null;
  secret_id: string;
  title: string;
  severity: string;
  content: string;
  learned_at_event_title: string | null;
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string; characterId: string }> }
) {
  try {
    const { id: universeId, characterId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const charRes = await query<Character>(
      'SELECT * FROM characters WHERE id = $1 AND universe_id = $2',
      [characterId, universeId]
    );

    if (charRes.rows.length === 0) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const character = charRes.rows[0];

    // Participating events
    const eventsRes = await query<CharacterEventParticipation>(
      `SELECT e.id, e.title, e.timestamp_year, e.sequence_number, ep.role, ep.notes, l.name as location_name
       FROM event_participants ep
       JOIN events e ON ep.event_id = e.id
       LEFT JOIN locations l ON e.location_id = l.id
       WHERE ep.character_id = $1 AND e.universe_id = $2
       ORDER BY e.timestamp_year ASC, e.sequence_number ASC`,
      [characterId, universeId]
    );

    // Relationships (both as source and target)
    const relsRes = await query<Relationship & { source_character_name: string; target_character_name: string }>(
      `SELECT r.*,
        c1.name as source_character_name,
        c2.name as target_character_name
       FROM relationships r
       JOIN characters c1 ON r.source_character_id = c1.id
       JOIN characters c2 ON r.target_character_id = c2.id
       WHERE (r.source_character_id = $1 OR r.target_character_id = $1) AND r.universe_id = $2
       ORDER BY r.created_at ASC`,
      [characterId, universeId]
    );

    // Known Secrets
    const secretsRes = await query<CharacterKnownSecret>(
      `SELECT cs.id as character_secret_id, cs.learned_year, cs.notes, s.id as secret_id, s.title, s.severity, s.content, e.title as learned_at_event_title
       FROM character_secrets cs
       JOIN secrets s ON cs.secret_id = s.id
       LEFT JOIN events e ON cs.learned_at_event_id = e.id
       WHERE cs.character_id = $1 AND s.universe_id = $2`,
      [characterId, universeId]
    );

    // Chapter Appearances & Mentions with associated locations and events
    const appearancesRes = await query(
      `SELECT cel.*,
        ch.title as chapter_title,
        ch.sequence_number as chapter_sequence
       FROM chapter_entity_links cel
       JOIN chapters ch ON cel.chapter_id = ch.id
       WHERE (cel.character_id = $1 OR (cel.entity_type = 'character' AND LOWER(cel.entity_name) = LOWER($2)))
         AND cel.universe_id = $3
         AND cel.status != 'dismissed'
       ORDER BY ch.sequence_number ASC`,
      [characterId, character.name, universeId]
    );

    const chapterAppearances = await Promise.all(
      appearancesRes.rows.map(async (appRow: unknown) => {
        const row = appRow as Record<string, unknown>;
        const chapId = row.chapter_id as string;
        // Associated locations in this chapter
        const locs = await query(
          `SELECT location_id, entity_name, entity_name as name, relationship_type
           FROM chapter_entity_links
           WHERE chapter_id = $1 AND entity_type = 'location' AND status != 'dismissed'`,
          [chapId]
        );
        // Associated events in this chapter
        const evs = await query(
          `SELECT id, title, timestamp_year
           FROM events
           WHERE chapter_id = $1 AND universe_id = $2`,
          [chapId, universeId]
        );
        return {
          ...row,
          associated_locations: locs.rows,
          associated_events: evs.rows,
        };
      })
    );

    return NextResponse.json({
      character,
      events: eventsRes.rows,
      relationships: relsRes.rows,
      secrets: secretsRes.rows,
      chapter_appearances: chapterAppearances,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch character';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string; characterId: string }> }
) {
  try {
    const { id: universeId, characterId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const name = body.name?.trim();
    const epithet = body.epithet !== undefined ? body.epithet?.trim() || null : undefined;
    const bio = body.bio?.trim();
    const birthYear = body.birth_year !== undefined && body.birth_year !== '' && body.birth_year !== null ? Number(body.birth_year) : null;
    const deathYear = body.death_year !== undefined && body.death_year !== '' && body.death_year !== null ? Number(body.death_year) : null;
    const deathConfirmed = body.death_confirmed !== undefined ? Boolean(body.death_confirmed) : undefined;
    const deathExceptionNotes = body.death_exception_notes !== undefined ? body.death_exception_notes?.trim() || null : undefined;
    const status = body.status?.trim();
    const aliases = body.aliases !== undefined ? body.aliases.trim() : undefined;

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

    // Check unique name if changed
    const nameCheck = await query(
      'SELECT id FROM characters WHERE universe_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3',
      [universeId, name, characterId]
    );
    if (nameCheck.rows.length > 0) {
      return NextResponse.json(
        { error: `Another character named "${name}" already exists in this universe` },
        { status: 400 }
      );
    }

    await query(
      `UPDATE characters
       SET name = $1, epithet = $2, bio = $3, birth_year = $4, death_year = $5,
           death_confirmed = COALESCE($6, death_confirmed),
           death_exception_notes = $7,
           status = COALESCE($8, status),
           aliases = COALESCE($9, aliases),
           updated_at = NOW()
       WHERE id = $10 AND universe_id = $11`,
      [name, epithet, bio, birthYear, deathYear, deathConfirmed, deathExceptionNotes, status, aliases, characterId, universeId]
    );

    const updated = await query<Character>(
      'SELECT * FROM characters WHERE id = $1 AND universe_id = $2',
      [characterId, universeId]
    );

    if (updated.rows.length === 0) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    return NextResponse.json({ character: updated.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update character';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; characterId: string }> }
) {
  try {
    const { id: universeId, characterId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const res = await query(
      'DELETE FROM characters WHERE id = $1 AND universe_id = $2 RETURNING id',
      [characterId, universeId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedCharacterId: characterId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete character';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}
