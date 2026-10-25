import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import {
  validateCharacterInUniverse,
  validateSecretInUniverse,
  validateEventInUniverse,
} from '@/lib/validation/cross-universe';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; secretId: string }> }
) {
  try {
    const { id: universeId, secretId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const characterId = body.character_id?.trim();
    const learnedYear = body.learned_year !== undefined && body.learned_year !== null && body.learned_year !== '' ? Number(body.learned_year) : null;
    const learnedAtEventId = body.learned_at_event_id?.trim() || null;
    const notes = body.notes?.trim() || null;

    if (!characterId) {
      return NextResponse.json({ error: 'Character ID is required' }, { status: 400 });
    }

    // Cross-universe validation
    await validateSecretInUniverse({ query }, secretId, universeId);
    await validateCharacterInUniverse({ query }, characterId, universeId);
    if (learnedAtEventId) {
      await validateEventInUniverse({ query }, learnedAtEventId, universeId);
    }

    // Check duplicate
    const existing = await query(
      'SELECT id FROM character_secrets WHERE character_id = $1 AND secret_id = $2',
      [characterId, secretId]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'This character is already recorded as knowing this secret' },
        { status: 400 }
      );
    }

    const recordId = `csec-${crypto.randomUUID().slice(0, 12)}`;

    await query(
      `INSERT INTO character_secrets (id, character_id, secret_id, learned_at_event_id, learned_year, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [recordId, characterId, secretId, learnedAtEventId, learnedYear, notes]
    );

    interface CharacterSecretWithDetails {
      id: string;
      character_id: string;
      secret_id: string;
      learned_at_event_id: string | null;
      learned_year: number | null;
      notes: string | null;
      character_name: string;
      learned_at_event_title: string | null;
    }

    const created = await query<CharacterSecretWithDetails>(
      `SELECT cs.*, c.name as character_name, e.title as learned_at_event_title
       FROM character_secrets cs
       JOIN characters c ON cs.character_id = c.id
       LEFT JOIN events e ON cs.learned_at_event_id = e.id
       WHERE cs.id = $1`,
      [recordId]
    );

    return NextResponse.json({ character_secret: created.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record secret knowledge';
    const status = message.includes('Authentication') ? 401 : message.includes('does not belong') ? 400 : message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; secretId: string }> }
) {
  try {
    const { id: universeId, secretId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const { searchParams } = new URL(request.url);
    const characterId = searchParams.get('characterId')?.trim();

    if (!characterId) {
      return NextResponse.json({ error: 'characterId query parameter is required' }, { status: 400 });
    }

    const res = await query<{ id: string }>(
      'DELETE FROM character_secrets WHERE secret_id = $1 AND character_id = $2 RETURNING id',
      [secretId, characterId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedRecordId: res.rows[0].id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove secret knowledge';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}
