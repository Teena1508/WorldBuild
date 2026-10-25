import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Relationship } from '@/lib/db/types';
import { validateCharacterInUniverse } from '@/lib/validation/cross-universe';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: universeId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const res = await query<Relationship & { source_character_name: string; target_character_name: string }>(
      `SELECT r.*,
        c1.name as source_character_name,
        c2.name as target_character_name
       FROM relationships r
       JOIN characters c1 ON r.source_character_id = c1.id
       JOIN characters c2 ON r.target_character_id = c2.id
       WHERE r.universe_id = $1
       ORDER BY r.created_at DESC`,
      [universeId]
    );

    return NextResponse.json({ relationships: res.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch relationships';
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
    const sourceCharacterId = body.source_character_id?.trim();
    const targetCharacterId = body.target_character_id?.trim();
    const relationshipType = body.relationship_type?.trim();
    const intensity = body.intensity !== undefined && body.intensity !== null ? Number(body.intensity) : 5;
    const notes = body.notes?.trim() || null;

    if (!sourceCharacterId || !targetCharacterId) {
      return NextResponse.json(
        { error: 'Source character and target character are required' },
        { status: 400 }
      );
    }

    if (sourceCharacterId === targetCharacterId) {
      return NextResponse.json(
        { error: 'A character cannot have a relationship with themselves' },
        { status: 400 }
      );
    }

    if (!relationshipType || relationshipType.length === 0) {
      return NextResponse.json(
        { error: 'Relationship type is required' },
        { status: 400 }
      );
    }

    if (isNaN(intensity) || intensity < 1 || intensity > 10) {
      return NextResponse.json(
        { error: 'Intensity must be an integer between 1 and 10' },
        { status: 400 }
      );
    }

    // Cross-universe validation
    await validateCharacterInUniverse({ query }, sourceCharacterId, universeId);
    await validateCharacterInUniverse({ query }, targetCharacterId, universeId);

    // Check unique pair + type
    const existing = await query(
      `SELECT id FROM relationships
       WHERE universe_id = $1 AND source_character_id = $2 AND target_character_id = $3 AND relationship_type = $4`,
      [universeId, sourceCharacterId, targetCharacterId, relationshipType]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'This specific relationship between these characters already exists' },
        { status: 400 }
      );
    }

    const relId = `rel-${crypto.randomUUID().slice(0, 12)}`;

    await query(
      `INSERT INTO relationships (id, universe_id, source_character_id, target_character_id, relationship_type, intensity, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [relId, universeId, sourceCharacterId, targetCharacterId, relationshipType, intensity, notes]
    );

    const created = await query<Relationship>(
      `SELECT r.*, c1.name as source_character_name, c2.name as target_character_name
       FROM relationships r
       JOIN characters c1 ON r.source_character_id = c1.id
       JOIN characters c2 ON r.target_character_id = c2.id
       WHERE r.id = $1`,
      [relId]
    );

    return NextResponse.json({ relationship: created.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create relationship';
    const status = message.includes('Authentication')
      ? 401
      : message.includes('does not belong') || message.includes('cannot have')
      ? 400
      : message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
