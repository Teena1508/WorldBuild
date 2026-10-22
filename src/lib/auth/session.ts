import { cookies, headers } from 'next/headers';
import { query } from '@/lib/db';
import { AppUser, Universe } from '@/lib/db/types';

export const SYSTEM_USER_ID = 'usr-system-sanctum';
export const DEFAULT_USER_ID = 'usr-archivist-prime';
export const DEFAULT_SESSION_TOKEN = 'tok-usr-archivist-prime';
export const SESSION_COOKIE_NAME = 'worldbuild_session_token';

/**
 * Ensures standard system users exist in the database.
 */
export async function ensureDefaultUsers(): Promise<void> {
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
      `INSERT INTO app_users (id, email, display_name, session_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, session_token = EXCLUDED.session_token`,
      [u.id, u.email, u.display_name, u.session_token]
    );
  }

  // Ensure exemplar demo universe is seeded
  const { ensureDefaultUniverses } = await import('@/lib/db/seed');
  await ensureDefaultUniverses();
}

/**
 * Retrieves the currently authenticated user from headers or cookies.
 * Fallbacks to the primary demo user for seamless out-of-the-box exploration.
 */
export async function getCurrentUser(request?: Request): Promise<AppUser> {
  await ensureDefaultUsers();

  let token: string | undefined;

  if (request) {
    token = request.headers.get('x-session-token') || undefined;
    if (!token) {
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
        if (match) token = decodeURIComponent(match[1]);
      }
    }
  }

  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      // In environments where cookies() is unavailable (e.g. some script executions)
    }
  }

  if (!token) {
    try {
      const headerStore = await headers();
      token = headerStore.get('x-session-token') || undefined;
    } catch {
      // ignore
    }
  }

  if (!token) {
    token = DEFAULT_SESSION_TOKEN;
  }

  const res = await query<AppUser>(
    'SELECT * FROM app_users WHERE session_token = $1 LIMIT 1',
    [token]
  );

  if (res.rows.length > 0) {
    return res.rows[0];
  }

  // Fallback to default user
  const fallback = await query<AppUser>(
    'SELECT * FROM app_users WHERE id = $1 LIMIT 1',
    [DEFAULT_USER_ID]
  );
  return fallback.rows[0];
}

/**
 * Verifies that the user has authorization for a given universe.
 * If allowExampleReadOnly is true, permits read access if universe is an example.
 */
export async function verifyUniverseAccess(
  universeId: string,
  userId: string,
  mode: 'read' | 'write' = 'read'
): Promise<Universe> {
  const res = await query<Universe>(
    'SELECT * FROM universes WHERE id = $1',
    [universeId]
  );

  if (res.rows.length === 0) {
    throw new Error('Universe not found');
  }

  const universe = res.rows[0];

  if (mode === 'read') {
    if (universe.is_example || universe.user_id === userId) {
      return universe;
    }
    throw new Error('Unauthorized access to universe');
  }

  if (mode === 'write') {
    if (universe.is_example) {
      throw new Error('Unauthorized: canonical demo universe is read-only. Duplicate it to make edits.');
    }

    if (universe.user_id !== userId) {
      throw new Error('Unauthorized: only the universe owner can perform modifications');
    }
  }

  return universe;
}
