import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';

export const runtime = 'nodejs';

const WEBSITE_URL = process.env.WEBSITE_URL ?? 'http://localhost:3002';
const BOT_RELAY_AUTH_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  const payload = await requirePermission('livechat.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 });

  // Proxy file to website storage using relay auth — files land in website_uploads volume
  const proxyForm = new FormData();
  proxyForm.append('file', file);

  const proxyRes = await fetch(`${WEBSITE_URL}/api/livechat/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${BOT_RELAY_AUTH_TOKEN}` },
    body: proxyForm,
  }).catch((err: unknown) => {
    console.error('[erp-upload] proxy fetch failed:', err);
    return null;
  });

  if (!proxyRes || !proxyRes.ok) {
    const errText = await proxyRes?.text().catch(() => '');
    console.error('[erp-upload] website upload failed', proxyRes?.status, errText);
    return NextResponse.json({ error: 'Upload to website storage failed' }, { status: 502 });
  }

  const data = await proxyRes.json();
  return NextResponse.json(data, { status: 201 });
}
