import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query, transaction } from '@/lib/db';
import { getCurrentUser, getAuthErrorStatus } from '@/lib/auth/session';
import { Story } from '@/lib/db/types';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const universeId = searchParams.get('universe_id');
    const seriesId = searchParams.get('series_id');

    let sql = `
      SELECT 
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
      WHERE (s.user_id = $1 OR s.is_example = true)
    `;
    const params: unknown[] = [user.id];

    if (universeId) {
      params.push(universeId);
      sql += ` AND s.id IN (SELECT story_id FROM story_universes WHERE universe_id = $${params.length})`;
    }

    if (seriesId) {
      params.push(seriesId);
      sql += ` AND s.series_id = $${params.length}`;
    }

    sql += ` ORDER BY s.updated_at DESC`;

    const res = await query<Story>(sql, params);

    // Fetch linked universes for each story
    const storiesWithUniverses = await Promise.all(
      res.rows.map(async (story) => {
        const uRes = await query<{ id: string; title: string }>(
          `SELECT u.id, u.title 
           FROM story_universes su
           JOIN universes u ON su.universe_id = u.id
           WHERE su.story_id = $1`,
          [story.id]
        );
        return {
          ...story,
          linked_universes: uRes.rows,
        };
      })
    );

    return NextResponse.json({ stories: storiesWithUniverses });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to retrieve stories';
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const title = (body.title || '').trim();
    if (!title) {
      return NextResponse.json({ error: 'Story title is required' }, { status: 400 });
    }

    const description = (body.description || '').trim();
    const coverUrl = body.cover_url || null;
    const seriesId = body.series_id || null;
    const seriesOrder = typeof body.series_order === 'number' ? body.series_order : null;
    const authorNotes = (body.author_notes || '').trim();
    const slug = (body.slug || '').trim().toLowerCase() || null;
    const genres = (body.genres || '').trim();
    const tags = (body.tags || '').trim();
    const universeIds: string[] = Array.isArray(body.universe_ids) ? body.universe_ids : [];

    const storyId = `story-${crypto.randomUUID()}`;

    const createdStory = await transaction(async (client) => {
      // 1. Insert story
      const res = await client.query<Story>(
        `INSERT INTO stories (id, user_id, series_id, series_order, title, slug, description, cover_url, genres, tags, author_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [storyId, user.id, seriesId, seriesOrder, title, slug, description, coverUrl, genres, tags, authorNotes]
      );

      // 2. Insert universe associations
      for (const uId of universeIds) {
        // Verify user has access to this universe
        const uCheck = await client.query('SELECT id FROM universes WHERE id = $1 AND (user_id = $2 OR is_example = true)', [uId, user.id]);
        if (uCheck.rows.length > 0) {
          await client.query(
            `INSERT INTO story_universes (story_id, universe_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [storyId, uId]
          );
        }
      }

      // 3. Auto-seed Chapter 1 when requested (e.g. from Story Studio UI)
      if (body.auto_seed_chapter === true) {
        const chapterId = `chap-${crypto.randomUUID()}`;
        const primaryUniverseId = universeIds[0] || null;
        await client.query(
          `INSERT INTO chapters (id, universe_id, story_id, sequence_number, title, summary, content, author_notes, word_count, version)
           VALUES ($1, $2, $3, 1, 'Chapter 1: The Beginning', '', '', '', 0, 1)`,
          [chapterId, primaryUniverseId, storyId]
        );
      }

      return res.rows[0];
    });

    return NextResponse.json({ story: createdStory }, { status: 201 });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to create story';
    return NextResponse.json({ error: msg }, { status });
  }
}
