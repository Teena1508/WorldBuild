import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query, transaction } from '@/lib/db';
import { getCurrentUser, getAuthErrorStatus, ForbiddenError, NotFoundError } from '@/lib/auth/session';
import { Chapter, Story } from '@/lib/db/types';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    let storyId = (body.story_id || '').trim();
    const createNewStory = Boolean(body.create_new_story);
    const storyTitle = (body.story_title || '').trim();

    if (createNewStory) {
      if (!storyTitle) {
        return NextResponse.json({ error: 'Story title is required when creating a new story' }, { status: 400 });
      }
      storyId = `story-${crypto.randomUUID()}`;
      await query(
        `INSERT INTO stories (id, user_id, title, description, status)
         VALUES ($1, $2, $3, $4, 'draft')`,
        [storyId, user.id, storyTitle, 'Imported manuscript story']
      );
    } else {
      if (!storyId) {
        return NextResponse.json({ error: 'Target story ID is required' }, { status: 400 });
      }
      const storyRes = await query<Story>('SELECT * FROM stories WHERE id = $1', [storyId]);
      if (storyRes.rows.length === 0) {
        throw new NotFoundError('Story not found');
      }
      const story = storyRes.rows[0];
      if (story.is_example) {
        throw new ForbiddenError('Unauthorized: cannot import into canonical demo story');
      }
      if (story.user_id !== user.id) {
        throw new ForbiddenError('Unauthorized: only the story author can import chapters');
      }
    }

    const filename = (body.filename || 'manuscript.txt').trim();
    const fileType = body.file_type || 'text';
    const fileSize = typeof body.file_size === 'number' ? body.file_size : 0;
    const contentHash = (body.content_hash || crypto.randomUUID()).trim();
    const rawChapters = Array.isArray(body.chapters) ? body.chapters : [];

    if (rawChapters.length === 0) {
      return NextResponse.json({ error: 'No chapters provided for import' }, { status: 400 });
    }

    // Check if the story has an associated universe
    const uRes = await query<{ universe_id: string }>(
      'SELECT universe_id FROM story_universes WHERE story_id = $1 LIMIT 1',
      [storyId]
    );
    const universeId = uRes.rows.length > 0 ? uRes.rows[0].universe_id : null;

    // Get current max sequence number in the story
    const maxSeqRes = await query<{ max_seq: number | null }>(
      'SELECT MAX(sequence_number) as max_seq FROM chapters WHERE story_id = $1',
      [storyId]
    );
    let startSeq = (maxSeqRes.rows[0]?.max_seq ?? 0) + 1;

    const importId = `imp-${crypto.randomUUID()}`;

    const { createdChapters, totalWords } = await transaction(async (client) => {
      let wordsSum = 0;
      const inserted: Chapter[] = [];

      for (const ch of rawChapters) {
        const title = (ch.title || `Chapter ${startSeq}`).trim();
        const content = typeof ch.content === 'string' ? ch.content : '';
        const summary = (ch.summary || '').trim() || 'Imported draft chapter.';
        const authorNotes = typeof ch.author_notes === 'string' ? ch.author_notes : '';
        const words = content.trim().split(/\s+/).filter(Boolean).length;
        wordsSum += words;

        const chapterId = `chap-${crypto.randomUUID()}`;

        const cRes = await client.query<Chapter>(
          `INSERT INTO chapters (
             id, universe_id, story_id, title, sequence_number, summary, content, word_count, version, status, author_notes
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 'draft', $9)
           RETURNING *`,
          [chapterId, universeId, storyId, title, startSeq++, summary, content, words, authorNotes]
        );

        inserted.push(cRes.rows[0]);
      }

      // Record manuscript import history
      await client.query(
        `INSERT INTO manuscript_imports (
           id, user_id, story_id, filename, file_type, file_size, content_hash, chapter_count, total_words, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'imported')`,
        [importId, user.id, storyId, filename, fileType, fileSize, contentHash, inserted.length, wordsSum]
      );

      await client.query('UPDATE stories SET updated_at = NOW() WHERE id = $1', [storyId]);

      return {
        createdChapters: inserted,
        totalWords: wordsSum,
      };
    });

    return NextResponse.json({
      success: true,
      import_id: importId,
      story_id: storyId,
      chapters_created: createdChapters.length,
      total_words: totalWords,
      chapters: createdChapters,
    }, { status: 201 });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to commit manuscript import';
    return NextResponse.json({ error: msg }, { status });
  }
}
