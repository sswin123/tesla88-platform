import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('deposit.view');
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { rows } = await pool.query(
    'SELECT receipt_file_id FROM deposit_requests WHERE id = $1',
    [parseInt(id, 10)]
  );
  if (!rows[0]) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const fileId = rows[0].receipt_file_id as string;

  // Check if receipt_file_id exists
  if (!fileId) {
    return Response.json({ error: 'No receipt on file' }, { status: 404 });
  }

  const fileRes  = await fetch(
    `https://api.telegram.org/bot${telegramToken}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const fileData = await fileRes.json() as { ok: boolean; result?: { file_path: string } };

  if (!fileData.ok || !fileData.result) {
    return Response.json({ error: 'Could not retrieve file from Telegram' }, { status: 502 });
  }

  const filePath = fileData.result.file_path;
  const ext = filePath.split('.').pop()?.toLowerCase();
  const MIME: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  };
  const contentType = MIME[ext ?? ''] ?? 'image/jpeg';

  const imgRes = await fetch(
    `https://api.telegram.org/file/bot${telegramToken}/${filePath}`
  );
  const buffer = await imgRes.arrayBuffer();

  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private',
    },
  });
}
