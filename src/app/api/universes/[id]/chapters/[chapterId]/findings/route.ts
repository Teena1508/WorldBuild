import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { ChapterAnalysisFinding } from '@/lib/db/types';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { id: universeId, chapterId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const res = await query<ChapterAnalysisFinding>(
      `SELECT * FROM chapter_analysis_findings
       WHERE chapter_id = $1 AND universe_id = $2
       ORDER BY created_at DESC`,
      [chapterId, universeId]
    );

    return NextResponse.json({ findings: res.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch chapter findings';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : (message.includes('Unauthorized') || message.includes('Forbidden') ? 403 : 500));
    return NextResponse.json({ error: message }, { status });
  }
}
