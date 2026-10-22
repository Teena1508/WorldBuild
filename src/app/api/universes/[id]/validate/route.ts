import { NextResponse } from 'next/server';
import { getCurrentUser, verifyUniverseAccess } from '@/lib/auth/session';
import { getFindings, runContinuityScan } from '@/lib/oracle/engine';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: universeId } = await props.params;
    const user = await getCurrentUser(request);
    await verifyUniverseAccess(universeId, user.id, 'read');

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status')?.trim().toLowerCase() as
      | 'open'
      | 'resolved'
      | 'ignored'
      | 'all'
      | undefined;

    const findings = await getFindings(universeId, statusParam || 'all');
    return NextResponse.json({ findings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch continuity findings';
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

    const result = await runContinuityScan(universeId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Continuity scan execution failed';
    const status = message.includes('not found') ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
