import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Chapter, UniverseEvent } from '@/lib/db/types';
import { processChapterEntityTracking } from '@/lib/continuity/entity-tracker';

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
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
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

    const currentRes = await query<Chapter>(
      'SELECT * FROM chapters WHERE id = $1 AND universe_id = $2',
      [chapterId, universeId]
    );

    if (currentRes.rows.length === 0) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    const currentChapter = currentRes.rows[0];

    // Optimistic concurrency control to prevent silent overwrite of newer edits
    if (body.expected_version !== undefined && body.expected_version !== null) {
      const expectedVersion = Number(body.expected_version);
      if (currentChapter.version !== expectedVersion) {
        return NextResponse.json(
          {
            error: `Concurrent edit conflict: The manuscript was modified elsewhere (current version is v${currentChapter.version}, but you edited v${expectedVersion}). Review changes to avoid overwriting.`,
            currentChapter,
            code: 'CONCURRENT_EDIT_CONFLICT',
          },
          { status: 409 }
        );
      }
    }

    const title = body.title !== undefined ? body.title.trim() : currentChapter.title;
    const sequenceNumber = body.sequence_number !== undefined && body.sequence_number !== null ? Number(body.sequence_number) : undefined;
    const summary = body.summary !== undefined ? (body.summary?.trim() || '') : undefined;
    const content = body.content !== undefined
      ? (typeof body.content === 'string' ? body.content : '')
      : (body.manuscript_content !== undefined
          ? (typeof body.manuscript_content === 'string' ? body.manuscript_content : '')
          : currentChapter.content);
    const wordCount = body.word_count !== undefined ? Number(body.word_count) : (content ? content.trim().split(/\s+/).filter(Boolean).length : 0);
    const status = body.status && ['draft', 'in_review', 'canonized'].includes(body.status) ? body.status : currentChapter.status;
    const newVersion = currentChapter.version + 1;

    if (body.title !== undefined && (!title || title.length === 0)) {
      return NextResponse.json({ error: 'Chapter title is required' }, { status: 400 });
    }

    if (sequenceNumber !== undefined && (isNaN(sequenceNumber) || sequenceNumber < 0)) {
      return NextResponse.json({ error: 'Valid sequence number (>= 0) is required' }, { status: 400 });
    }

    if (sequenceNumber !== undefined && sequenceNumber !== currentChapter.sequence_number) {
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

    // Mark previous findings as stale if manuscript content has changed
    if (content !== currentChapter.content) {
      await query(
        'UPDATE chapter_analysis_findings SET is_stale = true WHERE chapter_id = $1',
        [chapterId]
      );
    }

    await query(
      `UPDATE chapters
       SET title = $1,
           sequence_number = COALESCE($2, sequence_number),
           summary = COALESCE($3, summary),
           content = $4,
           word_count = $5,
           version = $6,
           status = $7,
           updated_at = NOW()
       WHERE id = $8 AND universe_id = $9`,
      [title, sequenceNumber, summary, content, wordCount, newVersion, status, chapterId, universeId]
    );

    const updated = await query<Chapter>(
      'SELECT * FROM chapters WHERE id = $1 AND universe_id = $2',
      [chapterId, universeId]
    );

    // Automatic entity tracking upon save
    let entityTracking: { success: boolean; error?: string; retryable?: boolean; summary?: unknown } = {
      success: true,
    };
    try {
      const trackingRes = await processChapterEntityTracking({
        chapterId,
        universeId,
      });
      entityTracking = {
        success: true,
        summary: trackingRes.summary,
      };
    } catch (trackErr: unknown) {
      entityTracking = {
        success: false,
        error: trackErr instanceof Error ? trackErr.message : 'Entity detection error',
        retryable: true,
      };
    }

    return NextResponse.json({
      chapter: updated.rows[0],
      entityTracking,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update chapter';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
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
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}
