'use client';
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
  const selectedPromo = promotions.find(p => p.id === selectedId) ?? null;
  const bonus = selectedPromo && depositAmount > 0 ? calcBonus(selectedPromo, depositAmount) : 0;

  if (promotions.length === 0) {
    return (
      <p className="text-sm text-center py-4" style={{ color: 'var(--text-faint)' }}>
        暂无可用优惠
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <select
        value={selectedId ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full px-3 py-2.5 rounded-xl text-sm appearance-none"
        style={{
          background: 'var(--bg-surface3)',
          border: '1px solid var(--border-mid)',
          color: 'var(--text-base)',
          outline: 'none',
        }}
      >
        <option value="">不使用优惠</option>
        {promotions.map(p => {
          const eligible = depositAmount <= 0 || depositAmount >= parseFloat(p.min_deposit);
          return (
            <option key={p.id} value={p.id} disabled={!eligible}>
              {p.name}
              {!eligible ? ` (最低 RM${parseFloat(p.min_deposit).toFixed(0)})` : ''}
            </option>
          );
        })}
      </select>

      {selectedPromo && (
        <div
          className="rounded-xl p-4 space-y-2"
          style={{
            background: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base font-black" style={{ color: 'var(--brand-primary)' }}>
              {selectedPromo.bonus_type === 'PERCENTAGE'
                ? `${parseFloat(selectedPromo.bonus_value).toFixed(0)}%`
                : `RM ${parseFloat(selectedPromo.bonus_value).toFixed(0)}`}
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-base)' }}>
              {selectedPromo.name}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              最低存款 RM {parseFloat(selectedPromo.min_deposit).toFixed(0)}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              流水 ×{parseFloat(selectedPromo.turnover_multiplier).toFixed(1)}
            </span>
            {selectedPromo.max_bonus && (
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                最高 RM {parseFloat(selectedPromo.max_bonus).toFixed(0)}
              </span>
            )}
          </div>
          {bonus > 0 && (
            <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>
              预计奖金 +RM {bonus.toFixed(2)}
            </p>
          )}
          {depositAmount > 0 && depositAmount < parseFloat(selectedPromo.min_deposit) && (
            <p className="text-xs" style={{ color: '#f97316' }}>
              存款需达 RM {parseFloat(selectedPromo.min_deposit).toFixed(0)} 才可使用此优惠
            </p>
          )}
        </div>
      )}
    </div>
  );
}
