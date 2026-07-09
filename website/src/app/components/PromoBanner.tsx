import type { PublicPromotion } from '@/lib/types';

interface Props {
  promotions: PublicPromotion[];
}

function bonusLabel(p: PublicPromotion) {
  const val =
    p.bonus_type === 'PERCENTAGE'
      ? `${parseFloat(p.bonus_value).toFixed(0)}% Bonus`
      : `RM ${parseFloat(p.bonus_value).toFixed(0)} Bonus`;
  return val;
}

export default function PromoBanner({ promotions }: Props) {
  if (promotions.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {promotions.map(p => (
        <a
          key={p.id}
          href="/promotions"
          className="casino-card casino-card-hover block p-4 transition-all duration-200"
          style={{ textDecoration: 'none' }}
        >
          {/* Badge */}
          <span
            className="inline-block px-2 py-0.5 rounded text-xs font-bold mb-3"
            style={{
              background: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
              color: 'var(--brand-primary)',
              border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',
            }}
          >
            {bonusLabel(p)}
          </span>

          <h3
            className="font-semibold text-sm mb-1 leading-snug"
            style={{ color: 'var(--text-base)' }}
          >
            {p.name}
          </h3>

          {p.description && (
            <p
              className="text-xs leading-relaxed mb-3 line-clamp-2"
              style={{ color: 'var(--text-muted)' }}
            >
              {p.description}
            </p>
          )}

          <div className="flex items-center justify-between mt-auto">
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              Min deposit: RM {parseFloat(p.min_deposit).toFixed(0)}
            </span>
            {p.expiry_date && (
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                Ends {new Date(p.expiry_date).toLocaleDateString()}
              </span>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
