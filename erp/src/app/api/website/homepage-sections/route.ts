import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

export async function GET() {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query(
    'SELECT * FROM homepage_sections ORDER BY display_order ASC, id ASC'
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('website.builder.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    section_type: string;
    name?: string;
    config?: Record<string, unknown>;
    display_order?: number;
    is_enabled?: boolean;
    start_at?: string | null;
    end_at?: string | null;
  };

  const { section_type, name, config = {}, display_order = 0, is_enabled = true, start_at = null, end_at = null } = body;
  if (!section_type) return NextResponse.json({ error: 'section_type required' }, { status: 400 });

  const { rows } = await pool.query(
    `INSERT INTO homepage_sections (section_type, name, config, display_order, is_enabled, start_at, end_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [section_type, name ?? section_type, JSON.stringify(config), display_order, is_enabled, start_at, end_at]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
