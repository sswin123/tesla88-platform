import { NextResponse } from 'next/server';
import pool from '@/lib/db';

interface MediaInfo {
  url: string;
  media_type: string;
  mime_type: string;
  width: number | null;
  height: number | null;
}

async function resolveMedia(mediaId: number | null | undefined): Promise<MediaInfo | null> {
  if (!mediaId) return null;
  try {
    const { rows } = await pool.query<{ media_type: string; mime_type: string; width: number | null; height: number | null }>(
      'SELECT media_type, mime_type, width, height FROM media_library WHERE id = $1',
      [mediaId]
    );
    if (!rows[0]) return null;
    return {
      url:        `/api/public/media/${mediaId}`,
      media_type: rows[0].media_type,
      mime_type:  rows[0].mime_type,
      width:      rows[0].width,
      height:     rows[0].height,
    };
  } catch {
    return null;
  }
}

type Config = Record<string, unknown>;

async function enrichConfig(sectionType: string, config: Config): Promise<Config> {
  if (sectionType === 'hero') {
    const slides = (config.slides as Config[]) ?? [];
    const enriched = await Promise.all(
      slides.map(async slide => {
        const [desktop, mobile] = await Promise.all([
          resolveMedia(slide.desktop_media_id as number | null),
          resolveMedia(slide.mobile_media_id as number | null),
        ]);
        return { ...slide, desktop_media: desktop, mobile_media: mobile };
      })
    );
    return { ...config, slides: enriched };
  }

  if (sectionType === 'quick_menu') {
    const items = (config.items as Config[]) ?? [];
    const enriched = await Promise.all(
      items.map(async item => {
        const media = await resolveMedia(item.media_id as number | null);
        return { ...item, media };
      })
    );
    return { ...config, items: enriched };
  }

  return config;
}

export async function GET() {
  try {
    const { rows } = await pool.query<{
      id: number;
      section_type: string;
      name: string;
      config: Config;
      display_order: number;
    }>(
      `SELECT id, section_type, name, config, display_order
       FROM homepage_sections
       WHERE is_enabled = TRUE
         AND (start_at IS NULL OR start_at <= NOW())
         AND (end_at   IS NULL OR end_at   >  NOW())
       ORDER BY display_order ASC, id ASC`
    );

    const enriched = await Promise.all(
      rows.map(async row => ({
        ...row,
        config: await enrichConfig(row.section_type, row.config),
      }))
    );

    return NextResponse.json(enriched, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[public/homepage] error:', err);
    return NextResponse.json([], { status: 200 });
  }
}
