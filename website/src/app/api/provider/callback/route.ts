import { NextRequest, NextResponse } from 'next/server';
import { resolveProvider } from '@/lib/provider/ProviderRouter';
import { processCallback } from '@/lib/provider/ProviderCallbackService';
import { listProviders } from '@/lib/provider/ProviderRegistry';
import type { CallbackRequest } from '@/lib/provider/ProviderAdapter';

const MAX_BODY_BYTES = 65_536; // 64 KB — early reject before parsing

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

function makeResponse(body: string, contentType: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': contentType },
  });
}

// ── GET — Health check ─────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    service:   'Provider Callback',
    status:    'ready',
    version:   '1.0.0',
    providers: listProviders(),
  });
}

// ── POST — Unified callback entry point ────────────────────────────────────────
//
// Single URL for all game providers.  Always returns HTTP 200 regardless of
// errors — game providers must not receive 4xx/5xx on their test callbacks.
//
// Provider identification (priority order):
//   1. ?provider=JILI  query param
//   2. X-Provider: JILI  HTTP header
//   3. body.provider / body.operator field
//   4. Falls back to "UNKNOWN"
//
// All callbacks are written to provider_callback_logs for auditing.
// Duplicate transactions (same idempotency key) are short-circuited.

export async function POST(req: NextRequest) {
  const headers   = extractHeaders(req);
  const query     = extractQuery(req);
  const ip        = extractIp(req);
  const userAgent = req.headers.get('user-agent') ?? '';

  // Early size check before full body parse
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    // Still return 200 — log this in the service layer next time
    return makeResponse(JSON.stringify({ success: true }), 'application/json', 200);
  }

  let rawBody = '';
  let jsonBody: unknown = null;
  try {
    rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return makeResponse(JSON.stringify({ success: true }), 'application/json', 200);
    }
    if (rawBody) jsonBody = JSON.parse(rawBody);
  } catch {
    // Non-JSON body accepted; rawBody still captured for logging
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

  // processCallback always resolves — never throws
  const result = await processCallback(callbackReq);

  return makeResponse(
    result.formatted.body,
    result.formatted.contentType,
    result.formatted.status,
  );
}
