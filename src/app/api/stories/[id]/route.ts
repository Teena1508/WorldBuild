import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { getCurrentUser, getAuthErrorStatus, ForbiddenError, NotFoundError } from '@/lib/auth/session';
import { Story } from '@/lib/db/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;

    const res = await query<Story>(
      `SELECT 
        s.*,
        ser.title as series_title,
        COALESCE(ch_stats.chapters_count, 0)::int as chapters_count,
        COALESCE(ch_stats.total_words, 0)::int as total_words
      FROM stories s
      LEFT JOIN series ser ON s.series_id = ser.id
      LEFT JOIN (
        SELECT 
          story_id,
          COUNT(*)::int as chapters_count,
          SUM(word_count)::int as total_words
        FROM chapters
        WHERE story_id IS NOT NULL
        GROUP BY story_id
      ) ch_stats ON s.id = ch_stats.story_id
      WHERE s.id = $1
      LIMIT 1`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Story not found');
    }

    const story = res.rows[0];

    // Ownership check: must be owner or an example story
    if (story.user_id !== user.id && !story.is_example) {
      throw new ForbiddenError('Access forbidden: personal story owned by another author');
    }

    // Get linked universes
    const uRes = await query<{ id: string; title: string }>(
      `SELECT u.id, u.title 
       FROM story_universes su
       JOIN universes u ON su.universe_id = u.id
       WHERE su.story_id = $1`,
      [id]
    );

    return NextResponse.json({
      story: {
        ...story,
        linked_universes: uRes.rows,
      },
    });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to retrieve story';
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;
    const body = await request.json();

    const storyRes = await query<Story>('SELECT * FROM stories WHERE id = $1', [id]);
    if (storyRes.rows.length === 0) {
      throw new NotFoundError('Story not found');
    }

    const existing = storyRes.rows[0];
    if (existing.is_example) {
      throw new ForbiddenError('Unauthorized: canonical demo story is read-only. Duplicate or create your own story.');
    }
    if (existing.user_id !== user.id) {
      throw new ForbiddenError('Unauthorized: only the author can modify this story');
    }

    const title = body.title !== undefined ? (body.title || '').trim() : existing.title;
    if (!title) {
      return NextResponse.json({ error: 'Story title cannot be empty' }, { status: 400 });
    }

    const description = body.description !== undefined ? body.description : existing.description;
    const coverUrl = body.cover_url !== undefined ? body.cover_url : existing.cover_url;
    const seriesId = body.series_id !== undefined ? body.series_id : existing.series_id;
    const seriesOrder = body.series_order !== undefined ? body.series_order : existing.series_order;
    const authorNotes = body.author_notes !== undefined ? body.author_notes : existing.author_notes;
    const universeIds: string[] | undefined = Array.isArray(body.universe_ids) ? body.universe_ids : undefined;

    const updatedStory = await transaction(async (client) => {
      const res = await client.query<Story>(
        `UPDATE stories
         SET title = $1, description = $2, cover_url = $3, series_id = $4, series_order = $5, author_notes = $6, updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [title, description, coverUrl, seriesId, seriesOrder, authorNotes, id]
      );

      if (universeIds !== undefined) {
        await client.query('DELETE FROM story_universes WHERE story_id = $1', [id]);
        for (const uId of universeIds) {
          const uCheck = await client.query('SELECT id FROM universes WHERE id = $1 AND (user_id = $2 OR is_example = true)', [uId, user.id]);
          if (uCheck.rows.length > 0) {
            await client.query(
              `INSERT INTO story_universes (story_id, universe_id)
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [id, uId]
            );
          }
        }
      }

      return res.rows[0];
    });

    return NextResponse.json({ story: updatedStory });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to update story';
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;

    const storyRes = await query<Story>('SELECT * FROM stories WHERE id = $1', [id]);
    if (storyRes.rows.length === 0) {
      throw new NotFoundError('Story not found');
    }

    const existing = storyRes.rows[0];
    if (existing.is_example) {
      throw new ForbiddenError('Unauthorized: canonical demo story cannot be deleted');
    }
    if (existing.user_id !== user.id) {
      throw new ForbiddenError('Unauthorized: only the author can delete this story');
    }

    await query('DELETE FROM stories WHERE id = $1', [id]);

    return NextResponse.json({ success: true, message: 'Story deleted successfully' });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to delete story';
    return NextResponse.json({ error: msg }, { status });
  }
}
