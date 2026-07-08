'use client';

import { useEffect, useState, useCallback } from 'react';
import { Lock } from 'lucide-react';
import { MANAGEABLE_ROLES, PERMISSION_GROUPS } from '@/lib/permission-defs';
import type { RoleDef } from '@/lib/permission-defs';

interface PermissionsData {
  roles: RoleDef[];
  matrix: Record<string, string[]>;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

function ToastBanner({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
        toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
    >
      {toast.message}
    </div>
  );
}

export default function PermissionsPage() {
  const [data, setData]               = useState<PermissionsData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [selectedRole, setSelectedRole] = useState<string>('ADMIN');
  const [saving, setSaving]           = useState<string | null>(null);
  const [toast, setToast]             = useState<Toast | null>(null);

  const showToast = useCallback((message: string, type: Toast['type']) => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    fetch('/api/settings/permissions')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: PermissionsData) => setData(d))
      .catch(() => showToast('Failed to load permissions', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  async function toggle(permission: string, currentlyGranted: boolean) {
    if (!data) return;
    const key = `${selectedRole}:${permission}`;
    setSaving(key);

    try {
      const res = await fetch('/api/settings/permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole, permission, granted: !currentlyGranted }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        showToast(err.error ?? 'Failed to update', 'error');
        return;
      }

      setData((prev) => {
        if (!prev) return prev;
        const current = prev.matrix[selectedRole] ?? [];
        const updated = !currentlyGranted
          ? [...current, permission]
          : current.filter((p) => p !== permission);
        return { ...prev, matrix: { ...prev.matrix, [selectedRole]: updated } };
      });
      showToast(
        `${!currentlyGranted ? 'Granted' : 'Revoked'}: ${permission}`,
        'success'
      );
    } catch {
      showToast('Network error', 'error');
    } finally {
      setSaving(null);
    }
  }

  const selectedRoleDef = MANAGEABLE_ROLES.find((r) => r.id === selectedRole);
  const grantedSet = new Set(data?.matrix[selectedRole] ?? []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        Loading permissions…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Staff Permissions</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Configure which pages and actions each role can access.
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Role List ─────────────────────────────────────────────── */}
        <aside className="w-52 shrink-0 border-r bg-gray-50 p-3">
          {MANAGEABLE_ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => !role.locked && setSelectedRole(role.id)}
              disabled={role.locked}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                role.locked
                  ? 'cursor-default text-gray-400'
                  : selectedRole === role.id
                  ? 'bg-white font-medium text-gray-900 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
            >
              <span className="text-base">{role.icon}</span>
              <span className="flex-1 text-left">{role.label}</span>
              {role.locked && <Lock size={12} className="text-gray-300" />}
            </button>
          ))}

          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-500">
            <p className="font-medium text-gray-700">👑 Super Admin</p>
            <p className="mt-1">Full system access. Permissions cannot be restricted.</p>
          </div>
        </aside>

        {/* ── Right: Permission Matrix ─────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6">
          {selectedRoleDef && (
            <div className="mb-5 flex items-center gap-2">
              <span className="text-2xl">{selectedRoleDef.icon}</span>
              <div>
                <h2 className="text-base font-semibold">{selectedRoleDef.label}</h2>
                <p className="text-xs text-gray-500">
                  {grantedSet.size} permission{grantedSet.size !== 1 ? 's' : ''} granted
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.module} className="rounded-lg border bg-white p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {group.module}
                </h3>
                <div className="space-y-2">
                  {group.permissions.map((perm) => {
                    const granted = grantedSet.has(perm.key);
                    const isSaving = saving === `${selectedRole}:${perm.key}`;

                    return (
                      <label
                        key={perm.key}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50 ${
                          isSaving ? 'opacity-60' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={granted}
                          disabled={isSaving}
                          onChange={() => void toggle(perm.key, granted)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{perm.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {toast && (
        <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
