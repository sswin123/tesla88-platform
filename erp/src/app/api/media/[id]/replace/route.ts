import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService, MediaValidationError } from '@/lib/media';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (isNaN(mediaId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const media = await mediaService.replace(mediaId, {
      buffer,
      originalFilename: file.name,
      mimeType:         file.type || 'application/octet-stream',
      uploadedBy:       payload.sub,
    });

    logAudit({
      admin_id:    payload.sub,
      action:      'MEDIA_REPLACE',
      target_type: 'media',
      target_id:   mediaId,
      new_value:   { filename: file.name, size: buffer.length },
    }).catch(() => {});

    return NextResponse.json({ ok: true, media });
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return NextResponse.json({ error: err.reason }, { status: 422 });
    }
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('[media/replace]', err);
    return NextResponse.json({ error: 'Replace failed' }, { status: 500 });
  }
}
