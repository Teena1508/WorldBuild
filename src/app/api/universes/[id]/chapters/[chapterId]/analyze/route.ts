import { NextResponse } from 'next/server';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { analyzeChapterManuscript } from '@/lib/ai/chapter-analysis';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { id: universeId, chapterId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const result = await analyzeChapterManuscript({
      universeId,
      chapterId,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Chapter analysis failed';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : (message.includes('Unauthorized') || message.includes('Forbidden') ? 403 : 500));
    return NextResponse.json({ error: message }, { status });
  }
}
