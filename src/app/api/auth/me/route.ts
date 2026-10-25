import { NextResponse } from 'next/server';
import { getOptionalCurrentUser } from '@/lib/auth/session';

export async function GET(request: Request) {
  try {
    const user = await getOptionalCurrentUser(request);

    if (!user) {
      if (request.headers.get('x-require-auth') === 'true') {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        created_at: user.created_at,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve session';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
