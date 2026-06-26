'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getRoleLabel } from '@/lib/permissions';
import type { AdminRole } from '@/lib/types';

interface AdminUser {
  id: number;
  erp_username: string;
  telegram_id: string | null;
  role: string;
  is_active: boolean;
  added_by_username: string | null;
  created_at: string;
}

const ALL_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'CS', 'FINANCE', 'SUPERVISOR', 'SUPPORT'];

const ROLE_BADGE_CLASS: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-800',
  ADMIN:       'bg-blue-100 text-blue-800',
  FINANCE:     'bg-green-100 text-green-800',
  SUPERVISOR:  'bg-yellow-100 text-yellow-800',
  SUPPORT:     'bg-orange-100 text-orange-800',
  CS:          'bg-gray-100 text-gray-800',
};

const EMPTY_FORM = {
  erp_username: '',
  telegram_id: '',
  role: 'CS' as AdminRole,
  password: '',
};

export default function AdminUsersPage() {
  const [admins, setAdmins]       = useState<AdminUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');
  const [roleEdits, setRoleEdits] = useState<Record<number, string>>({});
  const [busy, setBusy]           = useState<Record<number, boolean>>({});

  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin-users');
    if (r.ok) {
      const data = await r.json();
      setAdmins(data.admins ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.erp_username.trim()) {
      setFormError('Username is required.');
      return;
    }
    if (!form.password) {
      setFormError('Password is required.');
      return;
    }
    setSaving(true);
    setFormError('');
    const r = await fetch('/api/admin-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        erp_username: form.erp_username.trim(),
        telegram_id:  form.telegram_id.trim() || undefined,
        role:         form.role,
        password:     form.password,
      }),
    });
    if (r.ok) {
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      await load();
    } else {
      const d = await r.json().catch(() => ({}));
      setFormError(d.error ?? 'Failed to create admin');
    }
    setSaving(false);
  }

  async function toggleActive(admin: AdminUser) {
    setBusy(b => ({ ...b, [admin.id]: true }));
    const r = await fetch(`/api/admin-users/${admin.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !admin.is_active }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error ?? 'Failed to update status');
    } else {
      await load();
    }
    setBusy(b => ({ ...b, [admin.id]: false }));
  }

  async function saveRole(admin: AdminUser) {
    const newRole = roleEdits[admin.id];
    if (!newRole || newRole === admin.role) return;
    setBusy(b => ({ ...b, [admin.id]: true }));
    const r = await fetch(`/api/admin-users/${admin.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error ?? 'Failed to update role');
    } else {
      setRoleEdits(e => { const next = { ...e }; delete next[admin.id]; return next; });
      await load();
    }
    setBusy(b => ({ ...b, [admin.id]: false }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Users</h1>
          <p className="text-sm text-gray-500">Manage ERP admin accounts. Visible to SUPER_ADMIN only.</p>
        </div>
        <Button onClick={() => { setShowForm(true); setFormError(''); setForm({ ...EMPTY_FORM }); }}>
          + Add Admin
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {['Username', 'Telegram ID', 'Role', 'Status', 'Added By', 'Created At', 'Actions'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {admins.map((a) => {
                const currentRole = roleEdits[a.id] ?? a.role;
                const roleChanged = roleEdits[a.id] !== undefined && roleEdits[a.id] !== a.role;
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{a.erp_username}</td>
                    <td className="px-3 py-2 text-gray-500">{a.telegram_id ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASS[a.role] ?? 'bg-gray-100 text-gray-800'}`}>
                          {getRoleLabel(a.role)}
                        </span>
                        <select
                          value={currentRole}
                          onChange={(e) => setRoleEdits(r => ({ ...r, [a.id]: e.target.value }))}
                          className="rounded border px-1 py-0.5 text-xs"
                          disabled={busy[a.id]}
                        >
                          {ALL_ROLES.map(r => (
                            <option key={r} value={r}>{getRoleLabel(r)}</option>
                          ))}
                        </select>
                        {roleChanged && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveRole(a)}
                            disabled={busy[a.id]}
                          >
                            Save
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={a.is_active ? 'default' : 'secondary'}>
                        {a.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{a.added_by_username ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleActive(a)}
                        disabled={busy[a.id]}
                      >
                        {a.is_active ? 'Disable' : 'Enable'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {admins.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                    No admin accounts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold">Create Admin Account</h2>
            <div className="mb-4 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
              You are creating an admin account. Make sure to share credentials securely.
            </div>
            <div className="space-y-3">
              <div>
                <Label className="mb-1 block">Username <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. john_admin"
                  value={form.erp_username}
                  onChange={(e) => setForm(f => ({ ...f, erp_username: e.target.value }))}
                />
              </div>
              <div>
                <Label className="mb-1 block">Telegram ID (optional)</Label>
                <Input
                  placeholder="e.g. 123456789"
                  value={form.telegram_id}
                  onChange={(e) => setForm(f => ({ ...f, telegram_id: e.target.value }))}
                />
              </div>
              <div>
                <Label className="mb-1 block">Role <span className="text-red-500">*</span></Label>
                <select
                  value={form.role}
                  onChange={(e) => setForm(f => ({ ...f, role: e.target.value as AdminRole }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  {ALL_ROLES.map(r => (
                    <option key={r} value={r}>{getRoleLabel(r)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1 block">Password <span className="text-red-500">*</span></Label>
                <Input
                  type="text"
                  placeholder="Temporary password"
                  value={form.password}
                  onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>
              {formError && <p className="text-sm text-red-500">{formError}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating…' : 'Create Admin'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
