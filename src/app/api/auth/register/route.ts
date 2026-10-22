import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { AppUser } from '@/lib/db/types';
import { ensureDefaultUsers, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    await ensureDefaultUsers();
    const body = await request.json();
    const email = body.email?.trim().toLowerCase();
    const displayName = body.display_name?.trim() || body.displayName?.trim();

    if (!email || email.length === 0) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (!displayName || displayName.length === 0) {
      return NextResponse.json({ error: 'Display name / Scribe title is required' }, { status: 400 });
    }

    // Check if email already registered
    const existing = await query<AppUser>(
      'SELECT id, email, display_name, session_token FROM app_users WHERE LOWER(email) = $1',
      [email]
    );

    let user: AppUser;

    if (existing.rows.length > 0) {
      user = existing.rows[0];
    } else {
      const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
      const sessionToken = `tok-${crypto.randomUUID()}`;

      await query(
        'INSERT INTO app_users (id, email, display_name, session_token) VALUES ($1, $2, $3, $4)',
        [id, email, displayName, sessionToken]
      );

      const created = await query<AppUser>('SELECT * FROM app_users WHERE id = $1', [id]);
      user = created.rows[0];
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        created_at: user.created_at,
      },
      session_token: user.session_token,
    }, { status: existing.rows.length > 0 ? 200 : 201 });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: user.session_token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
