import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getCurrentUser, getOptionalCurrentUser, AuthenticationError } from '@/lib/auth/session';
import { Universe } from '@/lib/db/types';

interface UniverseRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  cover_url: string | null;
  is_example: boolean;
  created_at: string;
  updated_at: string;
  char_count: number;
  loc_count: number;
  chap_count: number;
  event_count: number;
  rel_count: number;
  sec_count: number;
  open_findings_count: number;
}

export async function GET(request: Request) {
  try {
    const user = await getOptionalCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q')?.trim().toLowerCase();
    const scope = searchParams.get('scope')?.trim().toLowerCase();

    // If scope is explicitly personal and user is not authenticated, reject
    if (scope === 'personal' && !user) {
      return NextResponse.json(
        { error: 'Authentication required to view personal universes' },
        { status: 401 }
      );
    }

    let whereClause = user
      ? '(u.user_id = $1 OR u.is_example = true)'
      : 'u.is_example = true';

    if (scope === 'personal' && user) {
      whereClause = '(u.user_id = $1 AND u.is_example = false)';
    } else if (scope === 'demo') {
      whereClause = 'u.is_example = true';
    }

    let sql = `
      SELECT u.*,
        (SELECT COUNT(*)::int FROM characters c WHERE c.universe_id = u.id) as char_count,
        (SELECT COUNT(*)::int FROM locations l WHERE l.universe_id = u.id) as loc_count,
        (SELECT COUNT(*)::int FROM chapters ch WHERE ch.universe_id = u.id) as chap_count,
        (SELECT COUNT(*)::int FROM events e WHERE e.universe_id = u.id) as event_count,
        (SELECT COUNT(*)::int FROM relationships r WHERE r.universe_id = u.id) as rel_count,
        (SELECT COUNT(*)::int FROM secrets s WHERE s.universe_id = u.id) as sec_count,
        (SELECT COUNT(*)::int FROM continuity_findings cf WHERE cf.universe_id = u.id AND cf.status = 'open') as open_findings_count
      FROM universes u
      WHERE ${whereClause}
    `;

    const params: unknown[] = [];
    if (user && whereClause.includes('$1')) {
      params.push(user.id);
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (LOWER(u.title) LIKE $${params.length} OR LOWER(u.description) LIKE $${params.length})`;
    }

    sql += ` ORDER BY u.is_example DESC, u.updated_at DESC`;

    const res = await query<UniverseRow>(sql, params);

    const universes = res.rows.map((row): Universe => ({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      description: row.description,
      cover_url: row.cover_url,
      is_example: Boolean(row.is_example),
      created_at: row.created_at,
      updated_at: row.updated_at,
      stats: {
        charactersCount: row.char_count || 0,
        locationsCount: row.loc_count || 0,
        chaptersCount: row.chap_count || 0,
        eventsCount: row.event_count || 0,
        relationshipsCount: row.rel_count || 0,
        secretsCount: row.sec_count || 0,
        openFindingsCount: row.open_findings_count || 0,
      },
    }));

    const personalUniverses = user
      ? universes.filter((u) => !u.is_example && u.user_id === user.id)
      : [];
    const demoUniverses = universes.filter((u) => u.is_example);
    const demoUniverse = demoUniverses[0] || null;

    return NextResponse.json({
      user: user
        ? {
            id: user.id,
            displayName: user.display_name,
            email: user.email,
          }
        : null,
      universes,
      personalUniverses,
      demoUniverse,
      counts: {
        total: universes.length,
        personal: personalUniverses.length,
        demo: demoUniverses.length,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch universes';
    console.error('Error fetching universes:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const title = body.title?.trim();
    const description = body.description?.trim();
    const coverUrl = body.cover_url?.trim() || null;

    if (!title || title.length === 0) {
      return NextResponse.json(
        { error: 'Universe title is required' },
        { status: 400 }
      );
    }

    if (title.length > 255) {
      return NextResponse.json(
        { error: 'Universe title must be 255 characters or fewer' },
        { status: 400 }
      );
    }

    if (!description || description.length === 0) {
      return NextResponse.json(
        { error: 'Universe description is required' },
        { status: 400 }
      );
    }

    const universeId = `univ-${crypto.randomUUID().slice(0, 12)}`;

    await query(
      `INSERT INTO universes (id, user_id, title, description, cover_url, is_example, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())`,
      [universeId, user.id, title, description, coverUrl]
    );

    const created = await query<Universe>(
      'SELECT * FROM universes WHERE id = $1',
      [universeId]
    );

    return NextResponse.json({
      universe: {
        ...created.rows[0],
        stats: {
          charactersCount: 0,
          locationsCount: 0,
          chaptersCount: 0,
          eventsCount: 0,
          relationshipsCount: 0,
          secretsCount: 0,
          openFindingsCount: 0,
        },
      },
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'Failed to create universe';
    console.error('Error creating universe:', error);
    return NextResponse.json(
      { error: message },
      { status: message.includes('Authentication') ? 401 : 500 }
    );
  }
}
