'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { Promotion } from '@/lib/types';

type BonusMode = 'PERCENTAGE' | 'FIXED' | 'BUY1FREE1';
type ClaimLimit = 'UNLIMITED' | 'DAILY' | 'FIRST_DEPOSIT' | 'WEEKLY' | 'MANUAL';
type GameRestriction = 'ALL' | 'SLOT' | 'CASINO' | 'SPORT';

interface FormState {
  name: string;
  description: string;
  claim_limit: ClaimLimit;
  bonus_mode: BonusMode;
  bonus_value: string;
  min_deposit: string;
  max_bonus: string;
  turnover_multiplier: string;
  game_restriction: GameRestriction;
  expiry_date: string;
}

const EMPTY: FormState = {
  name: '', description: '', claim_limit: 'UNLIMITED',
  bonus_mode: 'PERCENTAGE', bonus_value: '10',
  min_deposit: '50', max_bonus: '', turnover_multiplier: '1',
  game_restriction: 'ALL', expiry_date: '',
};

const CLAIM_LABELS: Record<ClaimLimit, string> = {
  UNLIMITED: 'Unlimited', DAILY: 'Daily',
  FIRST_DEPOSIT: 'One Time', WEEKLY: 'Weekly', MANUAL: 'Manual',
};

const GAME_LABELS: Record<GameRestriction, string> = {
  ALL: 'All Games', SLOT: 'Slot Only', CASINO: 'Casino', SPORT: 'Sports',
};

function isBuy1Free1(p: Promotion): boolean {
  return p.bonus_type === 'PERCENTAGE' && parseFloat(p.bonus_value) === 100 && p.turnover_type === 'DEPOSIT';
}

function bonusModeLabel(p: Promotion): string {
  if (isBuy1Free1(p)) return 'Buy 1 Free 1';
  return p.bonus_type === 'PERCENTAGE' ? `${parseFloat(p.bonus_value)}%` : `RM ${parseFloat(p.bonus_value).toFixed(2)}`;
}

function formToApiBody(f: FormState) {
  const isBuy1 = f.bonus_mode === 'BUY1FREE1';
  return {
    name:                f.name,
    description:         f.description || null,
    promotion_type:      f.claim_limit,
    bonus_type:          isBuy1 ? 'PERCENTAGE' : f.bonus_mode,
    bonus_value:         isBuy1 ? 100 : parseFloat(f.bonus_value),
    min_deposit:         parseFloat(f.min_deposit),
    max_bonus:           f.max_bonus ? parseFloat(f.max_bonus) : null,
    turnover_multiplier: parseFloat(f.turnover_multiplier),
    turnover_type:       isBuy1 ? 'DEPOSIT' : 'BONUS',
    allowed_games:       f.game_restriction === 'ALL' ? [] : [f.game_restriction],
    expiry_date:         f.expiry_date || null,
  };
}

function promoToForm(p: Promotion): FormState {
  let bonus_mode: BonusMode = 'PERCENTAGE';
  if (isBuy1Free1(p)) bonus_mode = 'BUY1FREE1';
  else if (p.bonus_type === 'FIXED') bonus_mode = 'FIXED';

  const gameArr = p.allowed_games;
  let game_restriction: GameRestriction = 'ALL';
  if (gameArr.length === 1) {
    const g = gameArr[0].toUpperCase();
    if (g === 'SLOT' || g === 'CASINO' || g === 'SPORT') game_restriction = g as GameRestriction;
  }

  return {
    name:                p.name,
    description:         p.description ?? '',
    claim_limit:         p.promotion_type as ClaimLimit,
    bonus_mode,
    bonus_value:         parseFloat(p.bonus_value).toString(),
    min_deposit:         parseFloat(p.min_deposit).toString(),
    max_bonus:           p.max_bonus ? parseFloat(p.max_bonus).toString() : '',
    turnover_multiplier: parseFloat(p.turnover_multiplier).toString(),
    game_restriction,
    expiry_date:         p.expiry_date ? p.expiry_date.slice(0, 10) : '',
  };
}

interface Preview { bonus: number; total: number; turnover: number }

