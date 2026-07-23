import { NextResponse } from 'next/server';
import { getAllTemplates } from '@/lib/repositories/partner_repo';

export async function GET() {
  try {
    const templates = await getAllTemplates();
    return NextResponse.json(templates);
  } catch (e) {
    console.error('[partner-builder/templates GET]', e);
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 });
  }
}
