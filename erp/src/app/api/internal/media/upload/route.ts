import { NextRequest, NextResponse } from 'next/server';
import { mediaService, MediaValidationError } from '@/lib/media';

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

  // [DEBUG-REMOVE] Trace received Authorization — delete after diagnosis
  console.log('[internal/media/upload][DEBUG] expected', JSON.stringify({
    length:      expected.length,
    prefix:      expected.slice(0, 8),
    suffix:      expected.slice(-8),
    prefixCodes: [...expected.slice(0, 8)].map(c => c.charCodeAt(0)),
    suffixCodes: [...expected.slice(-8)].map(c => c.charCodeAt(0)),
  }));
  console.log('[internal/media/upload][DEBUG] raw.auth', JSON.stringify({
    length:      auth.length,
    prefix:      auth.slice(0, 15),
    suffix:      auth.slice(-8),
    prefixCodes: [...auth.slice(0, 8)].map(c => c.charCodeAt(0)),
    suffixCodes: [...auth.slice(-8)].map(c => c.charCodeAt(0)),
  }));
  const _dbgToken = token ?? '';
  console.log('[internal/media/upload][DEBUG] parsed', JSON.stringify({
    scheme:      scheme,
    tokenLength: _dbgToken.length,
    prefix:      _dbgToken.slice(0, 8),
    suffix:      _dbgToken.slice(-8),
    prefixCodes: [..._dbgToken.slice(0, 8)].map(c => c.charCodeAt(0)),
    suffixCodes: [..._dbgToken.slice(-8)].map(c => c.charCodeAt(0)),
    match:       (scheme === 'Bearer' && token === expected),
  }));

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

  const buffer = Buffer.from(await file.arrayBuffer());

  let result: Awaited<ReturnType<typeof mediaService.save>>;
  try {
    result = await mediaService.save({
      buffer,
      originalFilename: file.name,
      mimeType:         file.type || 'application/octet-stream',
      uploadedBy:       null,  // customer/anonymous upload — no admin ID
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
