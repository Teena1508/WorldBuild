import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { query } from '@/lib/db';
import { Story } from '@/lib/db/types';
import { analyzeChapterManuscript } from '@/lib/ai/chapter-analysis';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { id: storyId, chapterId } = await props.params;
    const user = await getCurrentUser(request);

    // Verify user has access to story
    const storyRes = await query<Story>('SELECT * FROM stories WHERE id = $1', [storyId]);
    if (storyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }
    const story = storyRes.rows[0];
    if (story.user_id !== user.id && !story.is_example) {
      return NextResponse.json({ error: 'Access forbidden: not story author' }, { status: 403 });
    }

    const result = await analyzeChapterManuscript({
      storyId,
      chapterId,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Chapter analysis failed';
    const status = message.includes('Authentication')
      ? 401
      : message.includes('not found')
      ? 404
      : message.includes('Unauthorized') || message.includes('Forbidden')
      ? 403
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
