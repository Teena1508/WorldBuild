import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { getCurrentUser, getAuthErrorStatus, ForbiddenError, NotFoundError } from '@/lib/auth/session';
import { Chapter, Story } from '@/lib/db/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id: storyId } = await params;

    const storyRes = await query<Story>('SELECT * FROM stories WHERE id = $1', [storyId]);
    if (storyRes.rows.length === 0) {
      throw new NotFoundError('Story not found');
    }

    const story = storyRes.rows[0];
    if (story.is_example) {
      throw new ForbiddenError('Unauthorized: canonical demo story is read-only');
    }
    if (story.user_id !== user.id) {
      throw new ForbiddenError('Unauthorized: only the author can reorder chapters');
    }

    const body = await request.json();
    const chapterIds: string[] = body.chapterIds || body.orderedIds;

    if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
      return NextResponse.json({ error: 'Array of chapter IDs is required' }, { status: 400 });
    }

    // Verify all chapters belong to this story
    const existing = await query<Chapter>('SELECT id FROM chapters WHERE story_id = $1', [storyId]);
    const existingMap = new Set(existing.rows.map((r) => r.id));

    for (const cId of chapterIds) {
      if (!existingMap.has(cId)) {
        return NextResponse.json(
          { error: `Chapter ${cId} does not belong to story ${storyId}` },
          { status: 400 }
        );
      }
    }

    const updatedChapters = await transaction(async (client) => {
      // Offset sequence numbers first to avoid unique constraint collisions while respecting sequence_number >= 0
      for (let i = 0; i < chapterIds.length; i++) {
        await client.query('UPDATE chapters SET sequence_number = $1 WHERE id = $2', [
          100000 + i + 1,
          chapterIds[i],
        ]);
      }

      // Assign new 1-indexed sequences
      for (let i = 0; i < chapterIds.length; i++) {
        await client.query('UPDATE chapters SET sequence_number = $1 WHERE id = $2', [
          i + 1,
          chapterIds[i],
        ]);
      }

      await client.query('UPDATE stories SET updated_at = NOW() WHERE id = $1', [storyId]);

      const res = await client.query<Chapter>(
        'SELECT * FROM chapters WHERE story_id = $1 ORDER BY sequence_number ASC',
        [storyId]
      );
      return res.rows;
    });

    return NextResponse.json({ chapters: updatedChapters });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to reorder chapters';
    return NextResponse.json({ error: msg }, { status });
  }
}
