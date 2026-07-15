import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

// One-time migration runner for additive schema changes.
// Only super-admins can trigger this.
export async function POST() {
  const payload = await requirePermission('brand.settings');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results: string[] = [];

  // Migration 024: theme color columns
  try {
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_bg   TEXT NOT NULL DEFAULT '#0a0b14'`);
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_card TEXT NOT NULL DEFAULT '#111222'`);
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS color_text TEXT NOT NULL DEFAULT '#e8e8f5'`);
    results.push('024_theme_colors: OK');
  } catch (e) {
    results.push(`024_theme_colors: ERROR — ${String(e)}`);
  }

  // Migration 025: logo size and alignment
  try {
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS logo_size  VARCHAR(10) NOT NULL DEFAULT 'medium'`);
    await pool.query(`ALTER TABLE brand_settings ADD COLUMN IF NOT EXISTS logo_align VARCHAR(10) NOT NULL DEFAULT 'left'`);
    results.push('025_logo_settings: OK');
  } catch (e) {
    results.push(`025_logo_settings: ERROR — ${String(e)}`);
  }

  return NextResponse.json({ ok: true, results });
}
