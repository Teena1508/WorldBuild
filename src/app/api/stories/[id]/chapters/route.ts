import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getCurrentUser, getAuthErrorStatus, ForbiddenError, NotFoundError } from '@/lib/auth/session';
import { Chapter, Story } from '@/lib/db/types';
import { processChapterEntityTracking } from '@/lib/continuity/entity-tracker';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function verifyStoryAccess(storyId: string, userId: string, mode: 'read' | 'write' = 'read'): Promise<Story> {
  const storyRes = await query<Story>('SELECT * FROM stories WHERE id = $1', [storyId]);
  if (storyRes.rows.length === 0) {
    throw new NotFoundError('Story not found');
  }

  const story = storyRes.rows[0];

  if (mode === 'read') {
    if (story.user_id !== userId && !story.is_example) {
      throw new ForbiddenError('Access forbidden: personal story owned by another author');
    }
  } else {
    if (story.is_example) {
      throw new ForbiddenError('Unauthorized: canonical demo story is read-only. Duplicate or create your own story.');
    }
    if (story.user_id !== userId) {
      throw new ForbiddenError('Unauthorized: only the author can modify this story');
    }
  }

  return story;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id: storyId } = await params;

    await verifyStoryAccess(storyId, user.id, 'read');

    const res = await query<Chapter>(
      `SELECT * FROM chapters 
       WHERE story_id = $1 
       ORDER BY sequence_number ASC`,
      [storyId]
    );

    return NextResponse.json({ chapters: res.rows });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to retrieve story chapters';
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id: storyId } = await params;

    const story = await verifyStoryAccess(storyId, user.id, 'write');
    const body = await request.json();

    const title = (body.title || '').trim();
    if (!title) {
      return NextResponse.json({ error: 'Chapter title is required' }, { status: 400 });
    }

    const summary = (body.summary || '').trim() || 'Initial manuscript chapter draft.';
    const content = typeof body.content === 'string' ? body.content : '';
    const authorNotes = typeof body.author_notes === 'string' ? body.author_notes : '';
    const words = content.trim().split(/\s+/).filter(Boolean).length;

    // Check if the story has an associated universe
    const uRes = await query<{ universe_id: string }>(
      'SELECT universe_id FROM story_universes WHERE story_id = $1 LIMIT 1',
      [storyId]
    );
    const universeId = uRes.rows.length > 0 ? uRes.rows[0].universe_id : null;

    // Determine sequence number
    let sequenceNumber = body.sequence_number;
    if (typeof sequenceNumber !== 'number') {
      const maxSeq = await query<{ max_seq: number | null }>(
        'SELECT MAX(sequence_number) as max_seq FROM chapters WHERE story_id = $1',
        [storyId]
      );
      sequenceNumber = (maxSeq.rows[0]?.max_seq ?? 0) + 1;
    }

    const chapterId = `chap-${crypto.randomUUID()}`;

    const res = await query<Chapter>(
      `INSERT INTO chapters (
         id, universe_id, story_id, title, sequence_number, summary, content, word_count, version, status, author_notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 'draft', $9)
       RETURNING *`,
      [chapterId, universeId, storyId, title, sequenceNumber, summary, content, words, authorNotes]
    );

    // Update story updated_at
    await query('UPDATE stories SET updated_at = NOW() WHERE id = $1', [storyId]);

    let entityTracking: { success: boolean; error?: string; retryable?: boolean; summary?: unknown } = {
      success: true,
    };
    if (universeId) {
      try {
        const trackingRes = await processChapterEntityTracking({
          chapterId,
          universeId,
          storyId,
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
    }

    return NextResponse.json({ chapter: res.rows[0], entityTracking }, { status: 201 });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to create chapter';
    return NextResponse.json({ error: msg }, { status });
  }
}
