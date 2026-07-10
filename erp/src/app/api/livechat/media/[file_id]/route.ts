import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file_id: string }> }
) {
  const { file_id } = await params;

  // Website-uploaded local files: proxy from website service
  if (file_id.startsWith('local:')) {
    const websiteUrl = process.env.WEBSITE_URL;
    if (!websiteUrl) return new NextResponse('WEBSITE_URL not configured', { status: 503 });
    const proxyRes = await fetch(`${websiteUrl}/api/livechat/media/${encodeURIComponent(file_id)}`);
    if (!proxyRes.ok) return new NextResponse('File not found', { status: 404 });
    return new NextResponse(proxyRes.body, {
      headers: {
        'Content-Type': proxyRes.headers.get('Content-Type') ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600, immutable',
        'Content-Disposition': 'inline',
      },
    });
  }

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
