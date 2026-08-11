import { NextRequest, NextResponse } from 'next/server';
import { getMember } from '@/lib/member-auth';

const ERP_URL    = (process.env.ERP_INTERNAL_URL ?? '').replace(/\/$/, '');
const SVC_SECRET = process.env.REVALIDATE_SECRET ?? '';

/**
 * POST /api/public/games/confirm-play
 *
 * Member-authenticated endpoint that executes the Transfer In (wallet deduction
 * + provider topUp) for TRANSFER wallet providers. Triggered when the member
 * clicks "Main Sekarang" in the App dialog.
 *
 * Body: { provider_code: string, confirm_ref_id: string }
 *
 * confirm_ref_id is the UUID embedded in session_token by /api/games/launch.
 * It is the idempotency key — duplicate calls return { ok: true, already_completed: true }.
 *
 * Response (proxied from ERP):
 *   200 { ok: true }                         — Transfer In succeeded
 *   200 { ok: true, already_completed: true } — already done (idempotent)
 *   409 { error }                             — concurrent call in progress
 *   422 { error }                             — insufficient balance
 *   502 { error }                             — topUp failed (balance restored)
 */
export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) {
    return NextResponse.json({ error: '请先登录后再进行游戏', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  let body: { provider_code?: string; confirm_ref_id?: string };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { provider_code, confirm_ref_id } = body;
  if (!provider_code || !confirm_ref_id) {
    return NextResponse.json(
      { error: 'provider_code and confirm_ref_id are required' },
      { status: 400 },
    );
  }

  if (!ERP_URL || !SVC_SECRET) {
    return NextResponse.json({ error: '游戏服务尚未配置，请联系客服' }, { status: 503 });
  }

  let erpRes: Response;
  try {
    erpRes = await fetch(`${ERP_URL}/api/games/confirm-play`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Service-Secret': SVC_SECRET,
      },
      body: JSON.stringify({
        user_id: member.sub,
        provider_code,
        confirm_ref_id,
      }),
    });
  } catch (err) {
    console.error('[public/games/confirm-play] ERP unreachable:', err);
    return NextResponse.json({ error: '游戏服务暂时无法连接，请稍后再试' }, { status: 502 });
  }

  const data = await erpRes.json() as {
    ok?: boolean; already_completed?: boolean; error?: string;
  };

  if (!erpRes.ok) {
    return NextResponse.json(
      { error: data.error ?? '游戏充值失败，请稍后再试' },
      { status: erpRes.status >= 400 ? erpRes.status : 502 },
    );
  }

  return NextResponse.json({ ok: true, already_completed: data.already_completed ?? false });
}
