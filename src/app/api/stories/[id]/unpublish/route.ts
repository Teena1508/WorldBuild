import { NextResponse } from 'next/server';
import { getCurrentUser, getAuthErrorStatus } from '@/lib/auth/session';
import { unpublishStory } from '@/lib/publishing/service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id: storyId } = await params;

    await unpublishStory(user.id, storyId);
    return NextResponse.json({
      success: true,
      message: 'Story has been unpublished and withdrawn from public discovery',
    });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 400);
    const msg = err instanceof Error ? err.message : 'Failed to unpublish story';
    return NextResponse.json({ error: msg }, { status });
  }
}
