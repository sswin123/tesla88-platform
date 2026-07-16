// ERP API: proxy test callbacks to the website's /api/provider/callback endpoint.
// Used by the API Playground to send mock callbacks without leaving ERP.

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getWebsiteOrigin } from '@/lib/domain-service';

async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload || payload.role !== 'SUPER_ADMIN') return null;
  return payload;
}

export async function POST(req: NextRequest) {
  const payload = await requireSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    provider: string;
    headers?: Record<string, string>;
    body:     unknown;
  };

  const { provider, headers: extraHeaders = {}, body: callbackBody } = body;
  if (!provider || !callbackBody) {
    return NextResponse.json({ error: 'provider and body required' }, { status: 400 });
  }

  const websiteOrigin = getWebsiteOrigin();
  const targetUrl     = `${websiteOrigin}/api/provider/callback?provider=${encodeURIComponent(provider)}`;

  const startMs = Date.now();
  let status    = 0;
  let resBody   = '';
  let resHeaders: Record<string, string> = {};
  let error: string | undefined;

  try {
    const res = await fetch(targetUrl, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ERP-Playground': '1',
        'X-Provider': provider,
        ...extraHeaders,
      },
      body: JSON.stringify(callbackBody),
    });
    status  = res.status;
    resBody = await res.text();
    res.headers.forEach((v, k) => { resHeaders[k] = v; });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    status = 0;
  }

  return NextResponse.json({
    provider,
    targetUrl,
    status,
    responseBody:    resBody,
    responseHeaders: resHeaders,
    processingMs:    Date.now() - startMs,
    error,
    sentAt:          new Date().toISOString(),
  });
}
