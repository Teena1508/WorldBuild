import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { query } from '@/lib/db';
import { AppUser, Universe, UserSession } from '@/lib/db/types';

export const SYSTEM_USER_ID = 'usr-system-sanctum';
export const DEFAULT_USER_ID = 'usr-archivist-prime';
export const DEFAULT_SESSION_TOKEN = 'tok-usr-archivist-prime';
export const DEMO_UNIVERSE_ID = 'univ-demo-aethelgard';
export const SESSION_COOKIE_NAME = 'worldbuild_session_token';

// Recognized developer persona IDs for explicit local development persona switching
export const DEV_PERSONA_IDS = [
  'usr-archivist-prime',
  'usr-novice-chronicler',
  'usr-test-archivist',
];

export class AuthenticationError extends Error {
  status = 401;
  constructor(message = 'Authentication required. Please sign in.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = 'Access forbidden: insufficient permissions') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  status = 404;
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Creates a cryptographically secure, unpredictable session token
 * and stores it in the user_sessions table with expiration.
 */
export async function createSession(userId: string): Promise<string> {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const sessionId = `sess-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await query(
    `INSERT INTO user_sessions (id, user_id, session_token, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, userId, sessionToken, expiresAt]
  );

  // Synchronize app_users.session_token for backward compatibility
  await query(
    'UPDATE app_users SET session_token = $1 WHERE id = $2',
    [sessionToken, userId]
  );

  return sessionToken;
}

/**
 * Invalidates a session token on the server and in the database.
 */
export async function invalidateSession(token: string): Promise<void> {
  if (!token) return;
  await query('DELETE FROM user_sessions WHERE session_token = $1', [token]);
  await query("UPDATE app_users SET session_token = 'invalidated-' || id WHERE session_token = $1", [token]);
}

/**
 * Ensures standard system users exist in the database with hashed passwords.
 */
export async function ensureDefaultUsers(): Promise<void> {
  const defaultPasswordHash = await hashPassword('Sanctum2026!');
  const users = [
    {
      id: SYSTEM_USER_ID,
      email: 'system@worldbuild.sanctum',
      display_name: 'Sanctum Keeper (System)',
      session_token: 'tok-usr-system-sanctum',
    },
    {
      id: 'usr-archivist-prime',
      email: 'archivist@worldbuild.sanctum',
      display_name: 'High Scribe',
      session_token: 'tok-usr-archivist-prime',
    },
    {
      id: 'usr-novice-chronicler',
      email: 'novice@worldbuild.sanctum',
      display_name: 'Novice Chronicler',
      session_token: 'tok-usr-novice-chronicler',
    },
    {
      id: 'usr-test-archivist',
      email: 'test@worldbuild.test',
      display_name: 'Test Scribe',
      session_token: 'tok-test-12345',
    },
  ];

  for (const u of users) {
    await query(
      `INSERT INTO app_users (id, email, display_name, session_token, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         session_token = EXCLUDED.session_token,
         password_hash = COALESCE(app_users.password_hash, EXCLUDED.password_hash)`,
      [u.id, u.email, u.display_name, u.session_token, defaultPasswordHash]
    );

    // Seed session records with 30-day expiration
    await query(
      `INSERT INTO user_sessions (id, user_id, session_token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')
       ON CONFLICT (session_token) DO UPDATE SET expires_at = NOW() + INTERVAL '30 days'`,
      [`sess-${u.id}`, u.id, u.session_token]
    );
  }

  // Ensure exemplar demo universe is seeded
  const { ensureDefaultUniverses } = await import('@/lib/db/seed');
  await ensureDefaultUniverses();
}

/**
 * Extracts session token from headers, authorization bearer, or cookies.
 */
export async function getSessionTokenFromRequest(request?: Request): Promise<string | undefined> {
  let token: string | undefined;

  if (request) {
    token = request.headers.get('x-session-token') || undefined;

    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    }

    if (!token) {
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
        if (match) token = decodeURIComponent(match[1]);
      }
    }
  }

  if (!token && process.env.NODE_ENV !== 'test') {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      // In environments where cookies() is unavailable (e.g. some script executions)
    }
  }

  if (!token && process.env.NODE_ENV !== 'test') {
    try {
      const headerStore = await headers();
      token = headerStore.get('x-session-token') || undefined;
      if (!token) {
        const auth = headerStore.get('authorization');
        if (auth && auth.startsWith('Bearer ')) {
          token = auth.substring(7).trim();
        }
      }
    } catch {
      // ignore
    }
  }

  return token;
}

/**
 * Validates a session token against the user_sessions and app_users tables.
 * Enforces session expiration.
 */
