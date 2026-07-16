'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Member, PaginatedResponse } from '@/lib/types';

const EMPTY_FORM = { first_name: '', phone: '', password: '', confirm: '', telegram_username: '', referral_code: '', vip_level: '0', status: 'ACTIVE' };

function AddMemberModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k: string, v: string) { setForm(prev => ({ ...prev, [k]: v })); setError(''); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) { setError('两次密码不一致'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name:        form.first_name,
          phone:             form.phone,
          password:          form.password,
          telegram_username: form.telegram_username || undefined,
          referral_code:     form.referral_code || undefined,
          vip_level:         Number(form.vip_level),
          status:            form.status,
        }),
      });
      const d = await r.json() as { ok?: boolean; error?: string; public_id?: string };
      if (!r.ok) { setError(d.error ?? '创建失败'); return; }
      onCreated();
    } catch {
      setError('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, key: string, type = 'text', required = false, placeholder = '') => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
      <input
        type={type}
        value={(form as Record<string, string>)[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">新增会员</h2>
        <form onSubmit={submit} className="space-y-3">
          {field('姓名', 'first_name', 'text', true, '会员姓名')}
          {field('手机号', 'phone', 'tel', true, '01xxxxxxxxx')}
          {field('密码', 'password', 'password', true, '至少6个字符')}
          {field('确认密码', 'confirm', 'password', true, '再次输入密码')}
          {field('Telegram 用户名（选填）', 'telegram_username', 'text', false, '@username')}
          {field('推荐码（选填）', 'referral_code', 'text', false, 'SS1000001')}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">VIP 等级</label>
              <select value={form.vip_level} onChange={e => set('vip_level', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {[0,1,2,3,4,5].map(v => <option key={v} value={v}>VIP {v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">状态</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="ACTIVE">ACTIVE</option>
                <option value="FROZEN">FROZEN</option>
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={saving}>取消</Button>
            <Button type="submit" className="flex-1" disabled={saving}>{saving ? '创建中…' : '确认创建'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MembersPage() {
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [data, setData]       = useState<PaginatedResponse<Member> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const router = useRouter();

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString() });
    if (search) params.set('search', search);
    fetch(`/api/members?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  const rows  = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      {showAdd && (
        <AddMemberModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); }}
        />
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Member Management</h1>
        <Button onClick={() => setShowAdd(true)}>+ 新增会员</Button>
      </div>

      <Input
        placeholder="Search by Member ID, phone, or name…"
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              {['Member ID', 'Name', 'Phone', 'Telegram', 'Status', 'Created At', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No members found</td>
              </tr>
            ) : rows.map((m) => (
              <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{m.public_id ?? `#${m.id}`}</td>
                <td className="px-4 py-3">{m.first_name}</td>
                <td className="px-4 py-3">{m.phone}</td>
                <td className="px-4 py-3 text-gray-400">
                  {m.telegram_username ? `@${m.telegram_username}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={m.status === 'ACTIVE' ? 'default' : 'destructive'}>
                    {m.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(m.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/members/${m.id}`)}
                  >
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Total: {total}</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="px-2 py-1 text-gray-500">Page {page}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={page * 20 >= total}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
