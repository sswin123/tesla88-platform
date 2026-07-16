'use client';

import { useEffect, useState } from 'react';
import { Save, Info, DollarSign, ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';

// ── Currency catalog ──────────────────────────────────────────────────────────

interface CurrencyDef {
  code:    string;
  symbol:  string;
  label:   string;
  decimals: number;
}

const CURRENCIES: CurrencyDef[] = [
  { code: 'MYR', symbol: 'RM',   label: 'RM — Malaysian Ringgit',    decimals: 2 },
  { code: 'SGD', symbol: 'S$',   label: 'S$ — Singapore Dollar',     decimals: 2 },
  { code: 'AUD', symbol: 'A$',   label: 'A$ — Australian Dollar',    decimals: 2 },
  { code: 'USD', symbol: '$',    label: '$ — US Dollar',             decimals: 2 },
  { code: 'EUR', symbol: '€',    label: '€ — Euro',                  decimals: 2 },
  { code: 'GBP', symbol: '£',    label: '£ — British Pound',         decimals: 2 },
  { code: 'HKD', symbol: 'HK$', label: 'HK$ — Hong Kong Dollar',    decimals: 2 },
  { code: 'THB', symbol: '฿',    label: '฿ — Thai Baht',             decimals: 2 },
  { code: 'PHP', symbol: '₱',    label: '₱ — Philippine Peso',       decimals: 2 },
  { code: 'IDR', symbol: 'Rp',  label: 'Rp — Indonesian Rupiah',    decimals: 0 },
  { code: 'VND', symbol: '₫',    label: '₫ — Vietnamese Dong',       decimals: 0 },
  { code: 'KHR', symbol: '៛',   label: '៛ — Cambodian Riel',        decimals: 0 },
  { code: 'MMK', symbol: 'K',   label: 'K — Myanmar Kyat',          decimals: 0 },
  { code: 'JPY', symbol: '¥',    label: '¥ — Japanese Yen',          decimals: 0 },
  { code: 'CNY', symbol: 'CN¥', label: 'CN¥ — Chinese Yuan',        decimals: 2 },
];

const CURRENCY_MAP = new Map(CURRENCIES.map(c => [c.code, c]));

// ── Form state ────────────────────────────────────────────────────────────────

interface WebsiteConfig {
  currency_code:              string;
  currency_symbol:            string;
  website_currency:           string;
  website_decimal_places:     string;
  thousands_separator:        string;
  decimal_separator:          string;
  deposit_min_amount:         string;
  withdraw_min_amount:        string;
  deposit_max_amount:         string;
  withdraw_max_amount:        string;
  wallet_max_balance_deposit: string;
  max_withdrawals_per_day:    string;
}

const DEFAULTS: WebsiteConfig = {
  currency_code:              'MYR',
  currency_symbol:            'RM',
  website_currency:           'RM',
  website_decimal_places:     '2',
  thousands_separator:        ',',
  decimal_separator:          '.',
  deposit_min_amount:         '30',
  withdraw_min_amount:        '50',
  deposit_max_amount:         '50000',
  withdraw_max_amount:        '50000',
  wallet_max_balance_deposit: '0',
  max_withdrawals_per_day:    '0',
};

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'currency' | 'deposit' | 'withdraw' | 'wallet';

const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
  { key: 'currency', label: '货币设置', Icon: DollarSign     },
  { key: 'deposit',  label: '存款限额', Icon: ArrowDownCircle },
  { key: 'withdraw', label: '提款限额', Icon: ArrowUpCircle  },
  { key: 'wallet',   label: '钱包上限', Icon: Wallet         },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function preview(sym: string, thousands: string, decimal: string, decs: number): string {
  const n = 1234567.89;
  const [whole, frac] = n.toFixed(2).split('.');
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  const decPart = decs > 0 ? `${decimal}${frac.slice(0, decs)}` : '';
  return `${sym}${formatted}${decPart}`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WebsiteConfigPage() {
  const [form, setForm]     = useState<WebsiteConfig>(DEFAULTS);
  const [tab,  setTab]      = useState<Tab>('currency');
  const [saving, setSaving] = useState(false);
  const [msg,   setMsg]     = useState('');
  const [error, setError]   = useState('');

  useEffect(() => {
    fetch('/api/website/config')
      .then(r => r.ok ? r.json() as Promise<Partial<WebsiteConfig>> : {})
      .then(data => setForm(prev => ({ ...prev, ...data })))
      .catch(() => {});
  }, []);

  function set(key: keyof WebsiteConfig, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function selectCurrency(code: string) {
    const def = CURRENCY_MAP.get(code);
    if (!def) return;
    setForm(prev => ({
      ...prev,
      currency_code:          def.code,
      currency_symbol:        def.symbol,
      website_currency:       def.symbol,       // keep legacy in sync
      website_decimal_places: String(def.decimals),
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    // Ensure website_currency stays in sync with currency_symbol
    const payload: WebsiteConfig = {
      ...form,
      website_currency: form.currency_symbol,
    };
    const res = await fetch('/api/website/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      setMsg('设置已保存，全站立即生效');
      setTimeout(() => setMsg(''), 3000);
    } else {
      setError('保存失败，请重试');
    }
  }

  const sym      = form.currency_symbol || form.website_currency || 'RM';
  const decs     = parseInt(form.website_decimal_places ?? '2', 10);
  const thouSep  = form.thousands_separator || ',';
  const decSep   = form.decimal_separator   || '.';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">网站参数配置</h1>
        <p className="text-sm text-gray-500 mt-0.5">Website Config · 全局货币、存提款限额 — 所有设置立即生效</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
              tab === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="space-y-4">

        {/* ── Currency Tab ─────────────────────────────────────────────────── */}
        {tab === 'currency' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-5">
            <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">货币设置</h2>

            {/* Currency dropdown */}
            <label className="block">
              <span className="text-xs text-gray-500 font-medium block mb-1">货币</span>
              <select
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
                value={form.currency_code}
                onChange={e => selectCurrency(e.target.value)}
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </label>

            {/* Symbol + decimal in a row */}
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-gray-500 font-medium block mb-1">货币符号（自动）</span>
                <div className="flex items-center border rounded-xl overflow-hidden bg-gray-50">
                  <span className="px-3 py-2.5 text-lg font-bold text-gray-800 min-w-[52px] text-center">
                    {sym}
                  </span>
                  <span className="px-3 py-2.5 text-xs text-gray-400 border-l">
                    {form.currency_code}
                  </span>
                </div>
              </label>

              <label className="block">
                <span className="text-xs text-gray-500 font-medium block mb-1">小数位数</span>
                <select
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
                  value={form.website_decimal_places}
                  onChange={e => set('website_decimal_places', e.target.value)}
                >
                  <option value="0">0 位（整数）</option>
                  <option value="2">2 位（推荐）</option>
                  <option value="3">3 位</option>
                  <option value="4">4 位</option>
                </select>
              </label>
            </div>

            {/* Separators */}
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-gray-500 font-medium block mb-1">千位分隔符</span>
                <select
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
                  value={form.thousands_separator}
                  onChange={e => set('thousands_separator', e.target.value)}
                >
                  <option value=",">, 逗号（1,000,000）</option>
                  <option value=".">. 句号（1.000.000）</option>
                  <option value=" ">  空格（1 000 000）</option>
                  <option value="">无</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-gray-500 font-medium block mb-1">小数分隔符</span>
                <select
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
                  value={form.decimal_separator}
                  onChange={e => set('decimal_separator', e.target.value)}
                >
                  <option value=".">. 句号（500.00）</option>
                  <option value=",">, 逗号（500,00）</option>
                </select>
              </label>
            </div>

            {/* Preview */}
            <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-4">
              <p className="text-xs text-gray-500 mb-1">显示效果预览</p>
              <p className="text-xl font-bold text-gray-900">
                {preview(sym, thouSep, decSep, decs)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                存款 · 提款 · 余额 · 奖池 · 实时交易 · Jackpot 全部同步此格式
              </p>
            </div>
          </div>
        )}

        {/* ── Deposit Tab ──────────────────────────────────────────────────── */}
        {tab === 'deposit' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">存款限额</h2>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-gray-500 font-medium block mb-1">最低存款金额</span>
                <div className="flex items-center border rounded-xl overflow-hidden">
                  <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r font-medium">{sym}</span>
                  <input
                    type="text" inputMode="numeric"
                    className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                    value={form.deposit_min_amount}
                    onChange={e => set('deposit_min_amount', e.target.value)}
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 font-medium block mb-1">最高存款金额</span>
                <div className="flex items-center border rounded-xl overflow-hidden">
                  <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r font-medium">{sym}</span>
                  <input
                    type="text" inputMode="numeric"
                    className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                    value={form.deposit_max_amount}
                    onChange={e => set('deposit_max_amount', e.target.value)}
                  />
                </div>
              </label>
            </div>
            <p className="text-xs text-gray-400">0 = 不限制</p>
          </div>
        )}

        {/* ── Withdraw Tab ─────────────────────────────────────────────────── */}
        {tab === 'withdraw' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">提款限额</h2>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-gray-500 font-medium block mb-1">最低提款金额</span>
                <div className="flex items-center border rounded-xl overflow-hidden">
                  <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r font-medium">{sym}</span>
                  <input
                    type="text" inputMode="numeric"
                    className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                    value={form.withdraw_min_amount}
                    onChange={e => set('withdraw_min_amount', e.target.value)}
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 font-medium block mb-1">最高提款金额</span>
                <div className="flex items-center border rounded-xl overflow-hidden">
                  <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r font-medium">{sym}</span>
                  <input
                    type="text" inputMode="numeric"
                    className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                    value={form.withdraw_max_amount}
                    onChange={e => set('withdraw_max_amount', e.target.value)}
                  />
                </div>
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-gray-500 font-medium block mb-1">每日最大提款次数</span>
              <div className="flex gap-2 flex-wrap mb-2">
                {['0','1','2','3','5','10'].map(v => (
                  <button
                    key={v} type="button"
                    onClick={() => set('max_withdrawals_per_day', v)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      form.max_withdrawals_per_day === v
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {v === '0' ? '不限制' : `${v} 次`}
                  </button>
                ))}
              </div>
              <div className="flex items-center border rounded-xl overflow-hidden">
                <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r whitespace-nowrap">自定义</span>
                <input
                  type="text" inputMode="numeric" placeholder="0 = 不限制"
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                  value={form.max_withdrawals_per_day}
                  onChange={e => set('max_withdrawals_per_day', e.target.value)}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">0 = 不限制；每日 00:00 UTC 自动重置</p>
            </label>
          </div>
        )}

        {/* ── Wallet Tab ───────────────────────────────────────────────────── */}
        {tab === 'wallet' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">钱包余额上限</h2>

            <div className="flex gap-3 p-3 rounded-xl text-xs bg-blue-50 text-blue-700 border border-blue-100">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>当会员钱包余额达到或超过此金额时，自动禁止存款。设置为 0 表示不限制。</span>
            </div>

            <label className="block">
              <span className="text-xs text-gray-500 font-medium block mb-1">最高余额限制（0 = 不限制）</span>
              <div className="flex items-center border rounded-xl overflow-hidden">
                <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r font-medium">{sym}</span>
                <input
                  type="text" inputMode="numeric"
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                  value={form.wallet_max_balance_deposit}
                  onChange={e => set('wallet_max_balance_deposit', e.target.value)}
                />
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {['0', '1000', '3000', '5000', '10000'].map(v => (
                  <button
                    key={v} type="button"
                    onClick={() => set('wallet_max_balance_deposit', v)}
                    className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                      form.wallet_max_balance_deposit === v
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {v === '0' ? '不限制' : `${sym}${v}`}
                  </button>
                ))}
              </div>
            </label>
          </div>
        )}

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中…' : '保存设置'}
          </button>
          {msg   && <span className="text-sm text-green-600 font-medium">{msg}</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </form>
    </div>
  );
}
