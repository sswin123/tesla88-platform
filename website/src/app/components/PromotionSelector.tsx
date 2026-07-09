import type { PublicPromotion } from '@/lib/types';

interface Props {
  promotions: PublicPromotion[];
  selectedId: number | null;
  depositAmount: number;
  onChange: (id: number | null) => void;
}

function calcBonus(p: PublicPromotion, amount: number): number {
  if (amount < parseFloat(p.min_deposit)) return 0;
  if (p.bonus_type === 'PERCENTAGE') {
    const raw = amount * (parseFloat(p.bonus_value) / 100);
    return p.max_bonus ? Math.min(raw, parseFloat(p.max_bonus)) : raw;
  }
  return parseFloat(p.bonus_value);
}

export default function PromotionSelector({ promotions, selectedId, depositAmount, onChange }: Props) {
  if (promotions.length === 0) {
    return (
      <p className="text-sm text-center py-4" style={{ color: 'var(--text-faint)' }}>
        暂无可用优惠
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* No promo option */}
      <label
        className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
        style={{
          background: selectedId === null ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' : 'var(--bg-surface3)',
          border: `1px solid ${selectedId === null ? 'color-mix(in srgb, var(--brand-primary) 40%, transparent)' : 'var(--border-dim)'}`,
        }}
      >
        <input
          type="radio"
          name="promotion"
          checked={selectedId === null}
          onChange={() => onChange(null)}
          className="sr-only"
        />
        <span
          className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
          style={{ borderColor: selectedId === null ? 'var(--brand-primary)' : 'var(--border-mid)' }}
        >
          {selectedId === null && (
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--brand-primary)' }} />
          )}
        </span>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          不使用优惠
        </span>
      </label>

      {promotions.map(p => {
        const bonus = depositAmount > 0 ? calcBonus(p, depositAmount) : null;
        const eligible = depositAmount <= 0 || depositAmount >= parseFloat(p.min_deposit);
        const selected = selectedId === p.id;

        return (
          <label
            key={p.id}
            className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all"
            style={{
              background: selected ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' : 'var(--bg-surface3)',
              border: `1px solid ${selected ? 'color-mix(in srgb, var(--brand-primary) 40%, transparent)' : 'var(--border-dim)'}`,
              opacity: eligible ? 1 : 0.5,
            }}
          >
            <input
              type="radio"
              name="promotion"
              disabled={!eligible}
              checked={selected}
              onChange={() => eligible && onChange(p.id)}
              className="sr-only"
            />
            <span
              className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5"
              style={{ borderColor: selected ? 'var(--brand-primary)' : 'var(--border-mid)' }}
            >
              {selected && (
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--brand-primary)' }} />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="text-base font-black"
                  style={{ color: 'var(--brand-primary)' }}
                >
                  {p.bonus_type === 'PERCENTAGE'
                    ? `${parseFloat(p.bonus_value).toFixed(0)}%`
                    : `RM ${parseFloat(p.bonus_value).toFixed(0)}`}
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-base)' }}>
                  {p.name}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  最低存款 RM {parseFloat(p.min_deposit).toFixed(0)}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  流水 ×{parseFloat(p.turnover_multiplier).toFixed(1)}
                </span>
                {p.max_bonus && (
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    最高 RM {parseFloat(p.max_bonus).toFixed(0)}
                  </span>
                )}
              </div>
              {bonus !== null && bonus > 0 && (
                <p className="text-xs mt-1" style={{ color: '#22c55e' }}>
                  预计奖金 +RM {bonus.toFixed(2)}
                </p>
              )}
              {!eligible && depositAmount > 0 && (
                <p className="text-xs mt-1" style={{ color: '#f97316' }}>
                  存款需达 RM {parseFloat(p.min_deposit).toFixed(0)} 才可使用
                </p>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}
