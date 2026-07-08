import { NextRequest, NextResponse } from 'next/server';
import { mediaService } from '@/lib/media';
import { setSettings } from '@/lib/repositories/settings_repo';
import { requirePermission } from '@/lib/require_permission';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

export async function POST(request: NextRequest) {
  const payload = await requirePermission('bot.settings');
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
