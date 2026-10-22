import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Chapter } from '@/lib/db/types';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: universeId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const sql = `
      SELECT ch.*,
        (SELECT COUNT(*)::int FROM events e WHERE e.chapter_id = ch.id) as events_count
      FROM chapters ch
      WHERE ch.universe_id = $1
      ORDER BY ch.sequence_number ASC
    `;

    const res = await query<Chapter & { events_count: number }>(sql, [universeId]);

    return NextResponse.json({ chapters: res.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch chapters';
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
    const title = body.title?.trim();
    const sequenceNumber = body.sequence_number !== undefined && body.sequence_number !== null ? Number(body.sequence_number) : null;
    const summary = body.summary?.trim() || '';

    if (!title || title.length === 0) {
      return NextResponse.json({ error: 'Chapter title is required' }, { status: 400 });
    }

    if (sequenceNumber === null || isNaN(sequenceNumber) || sequenceNumber < 0) {
      return NextResponse.json({ error: 'Valid sequence number (>= 0) is required' }, { status: 400 });
    }

    // Check unique sequence number in universe
    const existing = await query(
      'SELECT id FROM chapters WHERE universe_id = $1 AND sequence_number = $2',
      [universeId, sequenceNumber]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: `Chapter sequence number ${sequenceNumber} is already occupied in this universe` },
        { status: 400 }
      );
    }

    const chapId = `chap-${crypto.randomUUID().slice(0, 12)}`;

    await query(
      `INSERT INTO chapters (id, universe_id, title, sequence_number, summary, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [chapId, universeId, title, sequenceNumber, summary]
    );

    const created = await query<Chapter>('SELECT * FROM chapters WHERE id = $1', [chapId]);

    return NextResponse.json({ chapter: created.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create chapter';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
