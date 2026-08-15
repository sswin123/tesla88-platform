import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { parseFooterConfig } from '@/lib/footer-config';

export const dynamic = 'force-dynamic';

// Public footer config — only ever reads the published `footer_config` key,
// never `footer_config_draft`. Unpublished edits made in the ERP Footer
// Builder are never visible here.
export async function GET() {
  try {
    const res = await pool.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'footer_config'`
    );
    const raw = res.rows[0]?.value;
    if (!raw) return NextResponse.json(null);
    const config = parseFooterConfig(raw);
    return NextResponse.json(config, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(null);
  }
}
