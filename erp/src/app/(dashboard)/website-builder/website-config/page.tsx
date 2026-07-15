'use client';

import { useEffect, useState } from 'react';
import { Save, Info } from 'lucide-react';

interface WebsiteConfig {
  deposit_min_amount:        string;
  withdraw_min_amount:       string;
  deposit_max_amount:        string;
  withdraw_max_amount:       string;
  wallet_max_balance_deposit: string;
  website_currency:          string;
  website_decimal_places:    string;
  max_withdrawals_per_day:   string;
}

const DEFAULTS: WebsiteConfig = {
  deposit_min_amount:        '30',
  withdraw_min_amount:       '50',
  deposit_max_amount:        '50000',
  withdraw_max_amount:       '50000',
  wallet_max_balance_deposit: '0',
  website_currency:          'RM',
  website_decimal_places:    '2',
  max_withdrawals_per_day:   '0',
};

export default function WebsiteConfigPage() {
  const [form, setForm]     = useState<WebsiteConfig>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');
  const [error, setError]   = useState('');

  useEffect(() => {
    fetch('/api/website/config')
      .then(r => r.ok ? r.json() as Promise<Partial<WebsiteConfig>> : {})
      .then(data => setForm(prev => ({ ...prev, ...data })))
      .catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    const res = await fetch('/api/website/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setMsg('设置已保存');
      setTimeout(() => setMsg(''), 3000);
    } else {
      setError('保存失败，请重试');
    }
  }

  function set(key: keyof WebsiteConfig, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">网站参数配置</h1>
        <p className="text-sm text-gray-500 mt-0.5">存取款限额、钱包设置 — 所有设置立即生效</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* Currency */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">货币设置</h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-500 font-medium block mb-1">货币符号</span>
              <input
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
                value={form.website_currency}
                onChange={e => set('website_currency', e.target.value)}
                placeholder="RM"
              />
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
              </select>
            </label>
          </div>
        </div>

        {/* Deposit limits */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">存款限额</h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-500 font-medium block mb-1">最低存款金额</span>
              <div className="flex items-center border rounded-xl overflow-hidden">
                <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r">{form.website_currency}</span>
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
                <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r">{form.website_currency}</span>
                <input
                  type="text" inputMode="numeric"
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                  value={form.deposit_max_amount}
                  onChange={e => set('deposit_max_amount', e.target.value)}
                />
              </div>
            </label>
          </div>
        </div>

        {/* Withdrawal limits */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">提款限额</h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-500 font-medium block mb-1">最低提款金额</span>
              <div className="flex items-center border rounded-xl overflow-hidden">
                <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r">{form.website_currency}</span>
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
                <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r">{form.website_currency}</span>
                <input
                  type="text" inputMode="numeric"
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                  value={form.withdraw_max_amount}
                  onChange={e => set('withdraw_max_amount', e.target.value)}
                />
              </div>
            </label>
          </div>

          {/* Daily withdrawal count limit */}
          <label className="block">
            <span className="text-xs text-gray-500 font-medium block mb-1">每日最大提款次数</span>
            <div className="flex gap-2 flex-wrap mb-2">
              {['0','1','2','3','5','10'].map(v => (
                <button
                  key={v}
                  type="button"
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

        {/* Wallet balance limit */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">存款上限（钱包余额）</h2>

          <div className="flex gap-3 p-3 rounded-xl text-xs bg-blue-50 text-blue-700 border border-blue-100">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>当会员钱包余额达到或超过此金额时，自动禁止存款。设置为 0 表示不限制。</span>
          </div>

          <label className="block">
            <span className="text-xs text-gray-500 font-medium block mb-1">最高余额限制（0 = 不限制）</span>
            <div className="flex items-center border rounded-xl overflow-hidden">
              <span className="px-3 py-2.5 text-xs text-gray-500 bg-gray-50 border-r">{form.website_currency}</span>
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
                  key={v}
                  type="button"
                  onClick={() => set('wallet_max_balance_deposit', v)}
                  className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                    form.wallet_max_balance_deposit === v
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {v === '0' ? '不限制' : `${form.website_currency}${v}`}
                </button>
              ))}
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
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
