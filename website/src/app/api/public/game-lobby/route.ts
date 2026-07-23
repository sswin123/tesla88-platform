import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// ── Icon shape (matches DB columns added in migration 044) ─────────────────────
export interface LobbyIconData {
  icon_type:      'none' | 'emoji' | 'image' | 'gif' | 'svg';
  icon_emoji:     string | null;
  icon_media_url: string | null;   // resolved URL, null when icon_type != image/gif
  icon_svg:       string | null;
}

// ── Unified card shape ────────────────────────────────────────────────────────
export interface PublicLobbyCard extends LobbyIconData {
  id: string;                   // 'p-{id}' | 'g-{id}'
  card_type: 'provider' | 'game';
  name: string;
  provider_id: number | null;
  provider_name: string | null;
  provider_code: string | null;
  category_code: string;        // from website_game_categories.category_code
  category_name: string;        // from website_game_categories.category_name
  thumbnail_url: string | null;
  banner_url: string | null;
  is_hot: boolean;
  is_new: boolean;
  is_maintenance: boolean;      // provider/game in maintenance mode
  launch_mode: string;          // LOBBY | DIRECT | EXTERNAL | DOWNLOAD | COMING_SOON
  display_mode: string;         // PROVIDER_CARD | GAME_LIST | BOTH
  display_order: number;
}

function mediaUrl(id: number | null): string | null {
  return id ? `/api/public/media/${id}` : null;
}

function iconData(r: {
  icon_type?: string;
  icon_emoji?: string | null;
  icon_media_id?: number | null;
  icon_svg?: string | null;
}): LobbyIconData {
  const t = (r.icon_type ?? 'none') as LobbyIconData['icon_type'];
  return {
    icon_type:      t,
    icon_emoji:     t === 'emoji' ? (r.icon_emoji ?? null) : null,
    icon_media_url: (t === 'image' || t === 'gif') ? mediaUrl(r.icon_media_id ?? null) : null,
    icon_svg:       t === 'svg' ? (r.icon_svg ?? null) : null,
  };
}

// ── Primary source: gp_providers (Provider Registry) ─────────────────────────
// Any provider with website_visible=TRUE automatically appears on the website.
// Providers NEVER require Games Library entries to display.
async function getGpProviderCards(): Promise<{ cards: PublicLobbyCard[]; codes: Set<string> }> {
  try {
    const res = await pool.query(
      `SELECT
         gp.id, gp.code, gp.display_name,
         gp.website_display_name, gp.website_logo_url, gp.website_banner_url,
         gp.website_category, gp.website_sort_order,
         gp.website_is_hot, gp.website_is_new,
         gp.website_maintenance,
         gp.website_launch_mode,
         COALESCE(gp.website_display_mode, 'PROVIDER_CARD') AS website_display_mode
       FROM gp_providers gp
       WHERE gp.website_visible = TRUE
         AND gp.status IN ('ACTIVE', 'TESTING', 'MAINTENANCE')
       ORDER BY gp.website_sort_order ASC NULLS LAST, gp.id ASC`,
    );

    const cards: PublicLobbyCard[] = res.rows.map(r => ({
      icon_type:      'none' as const,
      icon_emoji:     null,
      icon_media_url: null,
      icon_svg:       null,
      id:             `gp-${r.id}`,
      card_type:      'provider' as const,
      name:           r.website_display_name ?? r.display_name,
      provider_id:    r.id,
      provider_name:  r.website_display_name ?? r.display_name,
      provider_code:  r.code,
      category_code:  r.website_category ?? 'slot',
      category_name:  r.website_category ?? 'slot',
      thumbnail_url:  r.website_logo_url ?? null,
      banner_url:     r.website_banner_url ?? null,
      is_hot:         r.website_is_hot ?? false,
      is_new:         r.website_is_new ?? false,
      is_maintenance: r.website_maintenance ?? false,
      launch_mode:    r.website_launch_mode ?? 'LOBBY',
      display_mode:   r.website_display_mode ?? 'PROVIDER_CARD',
      display_order:  r.website_sort_order ?? 999,
    }));

    const codes = new Set(res.rows.map((r: { code: string }) => r.code as string));
    return { cards, codes };
  } catch {
    return { cards: [], codes: new Set() };
  }
}

