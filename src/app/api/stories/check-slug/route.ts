import { NextResponse } from 'next/server';
import { getCurrentUser, getAuthErrorStatus } from '@/lib/auth/session';
import { isSlugAvailable, isValidSlug, generateSlug } from '@/lib/publishing/slug';

export async function GET(request: Request) {
  try {
    await getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const rawSlug = searchParams.get('slug') || '';
    const excludeStoryId = searchParams.get('story_id') || undefined;

    const slug = generateSlug(rawSlug);
    const valid = isValidSlug(slug);

    if (!valid) {
      return NextResponse.json({
        slug,
        valid: false,
        available: false,
        reason: 'Slug must contain 2-100 alphanumeric characters and hyphens without leading or trailing dashes',
      });
    }

    const available = await isSlugAvailable(slug, excludeStoryId);
    return NextResponse.json({
      slug,
      valid: true,
      available,
      reason: available ? 'Slug is available' : 'This slug is already in use by another published work',
    });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 400);
    const msg = err instanceof Error ? err.message : 'Failed to check slug';
    return NextResponse.json({ error: msg }, { status });
  }
}