export default function PromotionsPage() {
  const [promos, setPromos]       = useState<Promotion[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Promotion | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY);
  const [preview, setPreview]     = useState<Preview | null>(null);
  const [previewDeposit, setPreviewDeposit] = useState('100');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  async function load() {
    setLoading(true);
    const r = await fetch('/api/promotions');
    setPromos(await r.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function calcPreview() {
    const body = formToApiBody(form);
    const r = await fetch('/api/promotions/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, deposit: parseFloat(previewDeposit) || 100 }),
    });
    if (r.ok) setPreview(await r.json());
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setPreview(null);
    setError('');
    setShowModal(true);
  }

  function openEdit(p: Promotion) {
    setEditing(p);
    setForm(promoToForm(p));
    setPreview(null);
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    const body = formToApiBody(form);
    const url    = editing ? `/api/promotions/${editing.id}` : '/api/promotions';
    const method = editing ? 'PATCH' : 'POST';
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) { setShowModal(false); await load(); }
    else {
      const d = await r.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? 'Save failed');
    }
    setSaving(false);
  }

  async function toggleActive(p: Promotion) {
    await fetch(`/api/promotions/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !p.is_active }),
    });
    await load();
  }

  async function handleDelete(p: Promotion) {
    if (!confirm(`Delete promotion "${p.name}"?`)) return;
    await fetch(`/api/promotions/${p.id}`, { method: 'DELETE' });
    await load();
  }

  function F(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Promotion Manager</h1>
        <Button onClick={openCreate}>+ Add Promotion</Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {['Name','Claim Limit','Bonus','Min Deposit','Max Bonus','Turnover','Games','Expiry','Status','Actions'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {promos.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2">{CLAIM_LABELS[p.promotion_type as ClaimLimit] ?? p.promotion_type}</td>
                  <td className="px-3 py-2">{bonusModeLabel(p)}</td>
                  <td className="px-3 py-2">RM {parseFloat(p.min_deposit).toFixed(0)}</td>
                  <td className="px-3 py-2">{p.max_bonus ? `RM ${parseFloat(p.max_bonus).toFixed(0)}` : '—'}</td>
                  <td className="px-3 py-2">{parseFloat(p.turnover_multiplier)}x</td>
                  <td className="px-3 py-2">{p.allowed_games.length === 0 ? 'All' : p.allowed_games.join(', ')}</td>
                  <td className="px-3 py-2">{p.expiry_date ? p.expiry_date.slice(0, 10) : '—'}</td>
                  <td className="px-3 py-2">
                    <Badge variant={p.is_active ? 'default' : 'secondary'}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => toggleActive(p)}>
                        {p.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(p)}>Del</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {promos.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">No promotions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl overflow-y-auto max-h-[90vh]">
            <h2 className="mb-4 text-lg font-semibold">{editing ? 'Edit Promotion' : 'Add Promotion'}</h2>
            <div className="space-y-3">
              <div>
                <Label className="mb-1 block">Name *</Label>
                <Input value={form.name} onChange={F('name')} placeholder="e.g. Welcome Bonus" />
              </div>
              <div>
                <Label className="mb-1 block">Description</Label>
                <textarea
                  value={form.description}
                  onChange={F('description')}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block">Claim Limit</Label>
                  <select value={form.claim_limit} onChange={F('claim_limit')}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none">
                    {(Object.entries(CLAIM_LABELS) as [ClaimLimit, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-1 block">Bonus Type</Label>
                  <select value={form.bonus_mode} onChange={F('bonus_mode')}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none">
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount (RM)</option>
                    <option value="BUY1FREE1">Buy 1 Free 1</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {form.bonus_mode !== 'BUY1FREE1' && (
                  <div>
                    <Label className="mb-1 block">
                      Bonus Value {form.bonus_mode === 'PERCENTAGE' ? '(%)' : '(RM)'}
                    </Label>
                    <Input type="text" inputMode="decimal" value={form.bonus_value} onChange={F('bonus_value')} />
                  </div>
                )}
                <div>
                  <Label className="mb-1 block">Min Deposit (RM)</Label>
                  <Input type="text" inputMode="decimal" value={form.min_deposit} onChange={F('min_deposit')} />
                </div>
                <div>
                  <Label className="mb-1 block">Max Bonus (RM, optional)</Label>
                  <Input type="text" inputMode="decimal" value={form.max_bonus} onChange={F('max_bonus')} placeholder="No limit" />
                </div>
                <div>
                  <Label className="mb-1 block">Turnover Multiplier</Label>
                  <Input type="text" inputMode="decimal" value={form.turnover_multiplier} onChange={F('turnover_multiplier')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block">Game Restriction</Label>
                  <select value={form.game_restriction} onChange={F('game_restriction')}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none">
                    {(Object.entries(GAME_LABELS) as [GameRestriction, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-1 block">Expiry Date (optional)</Label>
                  <Input type="date" value={form.expiry_date} onChange={F('expiry_date')} />
                </div>
              </div>

              <div className="rounded-md bg-gray-50 p-3">
                <p className="mb-2 text-sm font-medium">Bonus Preview</p>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={previewDeposit}
                    onChange={(e) => setPreviewDeposit(e.target.value)}
                    placeholder="Deposit amount"
                    className="w-32"
                  />
                  <Button variant="outline" size="sm" onClick={calcPreview}>Calculate</Button>
                </div>
                {preview && (
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Bonus</span><span>RM {preview.bonus.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Total Credit</span><span>RM {preview.total.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Min Withdrawal</span><span>RM {preview.turnover.toFixed(2)}</span></div>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
