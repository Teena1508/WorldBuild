import { NextResponse } from 'next/server';
import { getCurrentUser, getAuthErrorStatus } from '@/lib/auth/session';
import { previewManuscriptFile, ManuscriptValidationError } from '@/lib/manuscript/importer';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const contentType = request.headers.get('content-type') || '';

    let filename = '';
    let buffer: Buffer | null = null;
    let mimeType: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'No file provided in form-data' }, { status: 400 });
      }

      const fileObj = file as File;
      filename = fileObj.name;
      mimeType = fileObj.type;
      const arrayBuf = await fileObj.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
    } else {
      const body = await request.json();
      filename = (body.filename || '').trim();
      mimeType = body.mimeType;

      if (body.contentBase64) {
        buffer = Buffer.from(body.contentBase64, 'base64');
      } else if (body.content && typeof body.content === 'string') {
        buffer = Buffer.from(body.content, 'utf8');
      }
    }

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    if (!buffer) {
      return NextResponse.json({ error: 'Manuscript content is required' }, { status: 400 });
    }

    const preview = await previewManuscriptFile(user.id, filename, buffer, mimeType);

    return NextResponse.json({ preview });
  } catch (err: unknown) {
    if (err instanceof ManuscriptValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const status = getAuthErrorStatus(err, 500);
    const msg = err instanceof Error ? err.message : 'Failed to preview manuscript';
    return NextResponse.json({ error: msg }, { status });
  }
}
