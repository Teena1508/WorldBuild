import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Universe } from '@/lib/db/types';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: universeId } = await props.params;
    const user = await getCurrentUser(request);
    const universe = await verifyUniverseAccess(universeId, user.id, 'read');

    interface StatsRow {
      char_count: number;
      loc_count: number;
      chap_count: number;
      event_count: number;
      rel_count: number;
      sec_count: number;
      open_findings_count: number;
    }

    const statsRes = await query<StatsRow>(
      `SELECT
        (SELECT COUNT(*)::int FROM characters WHERE universe_id = $1) as char_count,
        (SELECT COUNT(*)::int FROM locations WHERE universe_id = $1) as loc_count,
        (SELECT COUNT(*)::int FROM chapters WHERE universe_id = $1) as chap_count,
        (SELECT COUNT(*)::int FROM events WHERE universe_id = $1) as event_count,
        (SELECT COUNT(*)::int FROM relationships WHERE universe_id = $1) as rel_count,
        (SELECT COUNT(*)::int FROM secrets WHERE universe_id = $1) as sec_count,
        (SELECT COUNT(*)::int FROM continuity_findings WHERE universe_id = $1 AND status = 'open') as open_findings_count
      `,
      [universeId]
    );

    const statsRow = statsRes.rows[0] || {
      char_count: 0,
      loc_count: 0,
      chap_count: 0,
      event_count: 0,
      rel_count: 0,
      sec_count: 0,
      open_findings_count: 0,
    };
    const populatedUniverse: Universe = {
      ...universe,
      is_example: Boolean(universe.is_example),
      stats: {
        charactersCount: statsRow.char_count || 0,
        locationsCount: statsRow.loc_count || 0,
        chaptersCount: statsRow.chap_count || 0,
        eventsCount: statsRow.event_count || 0,
        relationshipsCount: statsRow.rel_count || 0,
        secretsCount: statsRow.sec_count || 0,
        openFindingsCount: statsRow.open_findings_count || 0,
      },
    };

    return NextResponse.json({
      universe: populatedUniverse,
      isOwner: Boolean(!universe.is_example && universe.user_id === user.id),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error fetching universe';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: universeId } = await props.params;
    const user = await getCurrentUser(request);
    const universe = await verifyUniverseAccess(universeId, user.id, 'write');

    if (universe.is_example) {
      return NextResponse.json(
        { error: 'The canon example universe is read-only. Duplicate it to your personal vault to edit.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const title = body.title?.trim();
    const description = body.description?.trim();
    const coverUrl = body.cover_url !== undefined ? body.cover_url?.trim() || null : universe.cover_url;

    if (!title || title.length === 0) {
      return NextResponse.json({ error: 'Universe title is required' }, { status: 400 });
    }
    if (!description || description.length === 0) {
      return NextResponse.json({ error: 'Universe description is required' }, { status: 400 });
    }

    await query(
      `UPDATE universes
       SET title = $1, description = $2, cover_url = $3, updated_at = NOW()
       WHERE id = $4`,
      [title, description, coverUrl, universeId]
    );

    const updated = await query<Universe>('SELECT * FROM universes WHERE id = $1', [universeId]);

    return NextResponse.json({ universe: updated.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update universe';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: universeId } = await props.params;
    const user = await getCurrentUser(request);
    const universe = await verifyUniverseAccess(universeId, user.id, 'write');

    if (universe.is_example) {
      return NextResponse.json(
        { error: 'Cannot delete the protected exemplar demo universe' },
        { status: 403 }
      );
    }

    await transaction(async (tx) => {
      await tx.query('DELETE FROM universes WHERE id = $1', [universeId]);
    });

    return NextResponse.json({ success: true, deletedUniverseId: universeId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete universe';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
