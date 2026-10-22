import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Relationship } from '@/lib/db/types';

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string; relationshipId: string }> }
) {
  try {
    const { id: universeId, relationshipId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const relationshipType = body.relationship_type?.trim();
    const intensity = body.intensity !== undefined && body.intensity !== null ? Number(body.intensity) : undefined;
    const notes = body.notes !== undefined ? (body.notes?.trim() || null) : undefined;

    if (intensity !== undefined && (isNaN(intensity) || intensity < 1 || intensity > 10)) {
      return NextResponse.json({ error: 'Intensity must be between 1 and 10' }, { status: 400 });
    }

    await query(
      `UPDATE relationships
       SET relationship_type = COALESCE($1, relationship_type),
           intensity = COALESCE($2, intensity),
           notes = COALESCE($3, notes)
       WHERE id = $4 AND universe_id = $5`,
      [relationshipType, intensity, notes, relationshipId, universeId]
    );

    const updated = await query<Relationship>(
      `SELECT r.*, c1.name as source_character_name, c2.name as target_character_name
       FROM relationships r
       JOIN characters c1 ON r.source_character_id = c1.id
       JOIN characters c2 ON r.target_character_id = c2.id
       WHERE r.id = $1 AND r.universe_id = $2`,
      [relationshipId, universeId]
    );

    if (updated.rows.length === 0) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }

    return NextResponse.json({ relationship: updated.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update relationship';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; relationshipId: string }> }
) {
  try {
    const { id: universeId, relationshipId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const res = await query(
      'DELETE FROM relationships WHERE id = $1 AND universe_id = $2 RETURNING id',
      [relationshipId, universeId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Relationship not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedRelationshipId: relationshipId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete relationship';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
