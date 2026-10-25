import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { Chapter } from '@/lib/db/types';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: universeId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const chapterIds: string[] = body.chapter_ids;

    if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
      return NextResponse.json(
        { error: 'An array of chapter_ids is required for reordering' },
        { status: 400 }
      );
    }

    // Verify all chapters belong to this universe
    const existingRes = await query<{ id: string }>(
      'SELECT id FROM chapters WHERE universe_id = $1',
      [universeId]
    );
    const validIds = new Set(existingRes.rows.map((r) => r.id));

    for (const cid of chapterIds) {
      if (!validIds.has(cid)) {
        return NextResponse.json(
          { error: `Chapter ${cid} does not belong to universe ${universeId}` },
          { status: 400 }
        );
      }
    }

    // Update sequence numbers atomically inside transaction
    // Temporary negative offset avoids unique constraint collision during intermediate steps
    await transaction(async (tx) => {
      for (let i = 0; i < chapterIds.length; i++) {
        await tx.query(
          'UPDATE chapters SET sequence_number = $1 WHERE id = $2 AND universe_id = $3',
          [10000 + i, chapterIds[i], universeId]
        );
      }

      for (let i = 0; i < chapterIds.length; i++) {
        await tx.query(
          'UPDATE chapters SET sequence_number = $1, updated_at = NOW() WHERE id = $2 AND universe_id = $3',
          [i + 1, chapterIds[i], universeId]
        );
      }
    });

    const updatedRes = await query<Chapter>(
      'SELECT * FROM chapters WHERE universe_id = $1 ORDER BY sequence_number ASC',
      [universeId]
    );

    return NextResponse.json({ chapters: updatedRes.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reorder chapters';
    const status = message.includes('Authentication')
      ? 401
      : message.includes('not found')
      ? 404
      : message.includes('Unauthorized') || message.includes('Forbidden')
      ? 403
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
