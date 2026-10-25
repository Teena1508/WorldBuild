import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { AppUser } from '@/lib/db/types';
import {
  ensureDefaultUsers,
  hashPassword,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/session';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    await ensureDefaultUsers();
    const body = await request.json();
    const email = body.email?.trim().toLowerCase();
    const displayName = body.display_name?.trim() || body.displayName?.trim();
    const password = body.password ? String(body.password) : undefined;

    // 1. Email validation
    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: 'A valid email address is required for registration' },
        { status: 400 }
      );
    }

    // 2. Display Name validation
    if (!displayName || displayName.length < 2) {
      return NextResponse.json(
        { error: 'A display name / Scribe title of at least 2 characters is required' },
        { status: 400 }
      );
    }

    // 3. Password validation
    if (password !== undefined && password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters in length' },
        { status: 400 }
      );
    }

    // 4. Unique email check
    const existing = await query<AppUser>(
      'SELECT id FROM app_users WHERE LOWER(email) = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'An account with this email address already exists. Please log in.' },
        { status: 409 }
      );
    }

    // 5. Create new account with hashed password
    const id = `usr-${crypto.randomUUID().slice(0, 10)}`;
    const passwordHash = await hashPassword(password || 'Sanctum2026!');
    const sessionToken = crypto.randomBytes(32).toString('hex');

    await query(
      `INSERT INTO app_users (id, email, display_name, password_hash, session_token)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, email, displayName, passwordHash, sessionToken]
    );

    const sessionId = `sess-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await query(
      `INSERT INTO user_sessions (id, user_id, session_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, id, sessionToken, expiresAt]
    );

    const createdRes = await query<AppUser>(
      'SELECT id, email, display_name, created_at FROM app_users WHERE id = $1',
      [id]
    );
    const user = createdRes.rows[0];

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          created_at: user.created_at,
        },
        session_token: sessionToken,
      },
      { status: 201 }
    );

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error: unknown) {
    console.error('Registration error caught:', error);
    const message = error instanceof Error ? error.message : 'Registration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
