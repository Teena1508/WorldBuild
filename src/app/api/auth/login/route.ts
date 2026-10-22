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
    const userId = body.userId?.trim();

    if (!email && !userId) {
      return NextResponse.json(
        { error: 'Email or User ID is required to sign in' },
        { status: 400 }
      );
    }

    let user: AppUser | null = null;

    if (userId) {
      const res = await query<AppUser>('SELECT * FROM app_users WHERE id = $1', [userId]);
      if (res.rows.length > 0) {
        user = res.rows[0];
      }
    } else if (email) {
      const res = await query<AppUser>('SELECT * FROM app_users WHERE LOWER(email) = $1', [email]);
      if (res.rows.length > 0) {
        user = res.rows[0];
      }
    }

    if (!user) {
      // If user doesn't exist but an email was entered, check if display_name was provided or create on the fly
      if (email) {
        const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
        const displayName = body.displayName?.trim() || email.split('@')[0];
        const sessionToken = `tok-${crypto.randomUUID()}`;

        await query(
          'INSERT INTO app_users (id, email, display_name, session_token) VALUES ($1, $2, $3, $4)',
          [id, email, displayName, sessionToken]
        );

        const newRes = await query<AppUser>('SELECT * FROM app_users WHERE id = $1', [id]);
        user = newRes.rows[0];
      } else {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    }

    // Prepare response with HTTP-only cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        created_at: user.created_at,
      },
      session_token: user.session_token,
    });

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
    const message = error instanceof Error ? error.message : 'Login failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
