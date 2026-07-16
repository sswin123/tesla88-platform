import { NextRequest, NextResponse } from 'next/server';
import { resolveProvider } from '@/lib/provider/ProviderRouter';
import { processCallback } from '@/lib/provider/ProviderCallbackService';
import type { CallbackRequest } from '@/lib/provider/ProviderAdapter';

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractHeaders(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => { out[k] = v; });
  return out;
}

function extractQuery(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { out[k] = v; });
  return out;
}

function extractIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0'
  );
}

// ── GET — Health check ─────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    service: 'Provider Callback',
    status:  'ready',
    version: '1.0.0',
  });
}

// ── POST — Unified callback entry point ────────────────────────────────────────
//
// All game providers (JILI, PG, Pragmatic, Evolution, PlayTech, CQ9, Joker,
// Live22, ACE333, Mega888, 918KISS, Newtown, Pussy888, …) send callbacks here.
// The provider is identified by ?provider=JILI, X-Provider header, or body field.
//
// Response is ALWAYS HTTP 200 { "success": true } — providers must not receive
// 4xx/5xx on their first test callback.  All errors are written to
// provider_callback_logs for post-mortem debugging.

export async function POST(req: NextRequest) {
  const headers   = extractHeaders(req);
  const query     = extractQuery(req);
  const ip        = extractIp(req);
  const userAgent = req.headers.get('user-agent') ?? '';

  let rawBody = '';
  let jsonBody: unknown = null;
  try {
    rawBody = await req.text();
    if (rawBody) jsonBody = JSON.parse(rawBody);
  } catch {
    // non-JSON body is fine; rawBody still captured
  }

  const provider = resolveProvider(query, headers, jsonBody);

  const callbackReq: CallbackRequest = {
    provider,
    method: 'POST',
    headers,
    query,
    rawBody,
    jsonBody,
    ip,
    userAgent,
  };

  // processCallback always resolves (never throws) — exceptions are logged internally
  const result = await processCallback(callbackReq);

  return NextResponse.json(result.response, { status: 200 });
}
