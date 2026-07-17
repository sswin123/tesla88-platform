'use client';
import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ActivityRow {
  id: number;
  activity_id: string;
  category: string;
  action: string;
  title: string;
  description: string | null;
  amount: string | null;
  balance_before: string | null;
  balance_after: string | null;
  reference_type: string | null;
  reference_id: number | null;
  operator_type: string;
  operator_id: number | null;
  operator_name: string | null;
  source: string;
  level: string;
  ip_address: string | null;
  remark: string | null;
  created_at: string;
}

interface ActivitySummary {
  last_login_at: string | null;
  last_deposit: { amount: string; at: string } | null;
  last_withdrawal: { amount: string; at: string } | null;
  last_bonus: { amount: string; at: string } | null;
  last_wallet_adjustment: { type: string; direction: string; amount: string; at: string } | null;
  last_telegram_binding_at: string | null;
  total_activity_count: number;
}

interface ActivityResponse {
  data: ActivityRow[];
  total: number;
  page: number;
  limit: number;
  summary: ActivitySummary;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const FILTER_TABS = [
  { key: 'ALL',          label: 'All' },
  { key: 'ACCOUNT',      label: 'Account' },
  { key: 'DEPOSIT',      label: 'Deposit' },
  { key: 'WITHDRAWAL',   label: 'Withdrawal' },
  { key: 'WALLET',       label: 'Wallet' },
  { key: 'BALANCE',      label: 'Balance' },
  { key: 'PROMOTION',    label: 'Promotion' },
  { key: 'REFERRAL',     label: 'Referral' },
  { key: 'TELEGRAM',     label: 'Telegram' },
  { key: 'PROFILE',      label: 'Profile' },
  { key: 'GAME_ACCOUNT', label: 'Game' },
  { key: 'SYSTEM',       label: 'System' },
] as const;

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  ACCOUNT:      { bg: 'bg-slate-100',   text: 'text-slate-700',  dot: '#64748b' },
  PROFILE:      { bg: 'bg-gray-100',    text: 'text-gray-600',   dot: '#6b7280' },
  DEPOSIT:      { bg: 'bg-green-100',   text: 'text-green-700',  dot: '#16a34a' },
  WITHDRAWAL:   { bg: 'bg-red-100',     text: 'text-red-700',    dot: '#dc2626' },
  WALLET:       { bg: 'bg-blue-100',    text: 'text-blue-700',   dot: '#2563eb' },
  BALANCE:      { bg: 'bg-indigo-100',  text: 'text-indigo-700', dot: '#4f46e5' },
  PROMOTION:    { bg: 'bg-purple-100',  text: 'text-purple-700', dot: '#9333ea' },
  REFERRAL:     { bg: 'bg-orange-100',  text: 'text-orange-700', dot: '#ea580c' },
  TELEGRAM:     { bg: 'bg-sky-100',     text: 'text-sky-700',    dot: '#0284c7' },
  GAME_ACCOUNT: { bg: 'bg-emerald-100', text: 'text-emerald-700',dot: '#059669' },
  SYSTEM:       { bg: 'bg-zinc-100',    text: 'text-zinc-700',   dot: '#52525b' },
};

function getCategoryStyle(cat: string) {
  return CATEGORY_COLORS[cat] ?? { bg: 'bg-gray-100', text: 'text-gray-600', dot: '#6b7280' };
}

const LEVEL_COLORS: Record<string, string> = {
  INFO:     '',
  WARNING:  'border-l-amber-400 bg-amber-50/30',
  CRITICAL: 'border-l-red-500 bg-red-50/30',
};

function fmtAmount(a: string | null, dir?: string) {
  if (!a) return null;
  const n = parseFloat(a);
  if (isNaN(n)) return null;
  const sign = dir === 'D' ? '-' : dir === 'C' ? '+' : '';
  return `${sign}RM ${n.toFixed(2)}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-MY', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function refLabel(type: string | null, id: number | null): string | null {
  if (!type || !id) return null;
  const padded = String(id).padStart(7, '0');
  const prefixes: Record<string, string> = {
    deposit:    `DEP${padded}`,
    withdrawal: `WD${padded}`,
    wallet:     `WA${padded}`,
    promotion:  `PM${padded}`,
    referral:   `RF${padded}`,
  };
  return prefixes[type.toLowerCase()] ?? `${type.toUpperCase()}#${id}`;
}

