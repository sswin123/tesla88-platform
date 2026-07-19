'use client';

import { useEffect, useState, useCallback } from 'react';
import { UserPlus, Pencil, Ban, CheckCircle, Loader2, X } from 'lucide-react';

interface StaffMember {
  id: number;
  erp_username: string;
  display_name: string | null;
  telegram_id: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  added_by_username: string | null;
  created_at: string;
}

const ASSIGNABLE_ROLES = ['ADMIN', 'SUPERVISOR', 'FINANCE', 'SUPPORT', 'CS'];

interface Toast { msg: string; type: 'success' | 'error' }
function useToast() {
  const [t, setT] = useState<Toast | null>(null);
  const show = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setT({ msg, type });
    setTimeout(() => setT(null), 3000);
  }, []);
  return { toast: t, show };
}

function ToastBanner({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg text-white shadow-lg ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      <span className="text-sm">{toast.msg}</span>
      <button onClick={onDismiss}><X size={14} /></button>
    </div>
  );
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-800',
  ADMIN:       'bg-blue-100 text-blue-800',
  SUPERVISOR:  'bg-indigo-100 text-indigo-800',
  FINANCE:     'bg-yellow-100 text-yellow-800',
  SUPPORT:     'bg-green-100 text-green-800',
  CS:          'bg-gray-100 text-gray-800',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-700'}`}>
      {role}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Active</span>
  ) : (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Disabled</span>
  );
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

interface CreateForm { erp_username: string; display_name: string; telegram_id: string; role: string; password: string }
interface EditForm   { role: string; display_name: string; telegram_id: string; password: string; is_active: boolean }

export default function StaffPage() {
  const [staff, setStaff]       = useState<StaffMember[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [saving, setSaving]     = useState(false);
  const { toast, show }         = useToast();

  const [createForm, setCreateForm] = useState<CreateForm>({
    erp_username: '', display_name: '', telegram_id: '', role: 'CS', password: '',
  });
  const [editForm, setEditForm] = useState<EditForm>({
    role: 'CS', display_name: '', telegram_id: '', password: '', is_active: true,
  });

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/settings/staff');
      if (!r.ok) throw new Error('Failed');
      const d = await r.json() as { staff: StaffMember[] };
      setStaff(d.staff);
    } catch {
      show('Failed to load staff', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openEdit(member: StaffMember) {
    setEditTarget(member);
    setEditForm({
      role:         member.role,
      display_name: member.display_name ?? member.erp_username,
      telegram_id:  member.telegram_id ?? '',
      password:     '',
      is_active:    member.is_active,
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch('/api/settings/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const d = await r.json() as { error?: string };
      if (!r.ok) { show(d.error ?? 'Failed', 'error'); return; }
      show('Staff member created');
      setShowCreate(false);
      setCreateForm({ erp_username: '', display_name: '', telegram_id: '', role: 'CS', password: '' });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      role:         editForm.role,
      display_name: editForm.display_name,
      telegram_id:  editForm.telegram_id || null,
      is_active:    editForm.is_active,
    };
    if (editForm.password) body.password = editForm.password;
    try {
      const r = await fetch(`/api/settings/staff/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json() as { error?: string };
      if (!r.ok) { show(d.error ?? 'Failed', 'error'); return; }
      show('Staff member updated');
      setEditTarget(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(member: StaffMember) {
    const r = await fetch(`/api/settings/staff/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !member.is_active }),
    });
    const d = await r.json() as { error?: string };
    if (!r.ok) { show(d.error ?? 'Failed', 'error'); return; }
    show(member.is_active ? 'Staff member disabled' : 'Staff member enabled');
    await load();
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && <ToastBanner toast={toast} onDismiss={() => {}} />}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Manager</h1>
          <p className="text-sm text-gray-500 mt-1">Manage staff accounts and role assignments</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <UserPlus size={16} />
          Add Staff
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="animate-spin text-gray-400" size={32} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Username', 'Telegram ID', 'Role', 'Status', 'Last Login', 'Created At', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{m.display_name ?? m.erp_username}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.erp_username}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.telegram_id ?? '—'}</td>
                  <td className="px-4 py-3"><RoleBadge role={m.role} /></td>
                  <td className="px-4 py-3"><StatusBadge active={m.is_active} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(m.last_login_at)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(m.created_at)}</td>
                  <td className="px-4 py-3">
                    {m.role !== 'SUPER_ADMIN' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(m)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => toggleActive(m)}
                          className={`p-1.5 rounded hover:bg-gray-100 ${m.is_active ? 'text-gray-500 hover:text-red-600' : 'text-gray-500 hover:text-green-600'}`}
                          title={m.is_active ? 'Disable' : 'Enable'}
                        >
                          {m.is_active ? <Ban size={14} /> : <CheckCircle size={14} />}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">No staff members found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Add Staff Member</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={createForm.erp_username}
                  onChange={e => setCreateForm(f => ({ ...f, erp_username: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g. john_doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={createForm.display_name}
                  onChange={e => setCreateForm(f => ({ ...f, display_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Optional — defaults to username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telegram ID <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={createForm.telegram_id}
                  onChange={e => setCreateForm(f => ({ ...f, telegram_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g. 123456789"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={createForm.password}
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={createForm.role}
                  onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {ASSIGNABLE_ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">Edit Staff Member</h2>
            <p className="text-sm text-gray-500 mb-4">{editTarget.erp_username}</p>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={editForm.display_name}
                  onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telegram ID <span className="text-gray-400 font-normal">(leave blank to clear)</span></label>
                <input
                  type="text"
                  value={editForm.telegram_id}
                  onChange={e => setEditForm(f => ({ ...f, telegram_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g. 123456789"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {ASSIGNABLE_ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span>
                </label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700">Account Active</span>
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
