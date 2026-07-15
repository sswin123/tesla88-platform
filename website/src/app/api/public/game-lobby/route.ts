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

async function getProviderCards(): Promise<PublicLobbyCard[]> {
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
  return res.rows.map(r => ({
    ...iconData(r),
    id:            `p-${r.id}`,
    card_type:     'provider' as const,
    name:          r.provider_name,
    provider_id:   r.id,
    provider_name: r.provider_name,
    provider_code: r.provider_code,
    category_code: r.category_code ?? 'slot',
    category_name: r.category_name ?? r.category_code ?? 'slot',
    thumbnail_url: mediaUrl(r.logo_media_id),
    banner_url:    mediaUrl(r.banner_media_id),
    is_hot:        r.is_hot,
    is_new:        r.is_new,
    display_order: r.display_order,
  }));
}

async function getGameCards(): Promise<PublicLobbyCard[]> {
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
    id:            `g-${r.id}`,
    card_type:     'game' as const,
    name:          r.game_name,
    provider_id:   r.provider_id,
    provider_name: r.provider_name ?? null,
    provider_code: r.provider_code ?? null,
    category_code: r.category_code ?? 'slot',
    category_name: r.category_name ?? r.category_code ?? 'slot',
    thumbnail_url: mediaUrl(r.thumbnail_media_id),
    banner_url:    mediaUrl(r.banner_media_id),
    is_hot:        r.is_hot,
    is_new:        r.is_new,
    display_order: r.display_order,
  }));
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
