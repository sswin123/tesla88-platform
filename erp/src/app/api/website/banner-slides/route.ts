import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requirePermission } from '@/lib/require_permission';

const HERO_TYPE = 'hero';

async function getHeroSection() {
  const { rows } = await pool.query<{ id: number; config: Record<string, unknown> }>(
    `SELECT id, config FROM homepage_sections WHERE section_type = $1 LIMIT 1`,
    [HERO_TYPE]
  );
  return rows[0] ?? null;
}

export async function GET() {
  const payload = await requirePermission('website.banner.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const section = await getHeroSection();
  if (!section) {
    return NextResponse.json({
      section_id: null,
      slides: [],
      autoplay_interval: 5000,
      show_arrows: true,
      show_dots: true,
    });
  }

  return NextResponse.json({
    section_id:        section.id,
    slides:            (section.config.slides as unknown[]) ?? [],
    autoplay_interval: (section.config.autoplay_interval as number) ?? 5000,
    show_arrows:       (section.config.show_arrows as boolean) ?? true,
    show_dots:         (section.config.show_dots as boolean) ?? true,
  });
}

export async function PUT(req: NextRequest) {
  const payload = await requirePermission('website.banner.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    slides: unknown[];
    autoplay_interval?: number;
    show_arrows?: boolean;
    show_dots?: boolean;
  };

  const newConfig = {
    slides:            body.slides ?? [],
    autoplay_interval: body.autoplay_interval ?? 5000,
    show_arrows:       body.show_arrows ?? true,
    show_dots:         body.show_dots ?? true,
  };

  const section = await getHeroSection();

  if (section) {
    await pool.query(
      `UPDATE homepage_sections SET config = $1 WHERE id = $2`,
      [JSON.stringify(newConfig), section.id]
    );
    return NextResponse.json({ ok: true, section_id: section.id });
  }

  // Create hero section if missing
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO homepage_sections (section_type, name, config, display_order, is_enabled)
     VALUES ($1, '横幅轮播', $2, 10, TRUE) RETURNING id`,
    [HERO_TYPE, JSON.stringify(newConfig)]
  );
  return NextResponse.json({ ok: true, section_id: rows[0].id });
}
