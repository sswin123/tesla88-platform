import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService, MediaValidationError } from '@/lib/media';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  const displayName = formData.get('display_name');
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await mediaService.save({
      buffer,
      originalFilename: file.name,
      mimeType:         file.type || 'application/octet-stream',
      uploadedBy:       payload.sub,
      displayName:      typeof displayName === 'string' ? displayName : undefined,
    });

    logAudit({
      admin_id:    payload.sub,
      action:      'MEDIA_UPLOAD',
      target_type: 'media',
      target_id:   result.record.id,
      new_value:   {
        filename:    file.name,
        size:        buffer.length,
        isDuplicate: result.isDuplicate,
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, media: result.record, isDuplicate: result.isDuplicate });
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return NextResponse.json({ error: err.reason }, { status: 422 });
    }
    console.error('[media/upload]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
