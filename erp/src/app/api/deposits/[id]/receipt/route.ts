import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { rows } = await pool.query(
    'SELECT receipt_file_id FROM deposit_requests WHERE id = $1',
    [parseInt(id, 10)]
  );
  if (!rows[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const fileId = rows[0].receipt_file_id as string;

  const fileRes  = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const fileData = await fileRes.json() as { ok: boolean; result?: { file_path: string } };

  if (!fileData.ok || !fileData.result) {
    return NextResponse.json({ error: 'Could not retrieve file from Telegram' }, { status: 502 });
  }

  const imgRes = await fetch(
    `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`
  );
  const buffer      = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
