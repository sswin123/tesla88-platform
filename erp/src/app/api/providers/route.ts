import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getAllProviders, createProvider } from '@/lib/repositories/provider_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

export async function GET() {
  const providers = await getAllProviders();
  return NextResponse.json({ providers });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (payload.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    name?: string;
    display_name?: string;
    description?: string | null;
    logo_url?: string | null;
    sort_order?: number;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.name || !body.display_name) {
    return NextResponse.json(
      { error: 'name and display_name are required' },
      { status: 400 }
    );
  }

  const provider = await createProvider({
    name:         body.name,
    display_name: body.display_name,
    description:  body.description ?? null,
    logo_url:     body.logo_url ?? null,
    sort_order:   body.sort_order ?? 0,
  });
  logAudit({
    admin_id: payload.sub,
    action: 'PROVIDER_CREATED',
    target_type: 'provider',
    target_id: provider.id,
    new_value: { name: body.name, display_name: body.display_name },
  }).catch(() => {});
  return NextResponse.json({ provider }, { status: 201 });
}
