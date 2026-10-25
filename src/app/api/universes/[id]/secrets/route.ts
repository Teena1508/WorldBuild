import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Secret } from '@/lib/db/types';

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
    const severity = searchParams.get('severity')?.trim();

    let sql = `
      SELECT s.*,
        (SELECT COUNT(*)::int FROM character_secrets cs WHERE cs.secret_id = s.id) as known_by_count,
        (SELECT COUNT(*)::int FROM secret_events se WHERE se.secret_id = s.id) as usages_count
      FROM secrets s
      WHERE s.universe_id = $1
    `;
    const params: unknown[] = [universeId];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (LOWER(s.title) LIKE $${params.length} OR LOWER(s.content) LIKE $${params.length})`;
    }

    if (severity && severity !== 'all') {
      params.push(severity);
      sql += ` AND s.severity = $${params.length}`;
    }

    sql += ` ORDER BY s.created_at ASC`;

    const res = await query<Secret & { known_by_count: number; usages_count: number }>(sql, params);

    return NextResponse.json({ secrets: res.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch secrets';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
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
    const content = body.content?.trim();
    const severity = body.severity?.trim() || 'major';

    if (!title || title.length === 0) {
      return NextResponse.json({ error: 'Secret title is required' }, { status: 400 });
    }
    if (!content || content.length === 0) {
      return NextResponse.json({ error: 'Secret content is required' }, { status: 400 });
    }

    const validSeverities = ['minor', 'major', 'cosmic', 'forbidden'];
    if (!validSeverities.includes(severity)) {
      return NextResponse.json(
        { error: `Severity must be one of: ${validSeverities.join(', ')}` },
        { status: 400 }
      );
    }

    const secretId = `sec-${crypto.randomUUID().slice(0, 12)}`;

    await query(
      `INSERT INTO secrets (id, universe_id, title, content, severity, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [secretId, universeId, title, content, severity]
    );

    const created = await query<Secret>('SELECT * FROM secrets WHERE id = $1', [secretId]);

    return NextResponse.json({ secret: created.rows[0] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create secret';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}
