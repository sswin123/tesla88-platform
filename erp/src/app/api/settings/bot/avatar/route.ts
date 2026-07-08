import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { mediaService } from '@/lib/media';
import { setSettings } from '@/lib/repositories/settings_repo';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload || payload.role !== 'SUPER_ADMIN') return null;
  return payload;
}

export async function POST(request: NextRequest) {
  const payload = await requireSuperAdmin();
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

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: 'Only JPG and PNG images are allowed' },
      { status: 422 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await mediaService.save({
      buffer,
      originalFilename: file.name,
      mimeType:         file.type,
      uploadedBy:       payload.sub,
      displayName:      'bot_avatar',
    });

    await setSettings(
      { bot_avatar_media_id: String(result.record.id) },
      payload.username,
    );

    return NextResponse.json({ ok: true, media_id: result.record.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
