'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MemberDetail } from '@/lib/types';

interface GameAccount { provider: string; username: string; created_at: string }
interface DepositRow  { id: number; provider: string; deposit_amount: string; bonus_amount: string; status: string; created_at: string; promo_name?: string }
interface WithdrawRow { id: number; provider: string; game_username: string; withdraw_amount: string; status: string; created_at: string }
interface BonusRow    { id: number; promo_name: string; deposit_amount: string; bonus_amount: string; turnover_required: string; turnover_completed: string; status: string; claimed_at: string }

interface MemberPayload {
  member: MemberDetail;
  accounts: GameAccount[];
  deposits: DepositRow[];
  withdrawals: WithdrawRow[];
  bonuses: BonusRow[];
}

function fmt(n: string) { return `RM ${parseFloat(n).toFixed(2)}`; }
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function MemberDetailPage() {
  const params   = useParams<{ id: string }>();
  const router   = useRouter();
  const [data, setData]         = useState<MemberPayload | null>(null);
  const [loading, setLoading]   = useState(true);
  const [toggling, setToggling] = useState(false);
  const [remarks, setRemarks]   = useState('');
  const [savingRemarks, setSavingRemarks] = useState(false);

  async function load() {
    const r = await fetch(`/api/members/${params.id}`);
    if (r.ok) {
      const d = await r.json();
      setData(d);
      setRemarks(d.member.remarks ?? '');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [params.id]);

  async function toggleStatus() {
    if (!data) return;
    setToggling(true);
    const newStatus = data.member.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
    const r = await fetch(`/api/members/${data.member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (r.ok) setData((prev) => prev ? { ...prev, member: { ...prev.member, status: newStatus } } : null);
    setToggling(false);
  }

  async function saveRemarks() {
    if (!data) return;
    setSavingRemarks(true);
    await fetch(`/api/members/${data.member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remarks }),
    });
    setSavingRemarks(false);
  }

  if (loading) return <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>;
  if (!data)   return <div className="flex h-40 items-center justify-center text-gray-400">Member not found.</div>;

  const { member, accounts, deposits, withdrawals, bonuses } = data;

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
              <Badge variant={member.status === 'ACTIVE' ? 'default' : 'destructive'}>{member.status}</Badge>
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
            <Row label="Deposit Count"           value={member.deposit_count} />
            <Row label="Withdrawal Count"        value={member.withdrawal_count} />
          </CardContent>
        </Card>

        {accounts.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Game Accounts</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                {accounts.map((a) => (
                  <div key={a.provider} className="flex justify-between">
                    <span className="text-gray-500">{a.provider}</span>
                    <span className="font-mono">{a.username}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className={accounts.length > 0 ? '' : 'lg:col-span-2'}>
          <CardHeader><CardTitle className="text-base">Manual Remarks</CardTitle></CardHeader>
          <CardContent>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              rows={3}
              placeholder="Add admin remarks…"
            />
            <Button className="mt-2" size="sm" onClick={saveRemarks} disabled={savingRemarks}>
              {savingRemarks ? 'Saving…' : 'Save Remarks'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Deposit History (last 20)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-gray-500">
              <tr><th className="py-1 text-left">ID</th><th>Platform</th><th>Amount</th><th>Bonus</th><th>Promo</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody className="divide-y">
              {deposits.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="py-1">#{d.id}</td>
                  <td>{d.provider}</td>
                  <td>{fmt(d.deposit_amount)}</td>
                  <td>{parseFloat(d.bonus_amount) > 0 ? fmt(d.bonus_amount) : '—'}</td>
                  <td>{d.promo_name ?? '—'}</td>
                  <td><Badge variant={d.status === 'APPROVED' ? 'default' : d.status === 'PENDING' ? 'secondary' : 'destructive'} className="text-xs">{d.status}</Badge></td>
                  <td className="text-gray-400">{new Date(d.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {deposits.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-gray-400">No deposits.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Withdrawal History (last 20)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-gray-500">
              <tr><th className="py-1 text-left">ID</th><th>Platform</th><th>Amount</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody className="divide-y">
              {withdrawals.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="py-1">#{w.id}</td>
                  <td>{w.provider}</td>
                  <td>{fmt(w.withdraw_amount)}</td>
                  <td><Badge variant={w.status === 'PAID' ? 'default' : w.status === 'PENDING' ? 'secondary' : 'destructive'} className="text-xs">{w.status}</Badge></td>
                  <td className="text-gray-400">{new Date(w.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {withdrawals.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-gray-400">No withdrawals.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Bonus History (last 20)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-gray-500">
              <tr><th className="py-1 text-left">Promotion</th><th>Deposit</th><th>Bonus</th><th>Turnover</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody className="divide-y">
              {bonuses.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="py-1">{b.promo_name}</td>
                  <td>{fmt(b.deposit_amount)}</td>
                  <td>{fmt(b.bonus_amount)}</td>
                  <td>{fmt(b.turnover_completed)}/{fmt(b.turnover_required)}</td>
                  <td><Badge className="text-xs" variant={b.status === 'COMPLETED' ? 'default' : 'secondary'}>{b.status}</Badge></td>
                  <td className="text-gray-400">{new Date(b.claimed_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {bonuses.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-gray-400">No bonus claims.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
