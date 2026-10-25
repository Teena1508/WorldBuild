import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser, getAuthErrorStatus, ForbiddenError, NotFoundError } from '@/lib/auth/session';
import { Series } from '@/lib/db/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;
    const body = await request.json();

    const existingRes = await query<Series>('SELECT * FROM series WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      throw new NotFoundError('Series not found');
    }

    const existing = existingRes.rows[0];
    if (existing.user_id !== user.id) {
      throw new ForbiddenError('Unauthorized: only the author can modify this series');
    }

    const title = (body.title || '').trim() || existing.title;
    const description = body.description !== undefined ? body.description : existing.description;

    const res = await query<Series>(
      `UPDATE series
       SET title = $1, description = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [title, description, id]
    );

    return NextResponse.json({ series: res.rows[0] });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to update series';
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;

    const existingRes = await query<Series>('SELECT * FROM series WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      throw new NotFoundError('Series not found');
    }

    const existing = existingRes.rows[0];
    if (existing.user_id !== user.id) {
      throw new ForbiddenError('Unauthorized: only the author can delete this series');
    }

    await query('DELETE FROM series WHERE id = $1', [id]);

    return NextResponse.json({ success: true, message: 'Series deleted successfully' });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to delete series';
    return NextResponse.json({ error: msg }, { status });
  }
}
