'use client';
import { useState, useEffect } from 'react';
import TransactionCard, { type TxRecord } from './TransactionCard';

/* ── Raw API shapes ─────────────────────────────────────────────── */
interface DepositRow {
  id: number;
  deposit_amount: string;
  bonus_amount: string | null;
  status: string;
  provider: string | null;
  created_at: string;
}
interface WithdrawRow {
  id: number;
  withdraw_amount: string;
  status: string;
  bank_name: string | null;
  bank_account: string | null;
  reject_reason: string | null;
  receipt_media_id: number | null;
  created_at: string;
}

const PAGE_SIZE = 15;

function toTx(d: DepositRow): TxRecord {
  return {
    id: d.id,
    type: 'TOP_UP',
    amount: d.deposit_amount,
    bonus: d.bonus_amount,
    status: d.status,
    method: d.provider ?? '手动',
    created_at: d.created_at,
  };
}

function toWithdraw(w: WithdrawRow): TxRecord {
  return {
    id: w.id,
    type: 'WITHDRAW',
    amount: w.withdraw_amount,
    status: w.status,
    bank_name: w.bank_name,
    bank_account: w.bank_account,
    reject_reason: w.reject_reason,
    receipt_media_id: w.receipt_media_id,
    created_at: w.created_at,
  };
}

/* ── Desktop table header ───────────────────────────────────────── */
function TableHeader() {
  return (
    <div
      className="hidden lg:grid px-5 py-3 text-xs font-bold tracking-wider uppercase"
      style={{
        gridTemplateColumns: '90px 80px 1fr 1fr 1fr 110px',
        gap: '1rem',
        color: 'var(--text-faint)',
        borderBottom: '1px solid var(--border-mid)',
      }}
    >
      <span>类型</span>
      <span>流水号</span>
      <span>金额</span>
      <span>方式 / 银行</span>
      <span>时间</span>
      <span>状态</span>
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="py-10 text-center">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-xl"
        style={{ background: 'var(--bg-surface3)' }}
      >
        📋
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
        暂无交易记录
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
        存款或取款后将显示在此处
      </p>
    </div>
  );
}

/* ── Bet records placeholder ────────────────────────────────────── */
function BetPlaceholder() {
  return (
    <div className="py-10 text-center">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 text-xl"
        style={{ background: 'var(--bg-surface3)' }}
      >
        🎲
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
        投注记录即将上线
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
        敬请期待
      </p>
    </div>
  );
}

/* ── Skeleton loader ────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="h-16 rounded-xl"
          style={{ background: 'var(--bg-surface2)' }}
        />
      ))}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export default function TransactionTabs() {
  const [tab, setTab] = useState<'transactions' | 'bets'>('transactions');
  const [rows, setRows] = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      fetch('/api/member/deposits').then(r => r.ok ? r.json() as Promise<DepositRow[]> : Promise.reject()),
      fetch('/api/member/withdrawals').then(r => r.ok ? r.json() as Promise<WithdrawRow[]> : Promise.reject()),
    ])
      .then(([deps, withs]) => {
        const merged: TxRecord[] = [
          ...deps.map(toTx),
          ...withs.map(toWithdraw),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRows(merged);
      })
      .catch(() => setError('加载失败，请刷新重试'))
      .finally(() => setLoading(false));
  }, []);

  const TABS = [
    { key: 'transactions' as const, label: '交易记录' },
    { key: 'bets' as const,         label: '投注记录' },
  ];

  const visible = rows.slice(0, shown);
  const hasMore = shown < rows.length;

  return (
    <div>
      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div
        className="flex gap-1 mb-3 p-1 rounded-xl"
        style={{ background: 'var(--bg-surface2)', width: 'fit-content' }}
      >
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
            style={
              tab === t.key
                ? {
                    background: 'var(--brand-primary)',
                    color: '#fff',
                    boxShadow: '0 0 10px color-mix(in srgb, var(--brand-primary) 40%, transparent)',
                  }
                : { color: 'var(--text-muted)', background: 'transparent' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Transactions tab ────────────────────────────────── */}
      {tab === 'transactions' && (
        <>
          {loading && <Skeleton />}
          {!loading && error && (
            <p className="text-sm text-center py-8" style={{ color: '#f87171' }}>
              {error}
            </p>
          )}
          {!loading && !error && rows.length === 0 && <EmptyState />}
          {!loading && !error && rows.length > 0 && (
            <>
              {/* Desktop: card wrapping table rows */}
              <div className="casino-card overflow-hidden hidden lg:block">
                <TableHeader />
                {visible.map(tx => (
                  <TransactionCard key={`${tx.type}-${tx.id}`} tx={tx} />
                ))}
              </div>

              {/* Mobile: stacked cards */}
              <div className="flex flex-col gap-2 lg:hidden">
                {visible.map(tx => (
                  <TransactionCard key={`${tx.type}-${tx.id}`} tx={tx} />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="text-center mt-3">
                  <button
                    onClick={() => setShown(n => n + PAGE_SIZE)}
                    className="casino-btn-outline px-5 text-sm"
                    style={{ minHeight: '36px' }}
                  >
                    加载更多（剩余 {rows.length - shown} 条）
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Bet records tab ─────────────────────────────────── */}
      {tab === 'bets' && <BetPlaceholder />}
    </div>
  );
}
