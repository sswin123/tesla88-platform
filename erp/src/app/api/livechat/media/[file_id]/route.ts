import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file_id: string }> }
) {
  const { file_id } = await params;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return new NextResponse('Not configured', { status: 503 });

  // Telegram getFile API
  const infoRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(file_id)}`
  );
  const info = await infoRes.json();
  if (!info.ok) return new NextResponse('File not found', { status: 404 });

  const fileUrl = `https://api.telegram.org/file/bot${token}/${info.result.file_path}`;
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) return new NextResponse('Fetch failed', { status: 502 });

  return new NextResponse(fileRes.body, {
    headers: {
      'Content-Type': fileRes.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600, immutable',
      'Content-Disposition': 'inline',
    },
  });
}
