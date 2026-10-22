import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Chapter, UniverseEvent } from '@/lib/db/types';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { id: universeId, chapterId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const chapRes = await query<Chapter>(
      'SELECT * FROM chapters WHERE id = $1 AND universe_id = $2',
      [chapterId, universeId]
    );

    if (chapRes.rows.length === 0) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    const chapter = chapRes.rows[0];

    const eventsRes = await query<UniverseEvent & { location_name: string | null }>(
      `SELECT e.*, l.name as location_name
       FROM events e
       LEFT JOIN locations l ON e.location_id = l.id
       WHERE e.chapter_id = $1 AND e.universe_id = $2
       ORDER BY e.sequence_number ASC, e.timestamp_year ASC`,
      [chapterId, universeId]
    );

    return NextResponse.json({
      chapter,
      events: eventsRes.rows,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch chapter';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { id: universeId, chapterId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const title = body.title?.trim();
    const sequenceNumber = body.sequence_number !== undefined && body.sequence_number !== null ? Number(body.sequence_number) : undefined;
    const summary = body.summary !== undefined ? body.summary?.trim() || '' : undefined;

    if (!title || title.length === 0) {
      return NextResponse.json({ error: 'Chapter title is required' }, { status: 400 });
    }

    if (sequenceNumber !== undefined && (isNaN(sequenceNumber) || sequenceNumber < 0)) {
      return NextResponse.json({ error: 'Valid sequence number (>= 0) is required' }, { status: 400 });
    }

    if (sequenceNumber !== undefined) {
      const seqCheck = await query(
        'SELECT id FROM chapters WHERE universe_id = $1 AND sequence_number = $2 AND id <> $3',
        [universeId, sequenceNumber, chapterId]
      );
      if (seqCheck.rows.length > 0) {
        return NextResponse.json(
          { error: `Sequence number ${sequenceNumber} is already taken in this universe` },
          { status: 400 }
        );
      }
    }

    await query(
      `UPDATE chapters
       SET title = $1,
           sequence_number = COALESCE($2, sequence_number),
           summary = COALESCE($3, summary),
           updated_at = NOW()
       WHERE id = $4 AND universe_id = $5`,
      [title, sequenceNumber, summary, chapterId, universeId]
    );

    const updated = await query<Chapter>(
      'SELECT * FROM chapters WHERE id = $1 AND universe_id = $2',
      [chapterId, universeId]
    );

    if (updated.rows.length === 0) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    return NextResponse.json({ chapter: updated.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update chapter';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { id: universeId, chapterId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    // Schema has ON DELETE SET NULL for events.chapter_id
    const res = await query(
      'DELETE FROM chapters WHERE id = $1 AND universe_id = $2 RETURNING id',
      [chapterId, universeId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedChapterId: chapterId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete chapter';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
