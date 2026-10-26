import { NextResponse } from 'next/server';
import { searchPublicStories } from '@/lib/publishing/service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const q = searchParams.get('q') || undefined;
    const genre = searchParams.get('genre') || undefined;
    const tag = searchParams.get('tag') || undefined;
    const author = searchParams.get('author') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '12', 10);
    const sort = (searchParams.get('sort') || 'recent') as 'recent' | 'popular' | 'alpha';

    const result = await searchPublicStories({
      q,
      genre,
      tag,
      author,
      page,
      limit,
      sort,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query published stories';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
