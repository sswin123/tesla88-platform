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

  const files = formData.getAll('files');
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > 20) {
    return NextResponse.json({ error: 'Maximum 20 files per batch' }, { status: 422 });
  }

  const results: Array<{ media: object; isDuplicate: boolean } | { error: string; filename: string }> = [];

  for (const file of files) {
    if (!(file instanceof File)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const result = await mediaService.save({
        buffer,
        originalFilename: file.name,
        mimeType:         file.type || 'application/octet-stream',
        uploadedBy:       payload.sub,
      });
      results.push({ media: result.record, isDuplicate: result.isDuplicate });
    } catch (err) {
      if (err instanceof MediaValidationError) {
        results.push({ error: err.reason, filename: file.name });
      } else {
        results.push({ error: 'Upload failed', filename: file.name });
      }
    }
  }

  logAudit({
    admin_id:    payload.sub,
    action:      'MEDIA_UPLOAD',
    target_type: 'media',
    new_value:   { batch: true, count: files.length },
  }).catch(() => {});

  return NextResponse.json({ ok: true, results });
}
