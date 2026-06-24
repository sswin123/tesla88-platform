'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MemberDetail } from '@/lib/types';

function fmt(n: string) {
  return `RM ${parseFloat(n).toFixed(2)}`;
}

export default function MemberDetailPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const [member, setMember]     = useState<MemberDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetch(`/api/members/${params.id}`)
      .then((r) => r.json())
      .then(setMember)
      .finally(() => setLoading(false));
  }, [params.id]);

  async function toggleStatus() {
    if (!member) return;
    setToggling(true);
    const newStatus = member.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
    const res = await fetch(`/api/members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) setMember((prev) => (prev ? { ...prev, status: newStatus } : null));
    setToggling(false);
  }

  if (loading) {
    return <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>;
  }
  if (!member) {
    return <div className="flex h-40 items-center justify-center text-gray-400">Member not found.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Member #{member.id}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>← Back</Button>
          <Button
            variant={member.status === 'ACTIVE' ? 'destructive' : 'default'}
            onClick={toggleStatus}
            disabled={toggling}
          >
            {toggling ? 'Processing…' : member.status === 'ACTIVE' ? 'Freeze' : 'Unfreeze'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Personal Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name"        value={member.first_name} />
            <Row label="Phone"       value={member.phone} />
            <Row label="Telegram ID" value={member.telegram_id} />
            <Row label="Username"    value={member.telegram_username ? `@${member.telegram_username}` : '—'} />
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <Badge variant={member.status === 'ACTIVE' ? 'default' : 'destructive'}>
                {member.status}
              </Badge>
            </div>
            <Row label="Joined" value={new Date(member.created_at).toLocaleString()} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Bank Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Bank"        value={member.bank_name} />
            <Row label="Account"     value={member.bank_account} />
            <Row label="Holder Name" value={member.bank_holder_name} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Financial Summary</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Row label="Total Deposits"          value={fmt(member.total_deposit)} />
            <Row label="Total Withdrawals"       value={fmt(member.total_withdraw)} />
            <Row label="Net Deposit"             value={fmt(member.net_deposit)} />
            <Row label="Total Bonus"             value={fmt(member.total_bonus)} />
            <Row label="Deposit Transactions"    value={member.deposit_count} />
            <Row label="Withdrawal Transactions" value={member.withdrawal_count} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
