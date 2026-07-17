'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface WalletTx {
  id:               string;
  type:             string;
  direction:        string;
  amount:           string;
  balance_before:   string;
  balance_after:    string;
  gateway:          string | null;
  reference_number: string | null;
  remark:           string;
  ip_address:       string | null;
  created_at:       string;
  operator_name:    string | null;
  attachment_url:   string | null;
}

const TYPE_LABELS: Record<string, string> = {
  MANUAL_DEPOSIT:    'Manual Deposit',
  MANUAL_WITHDRAWAL: 'Manual Withdrawal',
  PAYMENT_GATEWAY:   'Payment Gateway',
  PROMOTION_BONUS:   'Promo Bonus',
  CASHBACK:          'Cashback',
  REBATE:            'Rebate',
  REFERRAL_BONUS:    'Referral Bonus',
  VIP_BONUS:         'VIP Bonus',
  LOSS_CREDIT:       'Loss Credit',
  COMPENSATION:      'Compensation',
  CORRECTION:        'Correction',
  OTHERS:            'Others',
};

function fmt(n: string) { return `RM ${parseFloat(n).toFixed(2)}`; }

interface Props {
  memberId: number;
  refreshKey?: number;
}

export default function WalletHistory({ memberId, refreshKey = 0 }: Props) {
  const [rows,    setRows]    = useState<WalletTx[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/members/${memberId}/wallet/history?page=${page}&limit=20`)
      .then(r => r.ok ? r.json() as Promise<{ data: WalletTx[]; total: number }> : Promise.reject())
      .then(d => { setRows(d.data); setTotal(d.total); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [memberId, page, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="border-b bg-gray-50 text-gray-500 text-xs">
            <tr>
              {['Date', 'Type', 'Dir', 'Amount', 'Before', 'After', 'Operator', 'Ref / Gateway', 'Remark', 'Attach'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No wallet transactions.</td></tr>
            ) : rows.map(tx => (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                  {new Date(tx.created_at).toLocaleString('en-MY', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="text-xs font-medium">{TYPE_LABELS[tx.type] ?? tx.type}</span>
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant={tx.direction === 'C' ? 'default' : 'destructive'}
                    className="text-xs px-1.5"
                  >
                    {tx.direction === 'C' ? '+C' : '−D'}
                  </Badge>
                </td>
                <td className={`px-3 py-2 font-mono text-xs font-bold whitespace-nowrap ${
                  tx.direction === 'C' ? 'text-green-700' : 'text-red-600'
                }`}>
                  {tx.direction === 'C' ? '+' : '−'}{fmt(tx.amount)}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{fmt(tx.balance_before)}</td>
                <td className="px-3 py-2 font-mono text-xs font-semibold whitespace-nowrap">{fmt(tx.balance_after)}</td>
                <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{tx.operator_name ?? '—'}</td>
                <td className="px-3 py-2 text-xs">
                  {tx.gateway && <div className="text-gray-500">{tx.gateway}</div>}
                  {tx.reference_number && (
                    <div className="font-mono text-gray-700">{tx.reference_number}</div>
                  )}
                  {!tx.gateway && !tx.reference_number && <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600 max-w-[180px]">
                  <span className="line-clamp-2" title={tx.remark}>{tx.remark}</span>
                </td>
                <td className="px-3 py-2">
                  {tx.attachment_url ? (
                    <a
                      href={tx.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Total: {total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <span className="px-2 py-1 text-gray-500">Page {page}</span>
            <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
