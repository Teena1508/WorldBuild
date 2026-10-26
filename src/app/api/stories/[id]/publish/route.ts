import { NextResponse } from 'next/server';
import { getCurrentUser, getAuthErrorStatus } from '@/lib/auth/session';
import {
  getStoryPublicationStatus,
  publishStory,
  PublishStoryInput,
} from '@/lib/publishing/service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id: storyId } = await params;

    const status = await getStoryPublicationStatus(user.id, storyId);
    return NextResponse.json(status);
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to retrieve publication status';
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id: storyId } = await params;

    const body = (await request.json().catch(() => ({}))) as PublishStoryInput;

    const result = await publishStory(user.id, storyId, body);
    return NextResponse.json({
      success: true,
      message: `Story successfully published at version ${result.publication.publication_version}`,
      publication: result.publication,
      publishedSnapshots: result.publishedSnapshots,
    });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 400);
    const msg = err instanceof Error ? err.message : 'Failed to publish story';
    return NextResponse.json({ error: msg }, { status });
  }
}
