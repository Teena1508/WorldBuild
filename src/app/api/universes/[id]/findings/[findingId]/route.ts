import { NextResponse } from 'next/server';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { ignoreFinding, reopenFinding, resolveFinding } from '@/lib/oracle/engine';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string; findingId: string }> }
) {
  try {
    const { id: universeId, findingId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'write');

    const body = await request.json();
    const action = body.action?.trim().toLowerCase();

    if (action === 'ignore') {
      const reason = body.reason?.trim();
      if (!reason) {
        return NextResponse.json(
          { error: 'An explanation reason is required when acknowledging an intentional exception' },
          { status: 400 }
        );
      }
      const updated = await ignoreFinding(universeId, findingId, reason);
      return NextResponse.json({ finding: updated });
    }

    if (action === 'resolve') {
      const updated = await resolveFinding(universeId, findingId);
      return NextResponse.json({ finding: updated });
    }

    if (action === 'reopen') {
      const updated = await reopenFinding(universeId, findingId);
      return NextResponse.json({ finding: updated });
    }

    return NextResponse.json(
      { error: "Invalid action. Supported actions are 'ignore', 'resolve', 'reopen'." },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update finding';
    const status = message.includes('Authentication')
      ? 401
      : message.includes('Unauthorized') || message.includes('read-only') || message.includes('Forbidden')
      ? 403
      : message.includes('not found')
      ? 404
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
