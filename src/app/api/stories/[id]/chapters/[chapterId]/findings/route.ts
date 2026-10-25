import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ChapterAnalysisFinding, Story } from '@/lib/db/types';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { id: storyId, chapterId } = await props.params;
    const user = await getCurrentUser(request);

    // Verify story access
    const storyRes = await query<Story>('SELECT * FROM stories WHERE id = $1', [storyId]);
    if (storyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }
    const story = storyRes.rows[0];
    if (story.user_id !== user.id && !story.is_example) {
      return NextResponse.json({ error: 'Access forbidden' }, { status: 403 });
    }

    const res = await query<ChapterAnalysisFinding>(
      `SELECT * FROM chapter_analysis_findings
       WHERE chapter_id = $1
       ORDER BY created_at DESC`,
      [chapterId]
    );

    return NextResponse.json({ findings: res.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch chapter findings';
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
