import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { mediaService } from '@/lib/media';
import { requirePermission } from '@/lib/require_permission';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requirePermission('deposit.view');
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { rows } = await pool.query(
    `SELECT receipt_file_id, receipt_media_id
     FROM deposit_requests WHERE id = $1`,
    [parseInt(id, 10)]
  );
  if (!rows[0]) return Response.json({ error: 'Not found' }, { status: 404 });

  const { receipt_file_id, receipt_media_id } = rows[0] as {
    receipt_file_id: string | null;
    receipt_media_id: number | null;
  };

  // 1. Website upload (media_library) — preferred
  if (receipt_media_id) {
    const result = await mediaService.getBuffer(receipt_media_id).catch(() => null);
    if (result) {
      return new Response(result.buffer as unknown as BodyInit, {
        headers: {
          'Content-Type':        result.mimeType,
          'Content-Length':      String(result.buffer.length),
          'Content-Disposition': 'inline',
          'Cache-Control':       'private, max-age=3600',
        },
      });
    }
  }

  // 2. Telegram photo (legacy bot deposits)
  if (!receipt_file_id) {
    return Response.json({ error: 'No receipt on file' }, { status: 404 });
  }

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const fileRes = await fetch(
    `https://api.telegram.org/bot${telegramToken}/getFile?file_id=${encodeURIComponent(receipt_file_id)}`
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

  const imgRes  = await fetch(`https://api.telegram.org/file/bot${telegramToken}/${filePath}`);
  const buffer  = await imgRes.arrayBuffer();

  return new Response(buffer, {
    headers: {
      'Content-Type':        contentType,
      'Content-Disposition': 'inline',
      'Cache-Control':       'private',
    },
  });
}
