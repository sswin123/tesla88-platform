'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MALAYSIA_BANKS, validateBankAccount, stripNonDigits } from '@/lib/bank';
import WalletAdjustmentDialog from '@/components/WalletAdjustmentDialog';
import WalletHistory from '@/components/WalletHistory';
import type { MemberDetail, WalletSummary } from '@/lib/types';

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

// Simple modal wrapper
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export default function MemberDetailPage() {
  const params   = useParams<{ id: string }>();
  const router   = useRouter();
  const [data, setData]               = useState<MemberPayload | null>(null);
  const [loadError, setLoadError]     = useState('');
  const [loading, setLoading]         = useState(true);
  const [toggling, setToggling]       = useState(false);
  const [remarks, setRemarks]         = useState('');
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [resetting, setResetting]     = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  // Bank edit modal state
  const [showBankEdit, setShowBankEdit]   = useState(false);
  const [bankForm, setBankForm]           = useState({ bank_name: '', bank_account: '', bank_holder_name: '', reason: '' });
  const [savingBank, setSavingBank]       = useState(false);
  const [deletingBank, setDeletingBank]   = useState(false);

  // Game account edit modal state
  const [editingGame, setEditingGame]     = useState<GameAccount | null>(null);
  const [gameUsername, setGameUsername]   = useState('');
  const [savingGame, setSavingGame]       = useState(false);
  const [removingGame, setRemovingGame]   = useState<string | null>(null);

  // Wallet Center state
  const [walletSummary,     setWalletSummary]     = useState<WalletSummary | null>(null);
  const [walletLoading,     setWalletLoading]     = useState(true);
  const [showWalletAdjust,  setShowWalletAdjust]  = useState(false);
  const [walletRefreshKey,  setWalletRefreshKey]  = useState(0);

  const loadWallet = useCallback(async (uid: number) => {
    setWalletLoading(true);
    try {
      const r = await fetch(`/api/members/${uid}/wallet`);
      if (r.ok) setWalletSummary(await r.json() as WalletSummary);
    } catch { /* silent */ } finally {
      setWalletLoading(false);
    }
  }, []);

  async function load() {
    const r = await fetch(`/api/members/${params.id}`);
    if (r.ok) {
      const d = await r.json() as MemberPayload;
      setData(d);
      setRemarks(((d.member as unknown) as Record<string, unknown>).remarks as string ?? '');
      void loadWallet(d.member.id);
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string };
      console.error('[member detail]', r.status, d.error);
      if (r.status === 401) setLoadError('权限不足，请重新登录');
      else if (r.status === 404) setLoadError('找不到该会员');
      else setLoadError(d.error ?? `加载失败 (${r.status})`);
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
    if (r.ok) {
      setData((prev) => prev ? { ...prev, member: { ...prev.member, status: newStatus } } : null);
    } else {
      const d = await r.json().catch(() => ({}));
      alert(d.error ?? 'Failed to update status');
    }
    setToggling(false);
  }

  async function resetWebsitePassword() {
    if (!data) return;
    if (!confirm('确定要重置该会员的网站登录密码吗？')) return;
    setResetting(true);
    setNewPassword(null);
    const r = await fetch(`/api/members/${data.member.id}/reset-website-password`, { method: 'POST' });
    if (r.ok) {
      const d = await r.json();
      setNewPassword(d.new_password as string);
    } else {
      alert('重置密码失败');
    }
    setResetting(false);
  }

  async function saveRemarks() {
    if (!data) return;
    setSavingRemarks(true);
    const r = await fetch(`/api/members/${data.member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remarks }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error ?? 'Failed to save remarks');
    }
    setSavingRemarks(false);
  }

  function openBankEdit() {
    if (!data) return;
    setBankForm({
      bank_name: data.member.bank_name ?? '',
      bank_account: data.member.bank_account ?? '',
      bank_holder_name: data.member.bank_holder_name ?? '',
      reason: '',
    });
    setShowBankEdit(true);
  }

  async function saveBank() {
    if (!data) return;
    if (!bankForm.reason.trim()) { alert('请填写修改原因（将记录在审计日志中）'); return; }
    setSavingBank(true);
    const r = await fetch(`/api/members/${data.member.id}/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bankForm),
    });
    if (r.ok) {
      setData((prev) => prev ? {
        ...prev,
        member: { ...prev.member, ...bankForm },
      } : null);
      setShowBankEdit(false);
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string };
      alert(d.error ?? '保存失败');
    }
    setSavingBank(false);
  }

  async function deleteBank() {
    if (!data) return;
    if (!confirm('确定要删除该会员的银行信息吗？此操作不可逆。')) return;
    setDeletingBank(true);
    const r = await fetch(`/api/members/${data.member.id}/bank`, { method: 'DELETE' });
    if (r.ok) {
      setData((prev) => prev ? {
        ...prev,
        member: { ...prev.member, bank_status: 'DELETED' },
      } : null);
      setShowBankEdit(false);
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string };
      alert(d.error ?? '删除失败');
    }
    setDeletingBank(false);
  }

  async function saveGameAccount() {
    if (!data || !editingGame) return;
    setSavingGame(true);
    const r = await fetch(`/api/members/${data.member.id}/game-accounts/${encodeURIComponent(editingGame.provider)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: gameUsername }),
    });
    if (r.ok) {
      setData((prev) => prev ? {
        ...prev,
        accounts: prev.accounts.map((a) =>
          a.provider === editingGame.provider ? { ...a, username: gameUsername } : a
        ),
      } : null);
      setEditingGame(null);
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string };
      alert(d.error ?? '保存失败');
    }
    setSavingGame(false);
  }

  async function removeGameAccount(provider: string) {
    if (!data) return;
    if (!confirm(`确定要移除 ${provider} 游戏账号吗？`)) return;
    setRemovingGame(provider);
    const r = await fetch(`/api/members/${data.member.id}/game-accounts/${encodeURIComponent(provider)}`, {
      method: 'DELETE',
    });
    if (r.ok) {
      setData((prev) => prev ? {
        ...prev,
        accounts: prev.accounts.filter((a) => a.provider !== provider),
      } : null);
    } else {
      const d = await r.json().catch(() => ({})) as { error?: string };
      alert(d.error ?? '移除失败');
    }
    setRemovingGame(null);
  }

  if (loading) return <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>;
  if (!data)   return <div className="flex h-40 items-center justify-center text-gray-400">{loadError || 'Member not found.'}</div>;

  const { member, accounts, deposits, withdrawals, bonuses } = data;
  const referralCode      = (member as unknown as Record<string, string>).referral_code ?? null;
  const referredById      = (member as unknown as Record<string, unknown>).referred_by ?? null;
  const referrerPublicId  = (member as unknown as Record<string, string>).referrer_public_id ?? null;
  const referrerName      = (member as unknown as Record<string, string>).referrer_name ?? null;
  const referralCount     = (member as unknown as Record<string, number>).total_referrals ?? 0;

  return (
    <div className="space-y-4">
      {/* Bank Edit Modal */}
      {showBankEdit && (
        <Modal title="修改银行信息（需要 member.bank.edit 权限）" onClose={() => setShowBankEdit(false)}>
          <div className="space-y-3">
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              ⚠️ 银行信息修改将完整记录至审计日志，包括旧值、新值、操作人、IP 地址及修改原因。
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">银行名称</label>
              <select
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                value={bankForm.bank_name}
                onChange={(e) => setBankForm((p) => ({ ...p, bank_name: e.target.value }))}
              >
                <option value="">请选择银行</option>
                {MALAYSIA_BANKS.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">账号（仅限数字）</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                inputMode="numeric"
                value={bankForm.bank_account}
                onChange={(e) => setBankForm((p) => ({ ...p, bank_account: stripNonDigits(e.target.value) }))}
                placeholder="仅输入数字"
                maxLength={20}
              />
              {bankForm.bank_account && (() => {
                const err = validateBankAccount(bankForm.bank_account);
                return err ? <p className="mt-1 text-xs text-red-500">{err}</p> : null;
              })()}
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">持卡人姓名</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={bankForm.bank_holder_name}
                onChange={(e) => setBankForm((p) => ({ ...p, bank_holder_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                修改原因 <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                rows={2}
                placeholder="例：会员申请更换银行，已核实身份证明"
                value={bankForm.reason}
                onChange={(e) => setBankForm((p) => ({ ...p, reason: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={saveBank} disabled={savingBank || !bankForm.reason.trim()} className="flex-1">
                {savingBank ? '保存中…' : '确认修改'}
              </Button>
              <Button
                variant="destructive"
                onClick={deleteBank}
                disabled={deletingBank}
                className="flex-1"
              >
                {deletingBank ? '删除中…' : '删除银行信息'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Wallet Adjustment Dialog */}
      {showWalletAdjust && (
        <WalletAdjustmentDialog
          memberId={member.id}
          memberName={member.first_name}
          currentBalance={walletSummary?.balance ?? member.net_deposit}
          onClose={() => setShowWalletAdjust(false)}
          onSuccess={() => {
            setWalletRefreshKey(k => k + 1);
            void loadWallet(member.id);
          }}
        />
      )}

      {/* Game Account Edit Modal */}
      {editingGame && (
        <Modal title={`编辑游戏账号 — ${editingGame.provider}`} onClose={() => setEditingGame(null)}>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">游戏账号用户名</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={gameUsername}
                onChange={(e) => setGameUsername(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={saveGameAccount} disabled={savingGame} className="flex-1">
                {savingGame ? '保存中…' : '保存'}
              </Button>
              <Button variant="outline" onClick={() => setEditingGame(null)} className="flex-1">取消</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Header */}
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

      {/* New password banner */}
      {newPassword && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-800">新网站密码（仅显示一次）</p>
          <p className="mt-1 font-mono text-lg tracking-wider text-amber-900">{newPassword}</p>
          <p className="mt-1 text-amber-700">请将此密码告知会员，页面刷新后将不再显示。</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">

        {/* 1. ACCOUNT */}
        <Card>
          <CardHeader><CardTitle className="text-base">Account Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Member ID"        value={member.public_id ?? `#${member.id}`} />
            <Row label="Internal UID"     value={`#${member.id}`} />
            <Row label="Website Username" value={member.phone} />
            <Row label="Phone"            value={member.phone} />
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <Badge variant={member.status === 'ACTIVE' ? 'default' : 'destructive'}>{member.status}</Badge>
            </div>
            <Row label="Joined" value={new Date(member.created_at).toLocaleString()} />
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={resetWebsitePassword}
                disabled={resetting}
              >
                {resetting ? '重置中…' : '重置网站密码'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 2. TELEGRAM */}
        <Card>
          <CardHeader><CardTitle className="text-base">Telegram</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name"             value={member.first_name} />
            <Row label="Telegram Username" value={member.telegram_username ? `@${member.telegram_username}` : '—'} />
            <Row label="Telegram ID"      value={member.telegram_id} />
          </CardContent>
        </Card>

        {/* 3. FINANCIALS */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Financial Summary</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Row label="Total Deposits"    value={fmt(member.total_deposit)} />
            <Row label="Total Withdrawals" value={fmt(member.total_withdraw)} />
            <Row label="Net Deposit"       value={fmt(member.net_deposit)} />
            <Row label="Total Bonus"       value={fmt(member.total_bonus)} />
            <Row label="Deposit Count"     value={member.deposit_count} />
            <Row label="Withdrawal Count"  value={member.withdrawal_count} />
          </CardContent>
        </Card>

        {/* 4. WALLET CENTER */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Wallet Center</CardTitle>
              <Button size="sm" onClick={() => setShowWalletAdjust(true)}>
                + Wallet Adjustment
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {walletLoading ? (
              <div className="text-sm text-gray-400">Loading wallet summary…</div>
            ) : walletSummary ? (
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="col-span-2 sm:col-span-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                  <p className="text-xs text-blue-500 font-medium uppercase tracking-wide">Main Balance</p>
                  <p className="text-xl font-bold text-blue-700 mt-0.5">
                    RM {parseFloat(walletSummary.balance).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Pending Dep</p>
                  <p className={`text-lg font-bold mt-0.5 ${walletSummary.pending_deposits > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                    {walletSummary.pending_deposits}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Pending WD</p>
                  <p className={`text-lg font-bold mt-0.5 ${walletSummary.pending_withdrawals > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                    {walletSummary.pending_withdrawals}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Bonus</p>
                  <p className="text-lg font-bold text-gray-700 mt-0.5">
                    RM {parseFloat(walletSummary.total_bonus).toFixed(2)}
                  </p>
                </div>
                <Row label="Total Deposits"    value={`RM ${parseFloat(walletSummary.total_deposit).toFixed(2)}`} />
                <Row label="Total Withdrawals" value={`RM ${parseFloat(walletSummary.total_withdraw).toFixed(2)}`} />
                <Row label="Locked Balance"    value="RM 0.00" />
                <Row
                  label="Last Wallet Update"
                  value={walletSummary.last_wallet_update
                    ? new Date(walletSummary.last_wallet_update).toLocaleString()
                    : '—'}
                />
              </div>
            ) : (
              <div className="text-sm text-gray-400">Wallet summary unavailable (requires member.wallet.view permission)</div>
            )}
          </CardContent>
        </Card>

        {/* 5. BANK */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                Bank Info
                {(member as unknown as Record<string, string>).bank_status === 'DELETED' && (
                  <span className="text-xs font-normal text-red-500 border border-red-200 rounded px-1.5 py-0.5">已删除</span>
                )}
              </CardTitle>
              <Button size="sm" variant="outline" onClick={openBankEdit}>✏️ Edit</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Bank"        value={member.bank_name || '—'} />
            <Row label="Account"     value={member.bank_account || '—'} />
            <Row label="Holder Name" value={member.bank_holder_name || '—'} />
          </CardContent>
        </Card>

        {/* 6. GAME ACCOUNTS */}
        {accounts.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Game Accounts</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {accounts.map((a) => (
                  <div key={`${a.provider}-${a.username}`} className="flex items-center justify-between gap-2">
                    <span className="text-gray-500 w-24 shrink-0">{a.provider}</span>
                    <span className="font-mono flex-1">{a.username}</span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        className="rounded px-2 py-0.5 text-xs border border-gray-200 hover:bg-gray-50"
                        onClick={() => { setEditingGame(a); setGameUsername(a.username); }}
                      >
                        ✏️
                      </button>
                      <button
                        className="rounded px-2 py-0.5 text-xs border border-red-200 text-red-500 hover:bg-red-50"
                        onClick={() => removeGameAccount(a.provider)}
                        disabled={removingGame === a.provider}
                      >
                        {removingGame === a.provider ? '…' : '✕'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 7. REFERRAL INFO — always visible */}
        <Card>
          <CardHeader><CardTitle className="text-base">Referral Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Referral Code"
              value={referralCode
                ? <span className="font-mono text-purple-700 select-all">{referralCode}</span>
                : <span className="text-gray-400">未生成</span>}
            />
            <Row
              label="Referred By"
              value={referredById
                ? (
                  <a
                    href={`/members/${String(referredById)}`}
                    className="text-blue-600 hover:underline"
                  >
                    {referrerPublicId ?? `#${String(referredById)}`}
                    {referrerName ? ` (${referrerName})` : ''}
                  </a>
                ) : '—'}
            />
            <Row label="Total Referred" value={referralCount} />
            {referralCode && (
              <div className="pt-1 border-t">
                <p className="text-xs text-gray-400 mb-1">Telegram 邀请链接</p>
                <span className="text-xs font-mono text-gray-600 break-all select-all">
                  https://t.me/YourBot?start={referralCode}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 8. REMARKS */}
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

      {/* Deposit History */}
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

      {/* Withdrawal History */}
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

      {/* Bonus History */}
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

      {/* Wallet Transaction History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Wallet Transaction History</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowWalletAdjust(true)}>
              + Adjustment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <WalletHistory memberId={member.id} refreshKey={walletRefreshKey} />
        </CardContent>
      </Card>
    </div>
  );
}
