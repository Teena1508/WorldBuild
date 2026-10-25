import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { ChapterAnalysisFinding, ChapterFindingStatus } from '@/lib/db/types';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string; chapterId: string; findingId: string }> }
) {
  try {
    const { id: universeId, chapterId, findingId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const status: ChapterFindingStatus | undefined = body.status;
    const dismissalReason: string | undefined = body.dismissal_reason;
    const authorNotes: string | undefined = body.author_notes;
    const suggestedFix: string | undefined = body.suggested_fix;

    // Check existing finding
    const existingRes = await query<ChapterAnalysisFinding>(
      'SELECT * FROM chapter_analysis_findings WHERE id = $1 AND chapter_id = $2 AND universe_id = $3',
      [findingId, chapterId, universeId]
    );

    if (existingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    const current = existingRes.rows[0];

    const validStatuses = ['open', 'accepted', 'dismissed', 'resolved'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const updatedStatus = status || current.status;
    const updatedReason = dismissalReason !== undefined ? dismissalReason : current.dismissal_reason;
    const updatedNotes = authorNotes !== undefined ? authorNotes : current.author_notes;
    const updatedFix = suggestedFix !== undefined ? suggestedFix : current.suggested_fix;

    await query(
      `UPDATE chapter_analysis_findings
       SET status = $1,
           dismissal_reason = $2,
           author_notes = $3,
           suggested_fix = $4,
           updated_at = NOW()
       WHERE id = $5 AND chapter_id = $6 AND universe_id = $7`,
      [updatedStatus, updatedReason, updatedNotes, updatedFix, findingId, chapterId, universeId]
    );

    const updatedRes = await query<ChapterAnalysisFinding>(
      'SELECT * FROM chapter_analysis_findings WHERE id = $1',
      [findingId]
    );

    return NextResponse.json({ finding: updatedRes.rows[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update finding';
    const status = message.includes('Authentication') ? 401 : (message.includes('not found') ? 404 : (message.includes('Unauthorized') || message.includes('Forbidden') ? 403 : 500));
    return NextResponse.json({ error: message }, { status });
  }
}