export async function validateSessionToken(token: string): Promise<AppUser | null> {
  if (!token || typeof token !== 'string') return null;

  // First check user_sessions with expiry enforcement
  const sessRes = await query<UserSession & { email: string; display_name: string; user_created_at: string }>(
    `SELECT s.*, u.email, u.display_name, u.created_at as user_created_at
     FROM user_sessions s
     JOIN app_users u ON s.user_id = u.id
     WHERE s.session_token = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [token]
  );

  if (sessRes.rows.length > 0) {
    const s = sessRes.rows[0];
    // Touch last_used_at in background
    query('UPDATE user_sessions SET last_used_at = NOW() WHERE id = $1', [s.id]).catch(() => {});
    return {
      id: s.user_id,
      email: s.email,
      display_name: s.display_name,
      session_token: s.session_token,
      created_at: s.user_created_at,
    };
  }

  // Fallback check on app_users.session_token for existing test seed tokens
  if (!token.startsWith('invalidated-')) {
    const userRes = await query<AppUser>(
      'SELECT id, email, display_name, session_token, created_at FROM app_users WHERE session_token = $1 LIMIT 1',
      [token]
    );
    if (userRes.rows.length > 0) {
      return userRes.rows[0];
    }
  }

  return null;
}

/**
 * Returns the currently authenticated user if a valid session exists, or null.
 * Never falls back to a default identity in production.
 */
export async function getOptionalCurrentUser(request?: Request): Promise<AppUser | null> {
  await ensureDefaultUsers();

  const token = await getSessionTokenFromRequest(request);

  if (token) {
    // If a token was provided, validate it strictly.
    const user = await validateSessionToken(token);
    if (user) {
      return user;
    }
    return null;
  }

  // If no token at all was provided:
  // Explicit unauthenticated mode in tests or API calls
  if (
    request?.headers.get('x-unauthenticated') === 'true' ||
    request?.headers.get('x-session-token') === 'anonymous' ||
    request?.headers.get('x-session-token') === '' ||
    process.env.WORLDBUILD_DEV_FALLBACK === 'false'
  ) {
    return null;
  }

  // Automated test suite backwards compatibility (vault.test.ts, workspace.test.ts)
  if (process.env.NODE_ENV === 'test' || process.env.PG_IN_MEMORY === 'true') {
    const fallback = await query<AppUser>(
      'SELECT id, email, display_name, session_token, created_at FROM app_users WHERE id = $1 LIMIT 1',
      [DEFAULT_USER_ID]
    );
    return fallback.rows[0] || null;
  }

  // In development and production, visitors are unauthenticated guests by default
  return null;
}

/**
 * Retrieves the currently authenticated user. Throws AuthenticationError if not authenticated.
 */
export async function getCurrentUser(request?: Request): Promise<AppUser> {
  const user = await getOptionalCurrentUser(request);
  if (!user) {
    throw new AuthenticationError('Authentication required. Please sign in to access this resource.');
  }
  return user;
}

/**
 * Verifies that the user has authorization for a given universe.
 * If mode is 'read' and universe is an example, permits access even for unauthenticated visitors.
 * If mode is 'write', verifies that the universe is personal and owned by userId.
 */
export async function verifyUniverseAccess(
  universeId: string,
  userId?: string | null,
  mode: 'read' | 'write' = 'read'
): Promise<Universe> {
  const res = await query<Universe>(
    'SELECT * FROM universes WHERE id = $1',
    [universeId]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError('Universe not found');
  }

  const universe = res.rows[0];

  if (mode === 'read') {
    if (universe.is_example) {
      return universe;
    }
    if (!userId) {
      throw new AuthenticationError('Authentication required to access personal universe');
    }
    if (universe.user_id !== userId) {
      throw new ForbiddenError('Access forbidden: personal universe owned by another user');
    }
    return universe;
  }

  if (mode === 'write') {
    if (universe.is_example) {
      throw new ForbiddenError('Unauthorized: canonical demo universe is read-only. Duplicate it to make edits.');
    }
    if (!userId) {
      throw new AuthenticationError('Authentication required to modify universe');
    }
    if (universe.user_id !== userId) {
      throw new ForbiddenError('Unauthorized: only the universe owner can perform modifications');
    }
  }

  return universe;
}

export function getAuthErrorStatus(error: unknown, defaultStatus = 403): number {
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof NotFoundError) return 404;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (msg.includes('authentication') || msg.includes('sign in')) return 401;
  if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('read-only') || msg.includes('only the universe owner')) return 403;
  if (msg.includes('not found')) return 404;
  return defaultStatus;
}
