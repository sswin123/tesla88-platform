import { NextRequest, NextResponse } from 'next/server';
import { mediaService, MediaValidationError } from '@/lib/media';
import type { MediaSource } from '@/lib/media/types';

const VALID_SOURCES = new Set<string>([
  'MEDIA_LIBRARY', 'WITHDRAWAL_RECEIPT', 'DEPOSIT_ATTACHMENT', 'SYSTEM_UPLOAD',
]);

export const runtime = 'nodejs';

// Internal-only endpoint — called by Website container over Docker bridge network.
// NOT exposed via nginx; protected by BOT_RELAY_AUTH_TOKEN shared secret.
// This is the single canonical media upload path for all platform modules.
// Token is read inside the function (not module-level) to support test stubbing.
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.BOT_RELAY_AUTH_TOKEN ?? '';
  if (!expected) return false;
  const auth = req.headers.get('authorization') ?? '';
  const [scheme, token] = auth.split(' ');

  return scheme === 'Bearer' && token === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Callers may pass a source header to classify uploads correctly.
  // The only known caller is website /api/member/uploads/receipt → DEPOSIT_ATTACHMENT.
  const sourceHeader = formData.get('source') as string | null;
  const source: MediaSource = (sourceHeader && VALID_SOURCES.has(sourceHeader))
    ? sourceHeader as MediaSource
    : 'DEPOSIT_ATTACHMENT';

  const buffer = Buffer.from(await file.arrayBuffer());

  let result: Awaited<ReturnType<typeof mediaService.save>>;
  try {
    result = await mediaService.save({
      buffer,
      originalFilename: file.name,
      mimeType:         file.type || 'application/octet-stream',
      uploadedBy:       null,  // customer/anonymous upload — no admin ID
      source,
    });
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return NextResponse.json({ error: err.reason }, { status: 422 });
    }
    console.error('[internal/media/upload] mediaService.save error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok:           true,
      media_id:     result.record.id,
      storage_key:  result.record.storageKey,
      mime_type:    result.record.mimeType,
      is_duplicate: result.isDuplicate,
    },
    { status: result.isDuplicate ? 200 : 201 }
  );
}