// ─────────────────────────────────────────────────────────────
// Summary Card
// ─────────────────────────────────────────────────────────────

function SummaryCard({ summary }: { summary: ActivitySummary }) {
  const items = [
    { label: 'Last Login',      value: fmtDateTime(summary.last_login_at) },
    {
      label: 'Last Deposit',
      value: summary.last_deposit
        ? `RM ${parseFloat(summary.last_deposit.amount).toFixed(2)}`
        : '—',
      sub: summary.last_deposit ? fmtDateTime(summary.last_deposit.at) : undefined,
    },
    {
      label: 'Last Withdrawal',
      value: summary.last_withdrawal
        ? `RM ${parseFloat(summary.last_withdrawal.amount).toFixed(2)}`
        : '—',
      sub: summary.last_withdrawal ? fmtDateTime(summary.last_withdrawal.at) : undefined,
    },
    {
      label: 'Last Bonus',
      value: summary.last_bonus
        ? `RM ${parseFloat(summary.last_bonus.amount).toFixed(2)}`
        : '—',
      sub: summary.last_bonus ? fmtDateTime(summary.last_bonus.at) : undefined,
    },
    {
      label: 'Last Wallet Adj.',
      value: summary.last_wallet_adjustment
        ? `${summary.last_wallet_adjustment.direction === 'C' ? '+' : '-'}RM ${parseFloat(summary.last_wallet_adjustment.amount).toFixed(2)}`
        : '—',
      sub: summary.last_wallet_adjustment
        ? `${summary.last_wallet_adjustment.type}`
        : undefined,
    },
    { label: 'Last Telegram Binding', value: fmtDateTime(summary.last_telegram_binding_at) },
    {
      label: 'Total Activities',
      value: summary.total_activity_count.toLocaleString(),
      highlight: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-lg border px-3 py-2 ${item.highlight ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}
        >
          <p className="text-xs text-gray-500 font-medium truncate">{item.label}</p>
          <p className={`text-sm font-bold mt-0.5 ${item.highlight ? 'text-blue-700' : 'text-gray-800'}`}>
            {item.value}
          </p>
          {item.sub && <p className="text-xs text-gray-400 truncate">{item.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Timeline Row
// ─────────────────────────────────────────────────────────────

function ActivityRow({ row }: { row: ActivityRow }) {
  const style   = getCategoryStyle(row.category);
  const levelCls = LEVEL_COLORS[row.level] ?? '';
  const ref      = refLabel(row.reference_type, row.reference_id);

  return (
    <div className={`flex gap-3 py-2.5 px-1 border-l-2 border-l-transparent ${levelCls} group`}>
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-0.5 shrink-0">
        <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: style.dot }} />
        <div className="w-px flex-1 bg-gray-100 mt-1" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Top row: time + category badge + action + amount */}
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-mono tabular-nums shrink-0 mt-0.5">
            {fmtTime(row.created_at)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${style.bg} ${style.text}`}>
            {row.category.replace('_', ' ')}
          </span>
          <span className="text-sm font-medium text-gray-800 flex-1">{row.title}</span>
          {row.amount && (
            <span className={`text-sm font-bold tabular-nums shrink-0 ${
              parseFloat(row.amount) >= 0 ? 'text-green-600' : 'text-red-500'
            }`}>
              {fmtAmount(row.amount)}
            </span>
          )}
        </div>

        {/* Balance before/after */}
        {row.balance_before != null && row.balance_after != null && (
          <p className="text-xs text-gray-500 mt-0.5">
            Balance: RM {parseFloat(row.balance_before).toFixed(2)}
            {' → '}
            RM {parseFloat(row.balance_after).toFixed(2)}
          </p>
        )}

        {/* Description */}
        {row.description && (
          <p className="text-xs text-gray-500 mt-0.5">{row.description}</p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs text-gray-400 font-mono">{row.activity_id}</span>
          {row.operator_name && (
            <span className="text-xs text-gray-400">
              by{' '}
              <span className="font-medium text-gray-600">
                {row.operator_type === 'STAFF' ? '👤 ' : row.operator_type === 'MEMBER' ? '🙋 ' : '⚙️ '}
                {row.operator_name}
              </span>
            </span>
          )}
          {row.source !== 'SYSTEM' && (
            <span className="text-xs text-gray-400">via {row.source}</span>
          )}
          {ref && (
            <span className="text-xs font-mono text-blue-500">{ref}</span>
          )}
          {row.ip_address && (
            <span className="text-xs text-gray-300">{row.ip_address}</span>
          )}
          {row.remark && (
            <span className="text-xs text-amber-600 italic">"{row.remark}"</span>
          )}
          {row.level !== 'INFO' && (
            <span className={`text-xs font-bold ${row.level === 'CRITICAL' ? 'text-red-600' : 'text-amber-500'}`}>
              ⚠ {row.level}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export default function MemberActivityLog({ memberId }: { memberId: number }) {
  const [data,     setData]     = useState<ActivityResponse | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [page,     setPage]     = useState(1);
  const [category, setCategory] = useState('ALL');
  const [search,   setSearch]   = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page:     String(page),
        limit:    String(LIMIT),
        category,
        search,
        date_from: dateFrom,
        date_to:   dateTo,
      });
      const r = await fetch(`/api/members/${memberId}/activity-log?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json() as ActivityResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [memberId, page, category, search, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function handleCategoryChange(cat: string) {
    setCategory(cat);
    setPage(1);
  }

  // Group rows by date
  const grouped = (() => {
    if (!data?.data) return [];
    const map = new Map<string, ActivityRow[]>();
    for (const row of data.data) {
      const d = fmtDate(row.created_at);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(row);
    }
    return Array.from(map.entries());
  })();

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  return (
    <div>
      {/* Summary Card */}
      {data?.summary && <SummaryCard summary={data.summary} />}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-1 mb-3">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleCategoryChange(tab.key)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              category === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + Date Filter */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="搜索：活动ID / 关键词 / 金额 / 参考号…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="flex-1 min-w-48 rounded border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <span className="self-center text-gray-400 text-sm">—</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <button
          type="submit"
          className="rounded border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm hover:bg-gray-100"
        >
          搜索
        </button>
        {(search || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => { setSearch(''); setSearchInput(''); setDateFrom(''); setDateTo(''); setPage(1); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            清空
          </button>
        )}
      </form>

      {/* Stats */}
      {data && (
        <p className="text-xs text-gray-400 mb-3">
          共 {data.total.toLocaleString()} 条记录
          {data.total > 0 && ` · 第 ${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, data.total)} 条`}
        </p>
      )}

      {/* Loading / Error */}
      {loading && (
        <div className="py-12 text-center text-sm text-gray-400">加载中…</div>
      )}
      {!loading && error && (
        <div className="py-6 text-center text-sm text-red-500">
          加载失败: {error}
          <button onClick={() => void load()} className="ml-2 underline">重试</button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && grouped.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm text-gray-500">暂无活动记录</p>
          {(search || category !== 'ALL') && (
            <p className="text-xs text-gray-400 mt-1">尝试清除筛选条件</p>
          )}
        </div>
      )}

      {/* Timeline */}
      {!loading && !error && grouped.length > 0 && (
        <div className="space-y-1">
          {grouped.map(([date, rows]) => (
            <div key={date}>
              {/* Date header */}
              <div className="sticky top-0 bg-white/90 backdrop-blur-sm z-10 py-1.5 mb-1">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-gray-100" />
                  <span className="text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                    {date}
                  </span>
                  <div className="h-px flex-1 bg-gray-100" />
                </div>
              </div>
              {/* Events */}
              <div className="pl-1">
                {rows.map((row) => <ActivityRow key={row.id} row={row} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            ← 上一页
          </button>
          <span className="text-sm text-gray-500">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  );
}
