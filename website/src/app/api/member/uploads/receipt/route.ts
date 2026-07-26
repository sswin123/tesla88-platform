import { NextRequest, NextResponse } from 'next/server';
import { getMember } from '@/lib/member-auth';

export const runtime = 'nodejs';

// Delegate all file I/O to ERP's MediaService via internal Docker network.
// Website never touches the filesystem — ERP is the single storage authority.
const ERP_INTERNAL_URL = (process.env.ERP_INTERNAL_URL ?? '').replace(/\/$/, '');
const INTERNAL_TOKEN   = process.env.BOT_RELAY_AUTH_TOKEN ?? '';

const MAX_SIZE    = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(req: NextRequest) {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const file = form.get('file') as File | null;
  if (!file)                    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_SIZE)     return NextResponse.json({ error: '文件过大（最大10MB）' }, { status: 413 });
  if (!ALLOWED_MIME.has(file.type))
    return NextResponse.json({ error: '只支持 JPG、PNG、WEBP、GIF 格式' }, { status: 415 });

  if (!ERP_INTERNAL_URL) {
    console.error('[uploads/receipt] ERP_INTERNAL_URL not configured');
    return NextResponse.json({ error: '上传服务未配置，请联系客服' }, { status: 503 });
  }

  const erpForm = new FormData();
  erpForm.append('file', file);

  let erpRes: Response;
  try {
    erpRes = await fetch(`${ERP_INTERNAL_URL}/api/internal/media/upload`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${INTERNAL_TOKEN}` },
      body:    erpForm,
      signal:  AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error('[uploads/receipt] ERP internal upload request failed:', err);
    return NextResponse.json({ error: '上传失败，请重试' }, { status: 502 });
  }

  if (!erpRes.ok) {
    const body = await erpRes.json().catch(() => ({})) as { error?: string };
    if (erpRes.status === 422) {
      return NextResponse.json({ error: '不支持的文件格式' }, { status: 415 });
    }
    console.error('[uploads/receipt] ERP internal upload error:', erpRes.status, body);
    return NextResponse.json({ error: '上传失败，请重试' }, { status: 500 });
  }

  const data = await erpRes.json() as { media_id: number };
  return NextResponse.json({ ok: true, media_id: data.media_id }, { status: 200 });
}
