import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getCurrentUser, getAuthErrorStatus } from '@/lib/auth/session';
import { Series } from '@/lib/db/types';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);

    const res = await query<Series>(
      `SELECT 
         s.*,
         COUNT(st.id)::int as stories_count
       FROM series s
       LEFT JOIN stories st ON s.id = st.series_id
       WHERE s.user_id = $1
       GROUP BY s.id
       ORDER BY s.updated_at DESC`,
      [user.id]
    );

    return NextResponse.json({ series: res.rows });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to retrieve series';
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const title = (body.title || '').trim();
    if (!title) {
      return NextResponse.json({ error: 'Series title is required' }, { status: 400 });
    }

    const description = (body.description || '').trim();
    const seriesId = `series-${crypto.randomUUID()}`;

    const res = await query<Series>(
      `INSERT INTO series (id, user_id, title, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [seriesId, user.id, title, description]
    );

    return NextResponse.json({ series: res.rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to create series';
    return NextResponse.json({ error: msg }, { status });
  }
}
