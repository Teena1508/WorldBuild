import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { AppUser } from '@/lib/db/types';
import {
  ensureDefaultUsers,
  createSession,
  verifyPassword,
  DEV_PERSONA_IDS,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/session';

// In-memory rate limiting and login abuse protection
interface AttemptRecord {
  count: number;
  resetAt: number;
}
const loginAttempts = new Map<string, AttemptRecord>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now > record.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + 5 * 60 * 1000 }); // 5 minutes window
    return true;
  }
  if (record.count >= 10) {
    return false;
  }
  record.count += 1;
  return true;
}

function clearRateLimit(key: string): void {
  loginAttempts.delete(key);
}

export async function POST(request: Request) {
  try {
    await ensureDefaultUsers();
    const body = await request.json();
    const email = body.email ? String(body.email).trim().toLowerCase() : undefined;
    const password = body.password ? String(body.password) : undefined;
    const userId = body.userId ? String(body.userId).trim() : undefined;

    // Rate-limiting check based on IP / email
    const clientIp = request.headers.get('x-forwarded-for') || 'local-client';
    const rateLimitKey = `${clientIp}:${email || userId || 'unknown'}`;
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: 'Too many failed login attempts. Please wait 5 minutes before trying again.' },
        { status: 429 }
      );
    }

    if (!email && !userId) {
      return NextResponse.json(
        { error: 'Email and password are required to sign in' },
        { status: 400 }
      );
    }

    let user: AppUser | null = null;

    // 1. Explicit Development / Persona quick switch handling
    if (userId) {
      if (process.env.NODE_ENV === 'production' || !DEV_PERSONA_IDS.includes(userId)) {
        return NextResponse.json(
          { error: 'Arbitrary user ID login is forbidden in production environments' },
          { status: 403 }
        );
      }

      const res = await query<AppUser>('SELECT * FROM app_users WHERE id = $1', [userId]);
      if (res.rows.length === 0) {
        return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
      }
      user = res.rows[0];
    } else if (email) {
      // 2. Standard Genuine User Authentication with Email & Password
      const res = await query<AppUser>(
        'SELECT * FROM app_users WHERE LOWER(email) = $1 LIMIT 1',
        [email]
      );

      if (res.rows.length === 0) {
        // Prevent account enumeration by returning a generic credential error
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      const candidateUser = res.rows[0];

      if (candidateUser.password_hash) {
        if (!password) {
          if (process.env.NODE_ENV === 'production') {
            return NextResponse.json(
              { error: 'Password is required to authenticate' },
              { status: 400 }
            );
          } else {
            // Development and test mode convenience when password is omitted in test scripts
            user = candidateUser;
          }
        } else {
          const isValid = await verifyPassword(password, candidateUser.password_hash);
          if (!isValid) {
            return NextResponse.json(
              { error: 'Invalid email or password' },
              { status: 401 }
            );
          }
          user = candidateUser;
        }
      } else {
        user = candidateUser;
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Login successful: reset rate limit
    clearRateLimit(rateLimitKey);

    // Issue genuine, cryptographically secure session token in database
    const sessionToken = await createSession(user.id);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        created_at: user.created_at,
      },
      session_token: sessionToken,
    });

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
    const message = error instanceof Error ? error.message : 'Login failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
