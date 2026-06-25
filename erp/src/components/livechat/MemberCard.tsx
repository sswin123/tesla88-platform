'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MemberCardData, SupportSession } from '@/lib/types';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b py-1.5 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="max-w-[60%] truncate text-right text-xs font-medium">{value}</span>
    </div>
  );
}

function fmt(n: string) {
  return `RM ${parseFloat(n || '0').toFixed(2)}`;
}

export function MemberCard({
  member,
  session,
  onStatusChange,
}: {
  member: MemberCardData;
  session: SupportSession;
  onStatusChange?: (newStatus: 'ACTIVE' | 'FROZEN') => void;
}) {
  const [toggling, setToggling] = useState(false);

  async function toggleFreeze() {
    setToggling(true);
    const newStatus = member.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
    const r = await fetch(`/api/members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (r.ok) {
      onStatusChange?.(newStatus);
    } else {
      const d = await r.json().catch(() => ({}));
      alert((d as { error?: string }).error ?? 'Failed');
    }
    setToggling(false);
  }

  // Suppress unused warning — session may be used for future expansion
  void session;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Avatar + name */}
      <div className="flex flex-col items-center gap-2 border-b p-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500 text-2xl font-bold text-white">
          {member.first_name.slice(0, 2).toUpperCase()}
        </div>
        <p className="font-semibold">{member.first_name}</p>
        {member.telegram_username && (
          <p className="text-xs text-gray-400">@{member.telegram_username}</p>
        )}
        <Badge
          variant={member.status === 'ACTIVE' ? 'default' : 'destructive'}
          className="text-xs"
        >
          {member.status}
        </Badge>
      </div>

      {/* Telegram info */}
      <div className="border-b p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Telegram
        </p>
        <Row label="UID" value={member.id} />
        <Row label="Telegram ID" value={member.telegram_id} />
        <Row label="Phone" value={member.phone} />
        <Row label="Joined" value={new Date(member.created_at).toLocaleDateString()} />
      </div>

      {/* Financials */}
      <div className="border-b p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Financials
        </p>
        <Row label="Total Deposit" value={fmt(member.total_deposit)} />
        <Row label="Total Withdrawal" value={fmt(member.total_withdraw)} />
        <Row label="Total Bonus" value={fmt(member.total_bonus)} />
      </div>

      {/* Bank */}
      {member.bank_name && (
        <div className="border-b p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Bank
          </p>
          <Row label="Bank" value={member.bank_name} />
          <Row label="Account" value={member.bank_account} />
          <Row label="Holder" value={member.bank_holder_name} />
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 p-3">
        <Button
          variant={member.status === 'ACTIVE' ? 'destructive' : 'default'}
          size="sm"
          className="w-full"
          onClick={toggleFreeze}
          disabled={toggling}
        >
          {toggling
            ? 'Processing…'
            : member.status === 'ACTIVE'
              ? '🔒 Freeze Member'
              : '🔓 Unfreeze Member'}
        </Button>
        <a
          href={`/members/${member.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-md border border-gray-200 px-3 py-1.5 text-center text-sm text-gray-600 hover:bg-gray-50"
        >
          Open Full Profile &#8599;
        </a>
      </div>
    </div>
  );
}
