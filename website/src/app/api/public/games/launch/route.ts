import { NextRequest, NextResponse } from 'next/server';
import { getMember } from '@/lib/member-auth';

const ERP_URL     = (process.env.ERP_INTERNAL_URL ?? '').replace(/\/$/, '');
const SVC_SECRET  = process.env.REVALIDATE_SECRET ?? '';

/**
 * POST /api/public/games/launch
 *
 * Member-authenticated endpoint that proxies a game launch request to the
 * ERP internal launch API and returns the provider's H5 launch URL.
 *
 * Body: { provider_code: string, game_code?: string | null }
 * Response: { launch_url: string, launch_mode: 'LOBBY' | 'DIRECT' }
 */
export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) {
    return NextResponse.json({ error: '请先登录后再进行游戏', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  let body: { provider_code?: string; game_code?: string | null };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { provider_code, game_code = null } = body;
  if (!provider_code) {
    return NextResponse.json({ error: 'provider_code is required' }, { status: 400 });
  }

  if (!ERP_URL || !SVC_SECRET) {
    return NextResponse.json({ error: '游戏服务尚未配置，请联系客服' }, { status: 503 });
  }

  const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? '';

  let erpRes: Response;
  try {
    erpRes = await fetch(`${ERP_URL}/api/games/launch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Secret': SVC_SECRET,
      },
      body: JSON.stringify({
        user_id: member.sub,
        provider_code,
        game_code,
        lobby_return_url: origin,
      }),
    });
  } catch (err) {
    console.error('[public/games/launch] ERP unreachable:', err);
    return NextResponse.json({ error: '游戏服务暂时无法连接，请稍后再试' }, { status: 502 });
  }

  const data = await erpRes.json() as {
    ok?: boolean; launch_url?: string; launch_mode?: string; error?: string;
  };

  if (!erpRes.ok || !data.launch_url) {
    return NextResponse.json(
      { error: data.error ?? '启动失败，请稍后再试' },
      { status: erpRes.status >= 400 ? erpRes.status : 502 },
    );
  }

  return NextResponse.json({
    launch_url:  data.launch_url,
    launch_mode: data.launch_mode ?? 'LOBBY',
  });
}
