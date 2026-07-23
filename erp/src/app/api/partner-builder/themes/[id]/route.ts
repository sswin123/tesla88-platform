import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getThemeById, updateTheme } from '@/lib/repositories/partner_repo';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const theme = await getThemeById(Number(id));
  if (!theme) return NextResponse.json({ error: 'Theme not found' }, { status: 404 });

  return NextResponse.json({ theme });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await getThemeById(Number(id));
  if (!existing) return NextResponse.json({ error: 'Theme not found' }, { status: 404 });

  let body: {
    name?: string;
    preview_color?: string;
    preview_gradient?: string | null;
    css_variables?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  /* Validate: css_variables keys must start with --pb- */
  if (body.css_variables) {
    const bad = Object.keys(body.css_variables).filter(k => !k.startsWith('--pb-'));
    if (bad.length > 0) {
      return NextResponse.json(
        { error: `Invalid variable keys: ${bad.join(', ')}. All keys must start with --pb-` },
        { status: 400 }
      );
    }
  }

  const updated = await updateTheme(Number(id), body);
  return NextResponse.json({ theme: updated });
}
