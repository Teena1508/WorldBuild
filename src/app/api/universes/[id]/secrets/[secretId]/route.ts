import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Secret } from '@/lib/db/types';

interface SecretKnownByRow {
  record_id: string;
  character_id: string;
  character_name: string;
  epithet: string | null;
  learned_year: number | null;
  learned_at_event_id: string | null;
  learned_at_event_title: string | null;
  notes: string | null;
}

interface SecretUsageRow {
  record_id: string;
  event_id: string;
  event_title: string;
  timestamp_year: number;
  character_id: string | null;
  character_name: string | null;
  usage_type: string;
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string; secretId: string }> }
) {
  try {
    const { id: universeId, secretId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const secretRes = await query<Secret>(
      'SELECT * FROM secrets WHERE id = $1 AND universe_id = $2',
      [secretId, universeId]
    );

    if (secretRes.rows.length === 0) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
    }

    const secret = secretRes.rows[0];

    // Characters who know this secret
    const knownByRes = await query<SecretKnownByRow>(
      `SELECT cs.id as record_id, cs.character_id, c.name as character_name, c.epithet,
        cs.learned_year, cs.learned_at_event_id, e.title as learned_at_event_title, cs.notes
       FROM character_secrets cs
       JOIN characters c ON cs.character_id = c.id
       LEFT JOIN events e ON cs.learned_at_event_id = e.id
       WHERE cs.secret_id = $1
       ORDER BY cs.learned_year ASC NULLS LAST`,
      [secretId]
    );

    // Events where this secret was used / revealed
    const usagesRes = await query<SecretUsageRow>(
      `SELECT se.id as record_id, se.event_id, e.title as event_title, e.timestamp_year,
        se.character_id, c.name as character_name, se.usage_type
       FROM secret_events se
       JOIN events e ON se.event_id = e.id
       LEFT JOIN characters c ON se.character_id = c.id
       WHERE se.secret_id = $1
       ORDER BY e.timestamp_year ASC`,
      [secretId]
    );

    return NextResponse.json({
      secret: {
        ...secret,
        known_by: knownByRes.rows,
        usages: usagesRes.rows,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch secret';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string; secretId: string }> }
) {
  try {
    const { id: universeId, secretId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const title = body.title?.trim();
    const content = body.content?.trim();
    const severity = body.severity?.trim();

    if (!title || title.length === 0) {
      return NextResponse.json({ error: 'Secret title is required' }, { status: 400 });
    }
    if (!content || content.length === 0) {
      return NextResponse.json({ error: 'Secret content is required' }, { status: 400 });
    }

    if (severity) {
      const validSeverities = ['minor', 'major', 'cosmic', 'forbidden'];
      if (!validSeverities.includes(severity)) {
        return NextResponse.json(
          { error: `Severity must be one of: ${validSeverities.join(', ')}` },
          { status: 400 }
        );
      }
    }

    await query(
      `UPDATE secrets
       SET title = $1, content = $2, severity = COALESCE($3, severity), updated_at = NOW()
       WHERE id = $4 AND universe_id = $5`,
      [title, content, severity, secretId, universeId]
    );

    const updated = await query<Secret>(
      'SELECT * FROM secrets WHERE id = $1 AND universe_id = $2',
      [secretId, universeId]
    );

    if (updated.rows.length === 0) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
    }

    return NextResponse.json({ secret: updated.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update secret';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; secretId: string }> }
) {
  try {
    const { id: universeId, secretId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const res = await query(
      'DELETE FROM secrets WHERE id = $1 AND universe_id = $2 RETURNING id',
      [secretId, universeId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Secret not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedSecretId: secretId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete secret';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : 403);
    return NextResponse.json({ error: message }, { status });
  }
}
