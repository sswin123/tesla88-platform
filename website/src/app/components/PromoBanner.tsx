import type { PublicPromotion } from '@/lib/types';

interface Props {
  promotions: PublicPromotion[];
  currency?: string;
}

function bonusDisplay(p: PublicPromotion, currency: string) {
  return p.bonus_type === 'PERCENTAGE'
    ? `${parseFloat(p.bonus_value).toFixed(0)}%`
    : `${currency} ${parseFloat(p.bonus_value).toFixed(0)}`;
}

function bonusUnit(p: PublicPromotion) {
  return p.bonus_type === 'PERCENTAGE' ? '奖金' : '现金';
}

function isExpired(p: PublicPromotion) {
  if (!p.expiry_date) return false;
  return new Date(p.expiry_date) < new Date();
}

export default function PromoBanner({ promotions, currency = 'RM' }: Props) {
  if (promotions.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {promotions.map(p => {
        const expired = isExpired(p);
        return (
          <div
            key={p.id}
            className="casino-card relative overflow-hidden flex flex-col"
            style={expired ? { opacity: 0.5 } : undefined}
          >
            {/* Top accent bar */}
            <div
              className="h-1 w-full shrink-0"
              style={{
                background: expired
                  ? 'var(--border-mid)'
                  : 'linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))',
              }}
            />

            <div className="p-3 flex flex-col flex-1">
              {/* Big bonus value */}
              <div className="flex items-start justify-between mb-1.5">
                <p
                  className="text-2xl font-black leading-none"
                  style={{
                    color: expired ? 'var(--text-faint)' : 'var(--brand-primary)',
                    textShadow: expired ? 'none' : '0 0 20px color-mix(in srgb, var(--brand-primary) 50%, transparent)',
                  }}
                >
                  {bonusDisplay(p, currency)}
                </p>
                {expired ? (
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-faint)' }}
                  >
                    已过期
                  </span>
                ) : (
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
                    style={{
                      background: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
                      color: 'var(--brand-primary)',
                      border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',
                    }}
                  >
                    {bonusUnit(p)}
                  </span>
                )}
              </div>

              <h3
                className="font-semibold text-sm mb-1 leading-snug"
                style={{ color: 'var(--text-base)' }}
              >
                {p.name}
              </h3>

              {p.description && (
                <p
                  className="text-xs leading-relaxed mb-3 line-clamp-2 flex-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {p.description}
                </p>
              )}

              <div className="mt-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    最低存款 {currency} {parseFloat(p.min_deposit).toFixed(0)}
                  </span>
                  {p.expiry_date && !expired && (
                    <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                      至 {new Date(p.expiry_date).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                </div>

                {!expired && (
                  <a
                    href="/promotions"
                    className="casino-btn-primary block text-center py-2 text-sm w-full"
                  >
                    立即领取
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
