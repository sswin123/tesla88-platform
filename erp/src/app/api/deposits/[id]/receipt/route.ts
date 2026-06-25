import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authenticate request
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { rows } = await pool.query(
    'SELECT receipt_file_id FROM deposit_requests WHERE id = $1',
    [parseInt(id, 10)]
  );
  if (!rows[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const fileId = rows[0].receipt_file_id as string;

  // Check if receipt_file_id exists
  if (!fileId) {
    return NextResponse.json({ error: 'No receipt on file' }, { status: 404 });
  }

  const fileRes  = await fetch(
    `https://api.telegram.org/bot${telegramToken}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const fileData = await fileRes.json() as { ok: boolean; result?: { file_path: string } };

  if (!fileData.ok || !fileData.result) {
    return NextResponse.json({ error: 'Could not retrieve file from Telegram' }, { status: 502 });
  }

  const imgRes = await fetch(
    `https://api.telegram.org/file/bot${telegramToken}/${fileData.result.file_path}`
  );
  const buffer      = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
