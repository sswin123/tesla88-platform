import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/public/image-proxy?url=<encoded-https-url>
 *
 * Proxies external logo/banner images as same-origin responses, bypassing:
 *   1. Next.js Image `remotePatterns` restriction (external domains not allow-listed)
 *   2. CSP `img-src 'self'` — browser only sees same-origin URL
 *
 * Security constraints:
 *   - Only proxies https:// URLs (blocks SSRF to internal http services)
 *   - Validates Content-Type is image/* before returning
 *   - 8-second timeout
 *   - Long-lived cache (24h) to avoid hammering upstream CDNs
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) return new NextResponse(null, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (parsed.protocol !== 'https:') {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const upstream = await fetch(raw, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!upstream.ok) return new NextResponse(null, { status: 404 });

    const ct = upstream.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return new NextResponse(null, { status: 400 });

    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type':  ct,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
