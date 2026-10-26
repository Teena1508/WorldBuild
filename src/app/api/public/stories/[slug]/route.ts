import { NextResponse } from 'next/server';
import { getPublicStoryBySlug } from '@/lib/publishing/service';
import { getAuthErrorStatus } from '@/lib/auth/session';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const story = await getPublicStoryBySlug(slug);

    return NextResponse.json({ story });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 404);
    const msg = err instanceof Error ? err.message : 'Story not found or not published';
    return NextResponse.json({ error: msg }, { status });
  }
}
