import type { PublicPromotion } from '@/lib/types';

interface Props {
  amount: number;
  provider: string;
  paymentBank: string;
  promotion: PublicPromotion | null;
  bonusAmount: number;
  turnoverRequired: number;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border-dim)' }}>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className="text-sm font-semibold"
        style={{ color: highlight ? 'var(--brand-primary)' : 'var(--text-base)' }}
      >
        {value}
      </span>
    </div>
  );
}

export default function DepositSummary({
  amount,
  provider,
  paymentBank,
  promotion,
  bonusAmount,
  turnoverRequired,
  onConfirm,
  onBack,
  submitting,
}: Props) {
  const creditAmount = amount + bonusAmount;

  return (
    <div className="space-y-4">
      <div className="casino-card p-5">
        <h3
          className="text-sm font-bold tracking-wider uppercase mb-4"
          style={{ color: 'var(--text-muted)' }}
        >
          确认存款详情
        </h3>

        <Row label="存款金额" value={`RM ${amount.toFixed(2)}`} />
        <Row label="游戏" value={provider} />
        <Row label="付款方式" value={paymentBank} />

        {promotion && (
          <>
            <Row label="优惠活动" value={promotion.name} />
            <Row
              label="奖金"
              value={bonusAmount > 0 ? `+RM ${bonusAmount.toFixed(2)}` : '不符合条件'}
              highlight={bonusAmount > 0}
            />
            {bonusAmount > 0 && (
              <Row
                label="流水要求"
                value={`RM ${turnoverRequired.toFixed(2)}`}
              />
            )}
          </>
        )}

        {/* Total */}
        <div className="flex items-center justify-between pt-4 mt-1">
          <span className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>
            预计到账
          </span>
          <span
            className="text-2xl font-black"
            style={{
              color: 'var(--brand-primary)',
              textShadow: '0 0 16px color-mix(in srgb, var(--brand-primary) 50%, transparent)',
            }}
          >
            RM {creditAmount.toFixed(2)}
          </span>
        </div>
      </div>

      <p className="text-xs text-center px-2" style={{ color: 'var(--text-faint)' }}>
        提交后请完成转账，审核后金额将存入您的账户
      </p>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={submitting}
          className="casino-btn-outline flex-1 py-3 text-sm font-semibold disabled:opacity-50"
        >
          返回修改
        </button>
        <button
          onClick={onConfirm}
          disabled={submitting}
          className="casino-btn-primary flex-1 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? '提交中…' : '确认提交'}
        </button>
      </div>
    </div>
  );
}
