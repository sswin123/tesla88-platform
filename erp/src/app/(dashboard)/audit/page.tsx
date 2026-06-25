'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AuditLog } from '@/lib/types';

const ACTION_VARIANT: Record<string, 'default' | 'destructive' | 'secondary'> = {
  MEMBER_FREEZE:      'destructive',
  PROMO_DELETE:       'destructive',
  BANK_DELETE:        'destructive',
  DEPOSIT_REJECT:     'destructive',
  WITHDRAWAL_REJECT:  'destructive',
  DEPOSIT_APPROVE:    'default',
  WITHDRAWAL_APPROVE: 'default',
  MEMBER_UNFREEZE:    'default',
  PROMO_CREATE:       'default',
};

export default function AuditPage() {
  const [logs, setLogs]       = useState<AuditLog[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');

  async function load(p: number, tf: string) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p) });
    if (tf) params.set('target_type', tf);
    const r = await fetch(`/api/audit?${params}`);
    const d = await r.json();
    setLogs(d.data);
    setTotal(d.total);
    setLoading(false);
  }

  useEffect(() => { load(page, filter); }, [page, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(1); }}
          className="rounded-md border px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">All Types</option>
          <option value="deposit">Deposit</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="member">Member</option>
          <option value="bank">Bank</option>
          <option value="promotion">Promotion</option>
        </select>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {['Time', 'Admin', 'Action', 'Type', 'Target ID', 'Details'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{l.admin_username ?? `#${l.admin_id}`}</td>
                  <td className="px-3 py-2">
                    <Badge variant={ACTION_VARIANT[l.action] ?? 'secondary'} className="text-xs">
                      {l.action}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{l.target_type}</td>
                  <td className="px-3 py-2 text-gray-500">{l.target_id ?? '—'}</td>
                  <td className="px-3 py-2 max-w-xs truncate text-xs font-mono text-gray-500">
                    {l.new_value ? JSON.stringify(l.new_value) : '—'}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-400">No audit logs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Total: {total}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="flex items-center px-2">Page {page}</span>
          <Button size="sm" variant="outline" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
