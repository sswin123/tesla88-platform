import pool from '@/lib/db';
import type { PublicPromotion } from '@/lib/types';
import HeroSlider from './components/HeroSlider';
import GameLobby from './components/GameLobby';
import PromoBanner from './components/PromoBanner';
import LiveTransaction from './components/LiveTransaction';

export const dynamic = 'force-dynamic';

async function getPromotions(): Promise<PublicPromotion[]> {
  try {
    const res = await pool.query<PublicPromotion>(
      `SELECT id, name, description, promotion_type, bonus_type, bonus_value,
              min_deposit, max_bonus, turnover_multiplier, expiry_date
       FROM promotions
       WHERE is_active = TRUE AND deleted_at IS NULL
       ORDER BY id DESC LIMIT 6`
    );
    return res.rows;
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const promotions = await getPromotions();

  return (
    <div className="flex flex-col gap-8">

      {/* ── Hero Slider ───────────────────────────────────────── */}
      <HeroSlider />

      {/* ── Quick links ───────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-4 gap-3">
          {([
            { emoji: '📱', label: '下载APP',  href: '/download' },
            { emoji: '💬', label: '在线客服', href: '/chat' },
            { emoji: '🎁', label: '优惠活动', href: '/promotions' },
            { emoji: '👤', label: '我的账户', href: '/dashboard' },
          ] as const).map(link => (
            <a
              key={link.href}
              href={link.href}
              className="casino-card casino-card-hover p-3 flex flex-col items-center text-center gap-1.5 transition-all"
              style={{ textDecoration: 'none' }}
            >
              <span className="text-xl">{link.emoji}</span>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-base)' }}>
                {link.label}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* ── Game Lobby ────────────────────────────────────────── */}
      <GameLobby />

      {/* ── Featured Promotions ───────────────────────────────── */}
      {promotions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>
              精选优惠
            </h2>
            <a
              href="/promotions"
              className="text-xs font-medium"
              style={{ color: 'var(--brand-primary)' }}
            >
              查看全部 →
            </a>
          </div>
          <PromoBanner promotions={promotions} />
        </section>
      )}

      {/* ── Live Transaction Feed ─────────────────────────────── */}
      <LiveTransaction />

    </div>
  );
}
