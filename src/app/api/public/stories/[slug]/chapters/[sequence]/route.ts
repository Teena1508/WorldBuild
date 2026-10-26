import { NextResponse } from 'next/server';
import { getPublicChapter } from '@/lib/publishing/service';
import { getAuthErrorStatus } from '@/lib/auth/session';

interface RouteParams {
  params: Promise<{ slug: string; sequence: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { slug, sequence } = await params;
    const seqNum = parseInt(sequence, 10);

    if (isNaN(seqNum) || seqNum < 1) {
      return NextResponse.json({ error: 'Invalid chapter sequence number' }, { status: 400 });
    }

    const chapter = await getPublicChapter(slug, seqNum);
    return NextResponse.json({ chapter });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 404);
    const msg = err instanceof Error ? err.message : 'Chapter not found in this published story';
    return NextResponse.json({ error: msg }, { status });
  }
}
