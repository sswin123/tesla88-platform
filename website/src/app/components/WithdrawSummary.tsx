function maskAccount(s: string): string {
  if (s.length <= 4) return s;
  return '*'.repeat(s.length - 4) + s.slice(-4);
}

interface Props {
  amount: number;
  bankName: string;
  bankAccount: string;
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

export default function WithdrawSummary({ amount, bankName, bankAccount, onConfirm, onBack, submitting }: Props) {
  return (
    <div className="space-y-4">
      <div className="casino-card p-5">
        <h3
          className="text-sm font-bold tracking-wider uppercase mb-4"
          style={{ color: 'var(--text-muted)' }}
        >
          确认提款详情
        </h3>

        <Row label="提款金额" value={`RM ${amount.toFixed(2)}`} highlight />
        <Row label="银行" value={bankName} />
        <Row label="账号" value={maskAccount(bankAccount)} />

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
            RM {amount.toFixed(2)}
          </span>
        </div>
      </div>

      <div
        className="text-xs px-4 py-3 rounded-xl"
        style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}
      >
        提款申请将在 1-3 个工作日内处理，请确保银行账号正确
      </div>

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
          {submitting ? '提交中…' : '确认提款'}
        </button>
      </div>
    </div>
  );
}
