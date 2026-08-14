import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { createHash } from 'crypto';

/**
 * POST /api/games/pussy888/credential-probe
 *
 * 当 Pussy888 代理给了两个未知 key 时，测试两种组合以确定哪个是 authcode，哪个是 secret_key。
 *
 * 请求体:
 *   { api_base_url: string, agent: string, keyA: string, keyB: string }
 *
 * 响应:
 *   { combo_AB: ProbeResult, combo_BA: ProbeResult, recommendation?: string }
 *
 *   combo_AB: authcode=keyA, secret_key=keyB
 *   combo_BA: authcode=keyB, secret_key=keyA
 *
 * 安全限制:
 *   - 只调用 getUserInfo.ashx（只读）
 *   - 不调用 setScore / createUser / 任何写操作
 *   - 响应中不返回实际 key 值
 */

interface ProbeResult {
  authcode_candidate: 'keyA' | 'keyB';
  secret_key_candidate: 'keyA' | 'keyB';
  state: 'creds_valid' | 'creds_invalid' | 'network_error' | 'api_reachable';
  note: string;
  latency_ms: number;
  err_code?: number;
  msg?: string;
}

function pussy888Sign(authcode: string, userName: string, time: string, secretKey: string): string {
  return createHash('md5')
    .update((authcode + userName + time + secretKey).toLowerCase(), 'utf8')
    .digest('hex');
}

async function probeWithCreds(
  baseUrl: string,
  agent: string,
  authcode: string,
  secretKey: string,
  authcodeLabel: 'keyA' | 'keyB',
  secretKeyLabel: 'keyA' | 'keyB',
): Promise<ProbeResult> {
  const probeUser = `${agent}u0`;
  const time      = String(Date.now());
  const sign      = pussy888Sign(authcode, probeUser, time, secretKey);
  const params    = new URLSearchParams({ authcode, userName: probeUser, time, sign });
  const url       = `${baseUrl.replace(/\/$/, '')}/getUserInfo.ashx`;

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  const start = Date.now();

  let res: Response;
  try {
    res = await fetch(`${url}?${params}`, { method: 'GET', signal: ctrl.signal });
  } catch (err) {
    clearTimeout(timer);
    const latency_ms = Date.now() - start;
    return {
      authcode_candidate:   authcodeLabel,
      secret_key_candidate: secretKeyLabel,
      state:     'network_error',
      note:      `网络错误: ${err instanceof Error ? err.message : String(err)}`,
      latency_ms,
    };
  }
  clearTimeout(timer);
  const latency_ms = Date.now() - start;

  if (!res.ok) {
    return {
      authcode_candidate:   authcodeLabel,
      secret_key_candidate: secretKeyLabel,
      state:     'network_error',
      note:      `HTTP ${res.status} — 服务器异常`,
      latency_ms,
    };
  }

  const body = await res.text().catch(() => '');
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { /* ignore */ }

  if (!parsed) {
    return {
      authcode_candidate:   authcodeLabel,
      secret_key_candidate: secretKeyLabel,
      state:     'api_reachable',
      note:      `API 可达但返回非 JSON（可能需要 IP 白名单）。前 200 字符: ${body.slice(0, 200)}`,
      latency_ms,
    };
  }

  const errCode   = parsed['errCode']   as number | undefined;
  const msg       = String(parsed['msg'] ?? '');
  const isSuccess = !!parsed['isSuccess'];

  if (isSuccess) {
    return {
      authcode_candidate:   authcodeLabel,
      secret_key_candidate: secretKeyLabel,
      state:    'creds_valid',
      note:     '凭证正确（探针用户意外存在）',
      latency_ms,
      err_code: errCode,
      msg,
    };
  }

  // Detect auth error vs user-not-found
  const lmsg = msg.toLowerCase();
  const isAuthErr = lmsg.includes('sign') || lmsg.includes('auth') || lmsg.includes('authcode') ||
                    lmsg.includes('token') || lmsg.includes('forbidden') || errCode === 1001;

  if (isAuthErr) {
    return {
      authcode_candidate:   authcodeLabel,
      secret_key_candidate: secretKeyLabel,
      state:    'creds_invalid',
      note:     `凭证无效 — errCode=${errCode} msg="${msg}"`,
      latency_ms,
      err_code: errCode,
      msg,
    };
  }

  // User not found = expected = credentials are valid
  return {
    authcode_candidate:   authcodeLabel,
    secret_key_candidate: secretKeyLabel,
    state:    'creds_valid',
    note:     `凭证有效。探针用户不存在（预期）— errCode=${errCode} msg="${msg}"`,
    latency_ms,
    err_code: errCode,
    msg,
  };
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const api_base_url = String(b['api_base_url'] ?? '').trim();
  const agent        = String(b['agent']        ?? '').trim();
  const keyA         = String(b['keyA']         ?? '').trim();
  const keyB         = String(b['keyB']         ?? '').trim();

  if (!api_base_url || !agent || !keyA || !keyB) {
    return NextResponse.json({
      error: '必填字段: api_base_url, agent, keyA, keyB',
    }, { status: 400 });
  }

  // Test both combinations in parallel
  const [combo_AB, combo_BA] = await Promise.all([
    probeWithCreds(api_base_url, agent, keyA, keyB, 'keyA', 'keyB'),
    probeWithCreds(api_base_url, agent, keyB, keyA, 'keyB', 'keyA'),
  ]);

  // Determine recommendation
  let recommendation: string | undefined;
  const abValid = combo_AB.state === 'creds_valid' || combo_AB.state === 'api_reachable';
  const baValid = combo_BA.state === 'creds_valid' || combo_BA.state === 'api_reachable';

  if (abValid && !baValid) {
    recommendation = 'authcode=keyA, secret_key=keyB（组合 AB 有效）';
  } else if (baValid && !abValid) {
    recommendation = 'authcode=keyB, secret_key=keyA（组合 BA 有效）';
  } else if (abValid && baValid) {
    recommendation = '两种组合均通过，需进一步确认（可能 secret_key 校验宽松）';
  } else {
    recommendation = '两种组合均无效 — 检查 api_base_url 是否正确，或 IP 是否已白名单';
  }

  return NextResponse.json({
    combo_AB,
    combo_BA,
    recommendation,
    probed_at: new Date().toISOString(),
    note: '仅调用 getUserInfo（只读），未执行任何写操作（setScore / createUser）',
  });
}
