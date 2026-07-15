export interface TxRecord {
  id: number;
  type: 'TOP_UP' | 'WITHDRAW';
  amount: string;
  bonus?: string | null;
  status: string;
  method?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  created_at: string;
}

function StatusDot({ status }: { status: string }) {
  const norm = status === 'PAID' ? 'APPROVED' : status;
  const map: Record<string, { color: string; label: string }> = {
    PENDING:  { color: '#eab308', label: '待审核' },
    APPROVED: { color: '#22c55e', label: '已批准' },
    REJECTED: { color: '#ef4444', label: '已拒绝' },
  };
  const cfg = map[norm] ?? { color: 'var(--text-muted)', label: norm };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}88` }}
      />
      <span className="text-xs font-semibold" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </span>
  );
}

function TypeBadge({ type }: { type: TxRecord['type'] }) {
  const isDeposit = type === 'TOP_UP';
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-bold"
      style={{
        background: isDeposit ? 'rgba(34,197,94,0.12)' : 'rgba(249,115,22,0.12)',
        color: isDeposit ? '#22c55e' : '#f97316',
      }}
    >
      {isDeposit ? '存款' : '取款'}
    </span>
  );
}

function fmt(n: string | number) {
  const v = parseFloat(String(n));
  return isNaN(v) ? 'RM 0.00' : `RM ${v.toFixed(2)}`;
}

function maskAccount(acc: string) {
  if (!acc || acc.length < 4) return acc;
  return `${'*'.repeat(Math.max(0, acc.length - 4))}${acc.slice(-4)}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ── Mobile card ────────────────────────────────────────────────── */
function MobileCard({ tx }: { tx: TxRecord }) {
  const methodLabel = tx.method ?? (tx.bank_name ? tx.bank_name : '手动');
  const bankDetail  = tx.bank_account ? maskAccount(tx.bank_account) : null;

  return (
    <div
      className="casino-card p-3 lg:hidden"
      style={{ borderLeft: `3px solid ${tx.type === 'TOP_UP' ? '#22c55e' : '#f97316'}` }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <TypeBadge type={tx.type} />
        <StatusDot status={tx.status} />
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p
            className="text-xs mb-0.5"
            style={{ color: 'var(--text-faint)' }}
          >
            #{tx.id} · {methodLabel}{bankDetail ? ` · ${bankDetail}` : ''}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {fmtDate(tx.created_at)}
          </p>
        </div>
        <div className="text-right">
          <p
            className="text-base font-bold"
            style={{ color: tx.type === 'TOP_UP' ? '#22c55e' : '#f97316' }}
          >
            {tx.type === 'TOP_UP' ? '+' : '-'}{fmt(tx.amount)}
          </p>
          {tx.bonus && parseFloat(tx.bonus) > 0 && (
            <p className="text-xs" style={{ color: 'var(--brand-primary)' }}>
              +{fmt(tx.bonus)} 奖金
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Desktop table row ──────────────────────────────────────────── */
function DesktopRow({ tx }: { tx: TxRecord }) {
  const methodLabel = tx.method ?? (tx.bank_name ? tx.bank_name : '手动');
  const bankDetail  = tx.bank_account ? maskAccount(tx.bank_account) : null;

  return (
    <div
      className="casino-row-hover hidden lg:grid items-center px-5 py-3 transition-colors"
      style={{
        gridTemplateColumns: '90px 80px 1fr 1fr 1fr 110px',
        gap: '1rem',
        borderBottom: '1px solid var(--border-dim)',
      }}
    >
      <TypeBadge type={tx.type} />
      <span className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>
        #{tx.id}
      </span>
      <span
        className="text-sm font-bold"
        style={{ color: tx.type === 'TOP_UP' ? '#22c55e' : '#f97316' }}
      >
        {tx.type === 'TOP_UP' ? '+' : '-'}{fmt(tx.amount)}
        {tx.bonus && parseFloat(tx.bonus) > 0 && (
          <span className="ml-1 text-xs" style={{ color: 'var(--brand-primary)' }}>
            +{fmt(tx.bonus)}
          </span>
        )}
      </span>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {methodLabel}{bankDetail ? ` · ${bankDetail}` : ''}
      </span>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {fmtDate(tx.created_at)}
      </span>
      <StatusDot status={tx.status} />
    </div>
  );
}

/* ── Exported component ─────────────────────────────────────────── */
export default function TransactionCard({ tx }: { tx: TxRecord }) {
  return (
    <>
      <MobileCard tx={tx} />
      <DesktopRow tx={tx} />
    </>
  );
}
