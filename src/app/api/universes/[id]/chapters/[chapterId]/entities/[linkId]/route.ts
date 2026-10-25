import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { ChapterEntityLink } from '@/lib/db/types';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string; linkId: string }> }
) {
  try {
    const { id: universeId, chapterId, linkId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();

    const currentRes = await query<ChapterEntityLink>(
      'SELECT * FROM chapter_entity_links WHERE id = $1 AND chapter_id = $2 AND universe_id = $3',
      [linkId, chapterId, universeId]
    );

    if (currentRes.rows.length === 0) {
      return NextResponse.json({ error: 'Entity link not found' }, { status: 404 });
    }

    const current = currentRes.rows[0];

    const status = body.status && ['confirmed', 'detected', 'needs_review', 'dismissed'].includes(body.status)
      ? body.status
      : current.status;

    const relationshipType = body.relationship_type && ['appears', 'mentioned', 'setting', 'participates', 'referenced'].includes(body.relationship_type)
      ? body.relationship_type
      : current.relationship_type;

    const authorNotes = body.author_notes !== undefined ? body.author_notes : current.author_notes;

    // When the author explicitly updates status or relationship type, mark source as author_confirmed
    const newSource = (body.status || body.relationship_type) ? 'author_confirmed' : current.source;

    await query(
      `UPDATE chapter_entity_links
       SET status = $1,
           relationship_type = $2,
           author_notes = $3,
           source = $4,
           updated_at = NOW()
       WHERE id = $5 AND chapter_id = $6 AND universe_id = $7`,
      [status, relationshipType, authorNotes, newSource, linkId, chapterId, universeId]
    );

    const updatedRes = await query<ChapterEntityLink>(
      'SELECT * FROM chapter_entity_links WHERE id = $1',
      [linkId]
    );

    return NextResponse.json({ link: updatedRes.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update entity link';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string; linkId: string }> }
) {
  try {
    const { id: universeId, chapterId, linkId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const res = await query(
      'DELETE FROM chapter_entity_links WHERE id = $1 AND chapter_id = $2 AND universe_id = $3 RETURNING id',
      [linkId, chapterId, universeId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Entity link not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedLinkId: linkId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete entity link';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}