// ── Fallback source: website_game_providers (legacy CMS table) ────────────────
// Only providers whose code is NOT already in gp_providers are included.
async function getLegacyProviderCards(excludeCodes: Set<string>): Promise<PublicLobbyCard[]> {
  try {
    const res = await pool.query(
      `SELECT
         p.id, p.provider_code, p.provider_name,
         p.logo_media_id, p.banner_media_id,
         p.is_hot, p.is_new, p.display_order,
         p.icon_type, p.icon_emoji, p.icon_media_id, p.icon_svg,
         COALESCE(c.category_code, p.category) AS category_code,
         COALESCE(c.category_name, p.category) AS category_name
       FROM website_game_providers p
       LEFT JOIN website_game_categories c ON c.id = p.category_id
       WHERE p.is_active = TRUE
       ORDER BY p.display_order ASC, p.id ASC`
    );

    return res.rows
      .filter((r: { provider_code: string }) => !excludeCodes.has(r.provider_code))
      .map(r => ({
        ...iconData(r),
        id:             `p-${r.id}`,
        card_type:      'provider' as const,
        name:           r.provider_name,
        provider_id:    r.id,
        provider_name:  r.provider_name,
        provider_code:  r.provider_code,
        category_code:  r.category_code ?? 'slot',
        category_name:  r.category_name ?? r.category_code ?? 'slot',
        thumbnail_url:  mediaUrl(r.logo_media_id),
        banner_url:     mediaUrl(r.banner_media_id),
        is_hot:         r.is_hot,
        is_new:         r.is_new,
        is_maintenance: false,
        launch_mode:    'LOBBY',
        display_mode:   'PROVIDER_CARD',
        display_order:  r.display_order,
      }));
  } catch {
    return [];
  }
}

async function getGameCards(): Promise<PublicLobbyCard[]> {
  try {
    const res = await pool.query(
      `SELECT
         g.id, g.game_name,
         g.thumbnail_media_id, g.banner_media_id,
         g.is_hot, g.is_new, g.display_order,
         g.provider_id, prov.provider_name, prov.provider_code,
         g.icon_type, g.icon_emoji, g.icon_media_id, g.icon_svg,
         COALESCE(c.category_code, g.category) AS category_code,
         COALESCE(c.category_name, g.category) AS category_name
       FROM website_games g
       LEFT JOIN website_game_providers prov ON prov.id = g.provider_id
       LEFT JOIN website_game_categories c ON c.id = g.category_id
       WHERE g.is_active = TRUE
       ORDER BY g.display_order ASC, g.id ASC`
    );
    return res.rows.map(r => ({
      ...iconData(r),
      id:             `g-${r.id}`,
      card_type:      'game' as const,
      name:           r.game_name,
      provider_id:    r.provider_id,
      provider_name:  r.provider_name ?? null,
      provider_code:  r.provider_code ?? null,
      category_code:  r.category_code ?? 'slot',
      category_name:  r.category_name ?? r.category_code ?? 'slot',
      thumbnail_url:  mediaUrl(r.thumbnail_media_id),
      banner_url:     mediaUrl(r.banner_media_id),
      is_hot:         r.is_hot,
      is_new:         r.is_new,
      is_maintenance: false,
      launch_mode:    'DIRECT',
      display_mode:   'GAME_LIST',
      display_order:  r.display_order,
    }));
  } catch {
    return [];
  }
}

// ── Merged provider cards: gp_providers PRIMARY + website_game_providers FALLBACK
async function getProviderCards(): Promise<PublicLobbyCard[]> {
  const { cards: gpCards, codes: gpCodes } = await getGpProviderCards();
  const legacyCards = await getLegacyProviderCards(gpCodes);
  return [...gpCards, ...legacyCards].sort((a, b) => a.display_order - b.display_order);
}

// ── GET /api/public/game-lobby?source=platform|games|mixed ───────────────────

export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get('source') ?? 'platform';

  try {
    let cards: PublicLobbyCard[] = [];

    if (source === 'platform') {
      cards = await getProviderCards();
    } else if (source === 'games') {
      cards = await getGameCards();
    } else if (source === 'mixed') {
      const [gameCards, providerCards] = await Promise.all([getGameCards(), getProviderCards()]);
      const providersWithGames = new Set(gameCards.map(g => g.provider_id).filter(Boolean));
      const remainingProviders = providerCards.filter(p => !providersWithGames.has(p.provider_id));
      cards = [...gameCards, ...remainingProviders].sort((a, b) => a.display_order - b.display_order);
    } else {
      cards = await getProviderCards();
    }

    return NextResponse.json(cards, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET /api/public/game-lobby', err);
    return NextResponse.json([], { status: 200 });
  }
}
