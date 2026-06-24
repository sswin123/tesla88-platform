'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Member, PaginatedResponse } from '@/lib/types';

export default function MembersPage() {
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [data, setData]       = useState<PaginatedResponse<Member> | null>(null);
  const [loading, setLoading] = useState(true);
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
      <h1 className="text-2xl font-bold">Member Management</h1>

      <Input
        placeholder="Search by UID, phone, or name…"
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              {['UID', 'Name', 'Phone', 'Telegram', 'Status', 'Created At', 'Actions'].map((h) => (
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
                <td className="px-4 py-3 font-mono text-xs">{m.id}</td>
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
