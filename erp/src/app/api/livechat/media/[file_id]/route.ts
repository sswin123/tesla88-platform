import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file_id: string }> }
) {
  const payload = await requirePermission('livechat.view');
  if (!payload) return new NextResponse('Unauthorized', { status: 401 });
  const { file_id } = await params;

  // Decode explicitly: Next.js may leave %3A un-decoded in route params
  const decodedId = decodeURIComponent(file_id);

  console.log('[erp-media] request', { file_id, decodedId });

  // Website-uploaded local files: proxy from website service
  if (decodedId.startsWith('local:')) {
    const websiteUrl = process.env.WEBSITE_URL;
    console.log('[erp-media] proxying local file', { websiteUrl, decodedId });
    if (!websiteUrl) return new NextResponse('WEBSITE_URL not configured', { status: 503 });
    const proxyUrl = `${websiteUrl}/api/livechat/media/${encodeURIComponent(decodedId)}`;
    console.log('[erp-media] proxy url', proxyUrl);
    const proxyRes = await fetch(proxyUrl).catch((err: unknown) => {
      console.error('[erp-media] proxy fetch error', err);
      return null;
    });
    if (!proxyRes || !proxyRes.ok) {
      console.log('[erp-media] proxy failed', proxyRes?.status);
      return new NextResponse('File not found', { status: 404 });
    }
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
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(decodedId)}`
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
