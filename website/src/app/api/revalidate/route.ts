import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag }             from 'next/cache';

const SECRET = process.env.REVALIDATE_SECRET ?? '';

/**
 * POST /api/revalidate
 * Body: { tag: string, secret: string }
 *
 * Called by ERP after publishing a partner site to invalidate the ISR cache.
 * Guards: requires REVALIDATE_SECRET to prevent unauthorized cache busting.
 */
export async function POST(req: NextRequest) {
  if (!SECRET) {
    return NextResponse.json({ error: 'Revalidation not configured' }, { status: 503 });
  }

  let body: { tag?: string; secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.secret !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!body.tag || typeof body.tag !== 'string') {
    return NextResponse.json({ error: 'tag is required' }, { status: 400 });
  }

  revalidateTag(body.tag);

  return NextResponse.json({
    revalidated: true,
    tag:         body.tag,
    timestamp:   new Date().toISOString(),
  });
}
