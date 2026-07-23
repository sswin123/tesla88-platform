import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export interface PublicGameProvider {
  id: number;
  provider_code: string;
  provider_name: string;
  category: 'slot' | 'live' | 'sport' | 'fishing';
  logo_media_id: number | null;
  banner_media_id: number | null;
  logo_url: string | null;
  banner_url: string | null;
  is_hot: boolean;
  is_new: boolean;
  is_maintenance: boolean;
  display_order: number;
  launch_mode: 'LOBBY' | 'DIRECT';
}

/**
 * Wraps an external https:// URL in the website's image-proxy endpoint so the
 * browser receives a same-origin URL and satisfies CSP `img-src 'self'`.
 * Relative URLs (already same-origin) are returned unchanged.
 */
function proxied(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('https://') || url.startsWith('http://')) {
    return `/api/public/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

/**
 * GET /api/public/game-providers
 *
 * Returns the visible provider list for the website Game Lobby.
 *
 * Primary source: gp_providers (where website_visible=TRUE) — managed in ERP Gaming Platform.
 * Fallback:       website_game_providers (legacy, for providers not yet in gp_providers).
 *
 * gp_providers always wins if both tables have the same provider_code.
 */
export async function GET() {
  try {
    // ── 1. ERP-managed providers ───────────────────────────────────────────
    const gpRes = await pool.query<{
      id: number; code: string; name: string; website_display_name: string | null;
      website_category: string; website_logo_url: string | null;
      website_banner_url: string | null; website_is_hot: boolean;
      website_is_new: boolean; website_maintenance: boolean;
      website_sort_order: number; website_launch_mode: string;
    }>(
      `SELECT id, code, name, website_display_name,
              website_category, website_logo_url, website_banner_url,
              website_is_hot, website_is_new, website_maintenance,
              website_sort_order, website_launch_mode
       FROM gp_providers
       WHERE website_visible = TRUE
         AND status IN ('ACTIVE', 'TESTING', 'MAINTENANCE')
       ORDER BY website_sort_order ASC, id ASC`,
    );

    const gpCodes = new Set(gpRes.rows.map(r => r.code));

    // ── 2. Legacy CMS providers (not yet managed in ERP) ──────────────────
    const wgpRes = await pool.query<{
      id: number; provider_code: string; provider_name: string;
      category: string; logo_media_id: number | null; banner_media_id: number | null;
      is_hot: boolean; is_new: boolean; display_order: number;
    }>(
      `SELECT id, provider_code, provider_name, category,
              logo_media_id, banner_media_id, is_hot, is_new, display_order
       FROM website_game_providers
       WHERE is_active = TRUE
       ORDER BY display_order ASC, id ASC`,
    );

    // ── 3. Merge ───────────────────────────────────────────────────────────
    const merged: PublicGameProvider[] = [];

    for (const r of gpRes.rows) {
      merged.push({
        id:              r.id,
        provider_code:   r.code,
        provider_name:   r.website_display_name ?? r.name,
        category:        (r.website_category ?? 'slot') as PublicGameProvider['category'],
        logo_media_id:   null,
        banner_media_id: null,
        logo_url:        proxied(r.website_logo_url),
        banner_url:      proxied(r.website_banner_url),
        is_hot:          r.website_is_hot,
        is_new:          r.website_is_new,
        is_maintenance:  r.website_maintenance,
        display_order:   r.website_sort_order,
        launch_mode:     (r.website_launch_mode ?? 'LOBBY') as 'LOBBY' | 'DIRECT',
      });
    }

    // Add legacy entries whose provider_code isn't covered by gp_providers
    for (const r of wgpRes.rows) {
      if (!gpCodes.has(r.provider_code)) {
        merged.push({
          id:              r.id,
          provider_code:   r.provider_code,
          provider_name:   r.provider_name,
          category:        r.category as PublicGameProvider['category'],
          logo_media_id:   r.logo_media_id,
          banner_media_id: r.banner_media_id,
          logo_url:        null,
          banner_url:      null,
          is_hot:          r.is_hot,
          is_new:          r.is_new,
          is_maintenance:  false,
          display_order:   r.display_order,
          launch_mode:     'LOBBY',
        });
      }
    }

    return NextResponse.json(merged);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
