import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Location } from '@/lib/db/types';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: universeId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q')?.trim().toLowerCase();
    const realm = searchParams.get('realm')?.trim();

    let sql = `
      SELECT l.*,
        (SELECT COUNT(*)::int FROM events e WHERE e.location_id = l.id) as events_count,
        (SELECT COUNT(DISTINCT ep.character_id)::int FROM events e JOIN event_participants ep ON e.id = ep.event_id WHERE e.location_id = l.id) as characters_count
      FROM locations l
      WHERE l.universe_id = $1
    `;
    const params: unknown[] = [universeId];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (LOWER(l.name) LIKE $${params.length} OR LOWER(l.realm) LIKE $${params.length} OR LOWER(l.description) LIKE $${params.length})`;
    }

    if (realm && realm !== 'all') {
      params.push(realm);
      sql += ` AND l.realm = $${params.length}`;
    }

    sql += ` ORDER BY l.name ASC`;

    const res = await query<Location & { events_count: number; characters_count: number }>(sql, params);

    return NextResponse.json({ locations: res.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch locations';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: universeId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const name = body.name?.trim();
    const realm = body.realm?.trim() || 'Terrestrial Realm';
    const description = body.description?.trim();
    const coordinatesX = body.coordinates_x !== undefined && body.coordinates_x !== null && body.coordinates_x !== '' ? Number(body.coordinates_x) : null;
    const coordinatesY = body.coordinates_y !== undefined && body.coordinates_y !== null && body.coordinates_y !== '' ? Number(body.coordinates_y) : null;

    if (!name || name.length === 0) {
      return NextResponse.json({ error: 'Location name is required' }, { status: 400 });
    }
    if (!description || description.length === 0) {
      return NextResponse.json({ error: 'Location description is required' }, { status: 400 });
    }

    // Check unique location name in universe
    const existing = await query(
      'SELECT id FROM locations WHERE universe_id = $1 AND LOWER(name) = LOWER($2)',
      [universeId, name]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: `A location named "${name}" already exists in this universe` },
        { status: 400 }
      );
    }

    const locId = `loc-${crypto.randomUUID().slice(0, 12)}`;

    await query(
      `INSERT INTO locations (id, universe_id, name, realm, description, coordinates_x, coordinates_y, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [locId, universeId, name, realm, description, coordinatesX, coordinatesY]
    );

    const created = await query<Location>('SELECT * FROM locations WHERE id = $1', [locId]);

    return NextResponse.json({ location: created.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create location';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
