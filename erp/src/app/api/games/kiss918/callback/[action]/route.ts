import { NextRequest, NextResponse } from 'next/server';
import { getKiss918Adapter } from '@/lib/gaming';
import { OPERATOR_ERROR } from '@/lib/providers/adapters/kiss918/constants';

// ── 918KISS Seamless Wallet Callback Endpoint ─────────────────────────────────
//
// 918KISS calls these URLs for every wallet event.  The [action] segment maps
// to the corresponding handler in Kiss918Adapter.
//
// URL pattern: POST /api/games/kiss918/callback/{action}
//   authenticate   → handleAuthenticateCallback
//   getbalance     → handleGetBalanceCallback
//   bet            → handleBetCallback
//   betresult      → handleBetResultCallback
//   refund         → handleRefundCallback
//   jackpotwin     → handleJackpotWinCallback
//   fundrequest    → handleFundRequestCallback
//   fundreturn     → handleFundReturnCallback
//   fundbetresult  → handleFundBetResultCallback
//
// Security: operatorToken validation is enforced by each handler before any
// DB operation.  No ERP session cookie is required (918KISS is the caller).

type Params = { params: Promise<{ action: string }> };

type Handler = (
  rawBody: Record<string, unknown>,
  headers:  Record<string, string | undefined>,
  ip:       string | null,
) => Promise<Record<string, unknown>>;

function resolveHandler(
  adapter: NonNullable<Awaited<ReturnType<typeof getKiss918Adapter>>>,
  action: string,
): Handler | null {
  switch (action.toLowerCase()) {
    case 'authenticate':   return adapter.handleAuthenticateCallback.bind(adapter);
    case 'getbalance':     return adapter.handleGetBalanceCallback.bind(adapter);
    case 'bet':            return adapter.handleBetCallback.bind(adapter);
    case 'betresult':      return adapter.handleBetResultCallback.bind(adapter);
    case 'refund':         return adapter.handleRefundCallback.bind(adapter);
    case 'jackpotwin':     return adapter.handleJackpotWinCallback.bind(adapter);
    case 'fundrequest':    return adapter.handleFundRequestCallback.bind(adapter);
    case 'fundreturn':     return adapter.handleFundReturnCallback.bind(adapter);
    case 'fundbetresult':  return adapter.handleFundBetResultCallback.bind(adapter);
    default:               return null;
  }
}

async function handleCallback(
  request: NextRequest,
  action: string,
): Promise<NextResponse> {
  // Diagnostic — proves request reached route.ts (past middleware)
  console.log(`[kiss918-callback] route.ts reached: action=${action} method=${request.method} ip=${
    request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
  }`);

  // 1. Parse body — POST: JSON body; GET: URL query params (e.g. getbalance)
  let rawBody: Record<string, unknown>;
  try {
    if (request.method === 'GET') {
      const parsed: Record<string, unknown> = {};
      request.nextUrl.searchParams.forEach((v, k) => { parsed[k] = v; });
      rawBody = parsed;
    } else {
      rawBody = await request.json();
    }
  } catch {
    return NextResponse.json({ error: OPERATOR_ERROR.SYSTEM_ERROR }); // HTTP 200
  }

  // 2. Load adapter (lazy singleton — returns null if provider not ACTIVE)
  const adapter = await getKiss918Adapter();
  if (!adapter) {
    return NextResponse.json({ error: OPERATOR_ERROR.MAINTENANCE }); // HTTP 200
  }

  // 3. Resolve handler
  const handler = resolveHandler(adapter, action);
  if (!handler) {
    return NextResponse.json({ error: OPERATOR_ERROR.UNKNOWN }); // HTTP 200
  }

  // 4. Build headers map
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => { headers[key] = value; });

  // 5. Extract client IP (trusting X-Forwarded-For set by Nginx)
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null;

  // 6. Dispatch — the handler owns token validation, logging, wallet, formatting
  const result = await handler(rawBody, headers, ip);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { action } = await params;
  return handleCallback(request, action);
}

// 918KISS sends some callbacks (e.g. getbalance) as GET with query params
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { action } = await params;
  return handleCallback(request, action);
}
