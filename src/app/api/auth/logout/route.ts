import { NextResponse } from 'next/server';
import {
  getSessionTokenFromRequest,
  invalidateSession,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/session';

export async function POST(request?: Request) {
  try {
    const token = await getSessionTokenFromRequest(request);
    if (token) {
      await invalidateSession(token);
    }

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully; session invalidated',
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Logout failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
