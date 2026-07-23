import { NextResponse } from 'next/server';
import { getAllThemes } from '@/lib/repositories/partner_repo';

export async function GET() {
  try {
    const themes = await getAllThemes();
    return NextResponse.json(themes);
  } catch (e) {
    console.error('[partner-builder/themes GET]', e);
    return NextResponse.json({ error: 'Failed to load themes' }, { status: 500 });
  }
}
