import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Location } from '@/lib/db/types';

interface LocationEventSummary {
  id: string;
  title: string;
  sequence_number: number;
  timestamp_year: number;
  description: string | null;
  participants_count: number;
}

interface LocationPresentCharacter {
  id: string;
  name: string;
  epithet: string | null;
  status: string;
  role: string | null;
  at_event_title: string;
  timestamp_year: number;
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string; locationId: string }> }
) {
  try {
    const { id: universeId, locationId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const locRes = await query<Location>(
      'SELECT * FROM locations WHERE id = $1 AND universe_id = $2',
      [locationId, universeId]
    );

    if (locRes.rows.length === 0) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    const location = locRes.rows[0];

    // Events at this location
    const eventsRes = await query<LocationEventSummary>(
      `SELECT e.id, e.title, e.sequence_number, e.timestamp_year, e.description,
        (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = e.id) as participants_count
       FROM events e
       WHERE e.location_id = $1 AND e.universe_id = $2
       ORDER BY e.timestamp_year ASC, e.sequence_number ASC`,
      [locationId, universeId]
    );

    // Characters recorded present at this location
    const presentCharsRes = await query<LocationPresentCharacter>(
      `SELECT DISTINCT c.id, c.name, c.epithet, c.status, ep.role, e.title as at_event_title, e.timestamp_year
       FROM event_participants ep
       JOIN events e ON ep.event_id = e.id
       JOIN characters c ON ep.character_id = c.id
       WHERE e.location_id = $1 AND e.universe_id = $2
       ORDER BY e.timestamp_year ASC`,
      [locationId, universeId]
    );

    return NextResponse.json({
      location,
      events: eventsRes.rows,
      present_characters: presentCharsRes.rows,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch location';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string; locationId: string }> }
) {
  try {
    const { id: universeId, locationId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const name = body.name?.trim();
    const realm = body.realm?.trim();
    const description = body.description?.trim();
    const coordinatesX = body.coordinates_x !== undefined && body.coordinates_x !== null && body.coordinates_x !== '' ? Number(body.coordinates_x) : null;
    const coordinatesY = body.coordinates_y !== undefined && body.coordinates_y !== null && body.coordinates_y !== '' ? Number(body.coordinates_y) : null;

    if (!name || name.length === 0) {
      return NextResponse.json({ error: 'Location name is required' }, { status: 400 });
    }
    if (!description || description.length === 0) {
      return NextResponse.json({ error: 'Location description is required' }, { status: 400 });
    }

    // Name uniqueness check if changed
    const nameCheck = await query(
      'SELECT id FROM locations WHERE universe_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3',
      [universeId, name, locationId]
    );
    if (nameCheck.rows.length > 0) {
      return NextResponse.json(
        { error: `Another location named "${name}" already exists in this universe` },
        { status: 400 }
      );
    }

    await query(
      `UPDATE locations
       SET name = $1, realm = COALESCE($2, realm), description = $3,
           coordinates_x = $4, coordinates_y = $5, updated_at = NOW()
       WHERE id = $6 AND universe_id = $7`,
      [name, realm, description, coordinatesX, coordinatesY, locationId, universeId]
    );

    const updated = await query<Location>(
      'SELECT * FROM locations WHERE id = $1 AND universe_id = $2',
      [locationId, universeId]
    );

    if (updated.rows.length === 0) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    return NextResponse.json({ location: updated.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update location';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; locationId: string }> }
) {
  try {
    const { id: universeId, locationId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const res = await query(
      'DELETE FROM locations WHERE id = $1 AND universe_id = $2 RETURNING id',
      [locationId, universeId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedLocationId: locationId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete location';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
