import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { getCurrentUser, getAuthErrorStatus, ForbiddenError, NotFoundError } from '@/lib/auth/session';
import { Chapter, Story } from '@/lib/db/types';
import { processChapterEntityTracking } from '@/lib/continuity/entity-tracker';

interface RouteParams {
  params: Promise<{ id: string; chapterId: string }>;
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
      throw new ForbiddenError('Unauthorized: canonical demo story is read-only');
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
    const { id: storyId, chapterId } = await params;

    await verifyStoryAccess(storyId, user.id, 'read');

    const res = await query<Chapter>(
      'SELECT * FROM chapters WHERE id = $1 AND story_id = $2 LIMIT 1',
      [chapterId, storyId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Chapter not found in this story');
    }

    return NextResponse.json({ chapter: res.rows[0] });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to retrieve chapter';
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id: storyId, chapterId } = await params;

    await verifyStoryAccess(storyId, user.id, 'write');
    const body = await request.json();

    const currentRes = await query<Chapter>(
      'SELECT * FROM chapters WHERE id = $1 AND story_id = $2 LIMIT 1',
      [chapterId, storyId]
    );

    if (currentRes.rows.length === 0) {
      throw new NotFoundError('Chapter not found in this story');
    }

    const current = currentRes.rows[0];

    // Optimistic Concurrency Control
    if (body.expected_version !== undefined && body.expected_version !== current.version) {
      return NextResponse.json(
        {
          error: `Save conflict: Manuscript was modified elsewhere (current version: ${current.version}, expected: ${body.expected_version}). Please refresh or review changes.`,
          currentChapter: current,
        },
        { status: 409 }
      );
    }

    const title = body.title !== undefined ? (body.title || '').trim() : current.title;
    if (!title) {
      return NextResponse.json({ error: 'Chapter title cannot be empty' }, { status: 400 });
    }

    const summary = body.summary !== undefined ? body.summary : current.summary;
    const content = body.content !== undefined ? body.content : current.content;
    const authorNotes = body.author_notes !== undefined ? body.author_notes : current.author_notes;
    const wordCount =
      body.word_count !== undefined
        ? body.word_count
        : content.trim().split(/\s+/).filter(Boolean).length;
    const status = body.status !== undefined ? body.status : current.status;
    const newVersion = current.version + 1;

    const updatedChapter = await transaction(async (client) => {
      const res = await client.query<Chapter>(
        `UPDATE chapters
         SET title = $1, summary = $2, content = $3, word_count = $4, version = $5, status = $6, author_notes = $7, updated_at = NOW()
         WHERE id = $8 AND story_id = $9
         RETURNING *`,
        [title, summary, content, wordCount, newVersion, status, authorNotes, chapterId, storyId]
      );

      await client.query('UPDATE stories SET updated_at = NOW() WHERE id = $1', [storyId]);
      return res.rows[0];
    });

    // Check if story is linked to a universe for entity tracking
    let targetUniverseId = updatedChapter.universe_id;
    if (!targetUniverseId) {
      const suRes = await query<{ universe_id: string }>(
        'SELECT universe_id FROM story_universes WHERE story_id = $1 LIMIT 1',
        [storyId]
      );
      if (suRes.rows.length > 0) {
        targetUniverseId = suRes.rows[0].universe_id;
      }
    }

    let entityTracking: { success: boolean; error?: string; retryable?: boolean; summary?: unknown } = {
      success: true,
    };
    if (targetUniverseId) {
      try {
        const trackingRes = await processChapterEntityTracking({
          chapterId,
          universeId: targetUniverseId,
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

    return NextResponse.json({ chapter: updatedChapter, entityTracking });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to update chapter';
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id: storyId, chapterId } = await params;

    await verifyStoryAccess(storyId, user.id, 'write');

    const chRes = await query<Chapter>(
      'SELECT * FROM chapters WHERE id = $1 AND story_id = $2 LIMIT 1',
      [chapterId, storyId]
    );

    if (chRes.rows.length === 0) {
      throw new NotFoundError('Chapter not found in this story');
    }

    await transaction(async (client) => {
      await client.query('DELETE FROM chapters WHERE id = $1 AND story_id = $2', [chapterId, storyId]);

      // Resequence remaining chapters
      const remaining = await client.query<Chapter>(
        'SELECT id FROM chapters WHERE story_id = $1 ORDER BY sequence_number ASC',
        [storyId]
      );

      for (let i = 0; i < remaining.rows.length; i++) {
        await client.query(
          'UPDATE chapters SET sequence_number = $1 WHERE id = $2',
          [i + 1, remaining.rows[i].id]
        );
      }

      await client.query('UPDATE stories SET updated_at = NOW() WHERE id = $1', [storyId]);
    });

    return NextResponse.json({ success: true, message: 'Chapter deleted and remaining chapters resequenced' });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to delete chapter';
    return NextResponse.json({ error: msg }, { status });
  }
}
