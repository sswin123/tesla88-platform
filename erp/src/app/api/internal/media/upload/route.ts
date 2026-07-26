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
  console.log('[internal/media/upload][DEBUG] expected'
    + ' length=' + expected.length
    + ' prefix=' + JSON.stringify(expected.slice(0, 8))
    + ' suffix.json=' + JSON.stringify(expected.slice(-4))
    + ' prefix.codes=' + JSON.stringify([...expected.slice(0, 4)].map(c => c.charCodeAt(0)))
    + ' suffix.codes=' + JSON.stringify([...expected.slice(-4)].map(c => c.charCodeAt(0))));
  console.log('[internal/media/upload][DEBUG] raw.auth'
    + ' length=' + auth.length
    + ' prefix=' + JSON.stringify(auth.slice(0, 15))
    + ' suffix.json=' + JSON.stringify(auth.slice(-4))
    + ' suffix.codes=' + JSON.stringify([...auth.slice(-4)].map(c => c.charCodeAt(0))));
  console.log('[internal/media/upload][DEBUG] parsed'
    + ' scheme=' + JSON.stringify(scheme)
    + ' token.length=' + (token?.length ?? 0)
    + ' token.prefix=' + JSON.stringify(token?.slice(0, 8) ?? '')
    + ' token.suffix.json=' + JSON.stringify((token ?? '').slice(-4))
    + ' token.suffix.codes=' + JSON.stringify([...(token ?? '').slice(-4)].map(c => c.charCodeAt(0)))
    + ' match=' + (scheme === 'Bearer' && token === expected));

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
