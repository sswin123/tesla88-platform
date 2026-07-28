'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Settings2,
  Key,
  SlidersHorizontal,
  ShieldCheck,
  ScrollText,
  BarChart3,
  ClipboardList,
  RefreshCw,
  MoreHorizontal,
  AlertCircle,
  Plus,
  X,
  ChevronRight,
  Trash2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  HelpCircle,
} from 'lucide-react';

import {
  PROVIDER_STATUS,
  HEALTH_STATUS,
  WALLET_TYPES,
  ENVIRONMENTS,
  CREDENTIAL_TEMPLATES,
  CONFIG_TEMPLATES,
} from '@/components/brand-center/constants';
import { ProviderLogoAvatar } from '@/components/brand-center/ProviderLogoAvatar';
import { ProviderStatusBadge } from '@/components/brand-center/ProviderStatusBadge';
import { HealthBadge } from '@/components/brand-center/HealthBadge';
import { EmptyState } from '@/components/brand-center/EmptyState';
import { LoadingState } from '@/components/brand-center/LoadingState';
import { PermissionDenied } from '@/components/brand-center/PermissionDenied';
import { ConfirmDialog } from '@/components/brand-center/ConfirmDialog';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'general',       label: 'General',       icon: Settings2 },
  { id: 'credentials',   label: 'Credentials',   icon: Key },
  { id: 'configuration', label: 'Configuration', icon: SlidersHorizontal },
  { id: 'health',        label: 'Health',        icon: ShieldCheck },
  { id: 'logs',          label: 'Logs',          icon: ScrollText },
  { id: 'statistics',    label: 'Statistics',    icon: BarChart3 },
  { id: 'audit',         label: 'Audit',         icon: ClipboardList },
] as const;
type Tab = typeof TABS[number]['id'];

// ─── Types ───────────────────────────────────────────────────────────────────

type BrandProviderDetail = {
  id: number;
  status: string;
  wallet_type: string;
  environment: string;
  currency: string;
  health_status: string;
  health_checked_at: string | null;
  last_success_at: string | null;
  last_failed_at: string | null;
  created_at: string;
  updated_at: string;
  provider_code: string;
  provider_name: string;
  provider_display_name: string;
  brand_code: string;
  brand_name: string;
};

type CredRow = {
  key: string;
  is_encrypted: boolean;
  updated_at: string;
  updated_by_name: string | null;
  masked_value: string;
};

type CfgRow = {
  key: string;
  value: string;
  updated_at: string;
  updated_by_name: string | null;
};

type ToastState = { message: string; type: 'success' | 'error' } | null;

// ─── calcCompletion ──────────────────────────────────────────────────────────

function calcCompletion(
  providerCode: string,
  creds: CredRow[],
  cfgs: CfgRow[],
): number | null {
  const upper = providerCode.toUpperCase();
  const credTemplate = CREDENTIAL_TEMPLATES[upper] ?? [];
  const cfgTemplate = CONFIG_TEMPLATES[upper] ?? [];
  const total = credTemplate.length + cfgTemplate.length;
  if (total === 0) return null;
  const credKeys = new Set(creds.map(c => c.key));
  const cfgKeys = new Set(cfgs.map(c => c.key));
  const filled =
    credTemplate.filter(k => credKeys.has(k)).length +
    cfgTemplate.filter(k => cfgKeys.has(k)).length;
  return Math.round((filled / total) * 100);
}

// ─── CompletionPill ──────────────────────────────────────────────────────────

function CompletionPill({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  if (percent >= 100) {
    return (
      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
        ✓ 100%
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
      ⚠ {percent}%
    </span>
  );
}

// ─── GeneralTab ──────────────────────────────────────────────────────────────

interface GeneralTabProps {
  bp: BrandProviderDetail;
  onSave: (fields: {
    status: string;
    wallet_type: string;
    environment: string;
    currency: string;
  }) => Promise<void>;
}

function GeneralTab({ bp, onSave }: GeneralTabProps) {
  const [status, setStatus] = useState(bp.status);
  const [walletType, setWalletType] = useState(bp.wallet_type);
  const [environment, setEnvironment] = useState(bp.environment);
  const [currency, setCurrency] = useState(bp.currency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(bp.status);
    setWalletType(bp.wallet_type);
    setEnvironment(bp.environment);
    setCurrency(bp.currency);
  }, [bp]);

  const showDisableWarning =
    status === PROVIDER_STATUS.DISABLED && bp.status === PROVIDER_STATUS.ACTIVE;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        status,
        wallet_type: walletType,
        environment,
        currency,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function fmt(d: string) {
    return new Date(d).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const labelCls =
    'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1';
  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          <AlertCircle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {showDisableWarning && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
          <AlertCircle size={14} className="flex-shrink-0" />
          Setting to DISABLED will stop all player traffic.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Status */}
        <div>
          <label className={labelCls}>Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className={inputCls}
          >
            {Object.values(PROVIDER_STATUS).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Wallet Type */}
        <div>
          <label className={labelCls}>Wallet Type</label>
          <select
            value={walletType}
            onChange={e => setWalletType(e.target.value)}
            className={inputCls}
          >
            {WALLET_TYPES.map(w => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>

        {/* Environment */}
        <div>
          <label className={labelCls}>Environment</label>
          <select
            value={environment}
            onChange={e => setEnvironment(e.target.value)}
            className={inputCls}
          >
            {ENVIRONMENTS.map(env => (
              <option key={env} value={env}>{env}</option>
            ))}
          </select>
        </div>

        {/* Currency */}
        <div>
          <label className={labelCls}>Currency</label>
          <input
            type="text"
            value={currency}
            onChange={e =>
              setCurrency(e.target.value.toUpperCase().slice(0, 3))
            }
            maxLength={3}
            className={inputCls}
            placeholder="e.g. MYR"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Created: {fmt(bp.created_at)}&nbsp; &nbsp;Last updated: {fmt(bp.updated_at)}
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <RefreshCw size={14} className="animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}

// ─── InlineEditForm ──────────────────────────────────────────────────────────

interface InlineEditFormProps {
  credKey: string;
  isEncrypted: boolean;
  onCancel: () => void;
  onUpdate: (value: string, encrypt: boolean) => Promise<void>;
}

function InlineEditForm({
  credKey,
  isEncrypted,
  onCancel,
  onUpdate,
}: InlineEditFormProps) {
  const [value, setValue] = useState('');
  const [encrypt, setEncrypt] = useState(isEncrypted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate() {
    if (!value.trim()) {
      setError('Value is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onUpdate(value, encrypt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
      <div className="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-400 mb-1">
        <Key size={12} />
        {credKey}
      </div>

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      <input
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="New value…"
        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={encrypt}
          onChange={e => setEncrypt(e.target.checked)}
          className="w-3.5 h-3.5 accent-blue-600"
        />
        Encrypt
      </label>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleUpdate}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {saving && <RefreshCw size={11} className="animate-spin" />}
          Update
        </button>
      </div>
    </div>
  );
}

// ─── CredentialRow ───────────────────────────────────────────────────────────

interface CredentialRowProps {
  cred: CredRow;
  editingKey: string | null;
  onEdit: (key: string) => void;
  onCancelEdit: () => void;
  onUpdate: (key: string, value: string, encrypt: boolean) => Promise<void>;
  onRemove: (key: string) => void;
  openOverflowKey: string | null;
  setOpenOverflowKey: (key: string | null) => void;
}

function CredentialRow({
  cred,
  editingKey,
  onEdit,
  onCancelEdit,
  onUpdate,
  onRemove,
  openOverflowKey,
  setOpenOverflowKey,
}: CredentialRowProps) {
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openOverflowKey !== cred.key) return;
    function handleMousedown(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOpenOverflowKey(null);
      }
    }
    document.addEventListener('mousedown', handleMousedown);
    return () => document.removeEventListener('mousedown', handleMousedown);
  }, [openOverflowKey, cred.key, setOpenOverflowKey]);

  if (editingKey === cred.key) {
    return (
      <InlineEditForm
        credKey={cred.key}
        isEncrypted={cred.is_encrypted}
        onCancel={onCancelEdit}
        onUpdate={(value, encrypt) => onUpdate(cred.key, value, encrypt)}
      />
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
      <Key size={14} className="text-slate-400 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-slate-700 dark:text-slate-300">
            {cred.key}
          </span>
          {cred.is_encrypted && (
            <ShieldCheck size={14} className="text-emerald-500" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs font-mono text-slate-400 tracking-widest">
            •••••••
          </span>
          {cred.masked_value && cred.masked_value !== '—' && (
            <span className="text-xs text-slate-400">({cred.masked_value})</span>
          )}
          {cred.updated_by_name && (
            <span className="text-xs text-slate-400">
              by {cred.updated_by_name}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(cred.key)}
          className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
        >
          Edit
        </button>

        {/* Overflow menu */}
        <div ref={overflowRef} className="relative">
          <button
            onClick={() =>
              setOpenOverflowKey(openOverflowKey === cred.key ? null : cred.key)
            }
            className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="More options"
          >
            <MoreHorizontal size={14} />
          </button>

          {openOverflowKey === cred.key && (
            <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
              <button
                onClick={() => {
                  setOpenOverflowKey(null);
                  onRemove(cred.key);
                }}
                className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={12} />
                Remove credential
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AddCredentialModal ──────────────────────────────────────────────────────

interface AddCredentialModalProps {
  prefillKey?: string;
  onClose: () => void;
  onAdd: (key: string, value: string, encrypt: boolean) => Promise<void>;
}

function AddCredentialModal({
  prefillKey,
  onClose,
  onAdd,
}: AddCredentialModalProps) {
  const [key, setKey] = useState(prefillKey ?? '');
  const [value, setValue] = useState('');
  const [encrypt, setEncrypt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!key.trim()) {
      setError('Key is required');
      return;
    }
    if (!value.trim()) {
      setError('Value is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd(key.trim(), value, encrypt);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to add credential',
      );
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls =
    'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Add Credential
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Key</label>
            <input
              type="text"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="e.g. api_key"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Value</label>
            <input
              type="password"
              autoComplete="new-password"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Secret value…"
              className={inputCls}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={encrypt}
              onChange={e => setEncrypt(e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-600"
            />
            Encrypt value
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <RefreshCw size={14} className="animate-spin" />}
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CredentialsTab ──────────────────────────────────────────────────────────

interface CredentialsTabProps {
  providerCode: string;
  credentials: CredRow[];
  onReload: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
  brandCode: string;
}

function CredentialsTab({
  providerCode,
  credentials,
  onReload,
  showToast,
  brandCode,
}: CredentialsTabProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [removeKey, setRemoveKey] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [prefillKey, setPrefillKey] = useState<string | undefined>(undefined);
  const [openOverflowKey, setOpenOverflowKey] = useState<string | null>(null);

  const templateKeys = CREDENTIAL_TEMPLATES[providerCode.toUpperCase()] ?? [];
  const credKeySet = new Set(credentials.map(c => c.key));

  function openAddModal(key?: string) {
    setPrefillKey(key);
    setShowAddModal(true);
  }

  async function handleAdd(key: string, value: string, encrypt: boolean) {
    const res = await fetch(
      `/api/brands/${brandCode}/providers/${providerCode}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'credential', key, value, encrypt }),
      },
    );
    if (!res.ok) {
      const data =
        (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    setShowAddModal(false);
    onReload();
    showToast('Credential added', 'success');
  }

  async function handleUpdate(
    key: string,
    value: string,
    encrypt: boolean,
  ) {
    const res = await fetch(
      `/api/brands/${brandCode}/providers/${providerCode}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'credential', key, value, encrypt }),
      },
    );
    if (!res.ok) {
      const data =
        (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    setEditingKey(null);
    onReload();
    showToast('Credential updated', 'success');
  }

  async function handleRemoveConfirm() {
    if (!removeKey) return;
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/brands/${brandCode}/providers/${providerCode}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'credential',
            key: removeKey,
            value: '[CLEARED]',
            encrypt: false,
          }),
        },
      );
      if (!res.ok) {
        const data =
          (await res.json().catch(() => ({}))) as { error?: string };
        showToast(data.error ?? 'Failed to clear credential', 'error');
      } else {
        showToast('Credential cleared (key retained with placeholder value).', 'success');
        onReload();
      }
    } catch {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setRemoving(false);
      setRemoveKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {showAddModal && (
        <AddCredentialModal
          prefillKey={prefillKey}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAdd}
        />
      )}

      <ConfirmDialog
        open={!!removeKey}
        title="Clear Credential"
        description={`Clear the value for "${removeKey}"? The key will be retained with a placeholder value \`[CLEARED]\`. This cannot be undone.`}
        confirmLabel="Clear"
        confirmVariant="danger"
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoveKey(null)}
        saving={removing}
      />

      {/* Template chips */}
      {templateKeys.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {templateKeys.map(k => {
            const filled = credKeySet.has(k);
            return (
              <button
                key={k}
                onClick={() => !filled && openAddModal(k)}
                disabled={filled}
                className={
                  `px-2.5 py-1 rounded-full text-xs font-mono transition-colors ` +
                  (filled
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-default'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer')
                }
              >
                {filled ? `✓ ${k}` : k}
              </button>
            );
          })}
        </div>
      )}

      {/* Credential list */}
      <div className="space-y-1">
        {credentials.length === 0 ? (
          <EmptyState
            icon={Key}
            title="No credentials yet"
            description="Add credentials for this provider to enable the integration."
            action={{ label: '+ Add Credential', onClick: () => openAddModal() }}
          />
        ) : (
          credentials.map(cred => (
            <CredentialRow
              key={cred.key}
              cred={cred}
              editingKey={editingKey}
              onEdit={k => setEditingKey(k)}
              onCancelEdit={() => setEditingKey(null)}
              onUpdate={handleUpdate}
              onRemove={k => setRemoveKey(k)}
              openOverflowKey={openOverflowKey}
              setOpenOverflowKey={setOpenOverflowKey}
            />
          ))
        )}
      </div>

      {credentials.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => openAddModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Add Credential
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ConfigInlineEditForm ────────────────────────────────────────────────────

interface ConfigInlineEditFormProps {
  cfgKey: string;
  onCancel: () => void;
  onUpdate: (value: string) => Promise<void>;
}

function ConfigInlineEditForm({
  cfgKey,
  onCancel,
  onUpdate,
}: ConfigInlineEditFormProps) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate() {
    if (!value.trim()) {
      setError('Value is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onUpdate(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
      <div className="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-400 mb-1">
        <SlidersHorizontal size={12} />
        {cfgKey}
      </div>

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="New value…"
        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleUpdate}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {saving && <RefreshCw size={11} className="animate-spin" />}
          Update
        </button>
      </div>
    </div>
  );
}

// ─── ConfigRow ───────────────────────────────────────────────────────────────

interface ConfigRowProps {
  cfg: CfgRow;
  editingKey: string | null;
  onEdit: (key: string) => void;
  onCancelEdit: () => void;
  onUpdate: (key: string, value: string) => Promise<void>;
  onRemove: (key: string) => void;
  openOverflowKey: string | null;
  setOpenOverflowKey: (key: string | null) => void;
}

function ConfigRow({
  cfg,
  editingKey,
  onEdit,
  onCancelEdit,
  onUpdate,
  onRemove,
  openOverflowKey,
  setOpenOverflowKey,
}: ConfigRowProps) {
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openOverflowKey !== cfg.key) return;
    function handleMousedown(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOpenOverflowKey(null);
      }
    }
    document.addEventListener('mousedown', handleMousedown);
    return () => document.removeEventListener('mousedown', handleMousedown);
  }, [openOverflowKey, cfg.key, setOpenOverflowKey]);

  if (editingKey === cfg.key) {
    return (
      <ConfigInlineEditForm
        cfgKey={cfg.key}
        onCancel={onCancelEdit}
        onUpdate={value => onUpdate(cfg.key, value)}
      />
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
      <SlidersHorizontal size={14} className="text-slate-400 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-slate-700 dark:text-slate-300">
            {cfg.key}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate max-w-xs">
            {cfg.value}
          </span>
          {cfg.updated_by_name && (
            <span className="text-xs text-slate-400">
              by {cfg.updated_by_name}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(cfg.key)}
          className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
        >
          Edit
        </button>

        {/* Overflow menu */}
        <div ref={overflowRef} className="relative">
          <button
            onClick={() =>
              setOpenOverflowKey(openOverflowKey === cfg.key ? null : cfg.key)
            }
            className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="More options"
          >
            <MoreHorizontal size={14} />
          </button>

          {openOverflowKey === cfg.key && (
            <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
              <button
                onClick={() => {
                  setOpenOverflowKey(null);
                  onRemove(cfg.key);
                }}
                className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={12} />
                Remove config
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AddConfigModal ──────────────────────────────────────────────────────────

interface AddConfigModalProps {
  prefillKey?: string;
  onClose: () => void;
  onAdd: (key: string, value: string) => Promise<void>;
}

function AddConfigModal({
  prefillKey,
  onClose,
  onAdd,
}: AddConfigModalProps) {
  const [key, setKey] = useState(prefillKey ?? '');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!key.trim()) {
      setError('Key is required');
      return;
    }
    if (!value.trim()) {
      setError('Value is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd(key.trim(), value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add config');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls =
    'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Add Configuration
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Key</label>
            <input
              type="text"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="e.g. lobby_url"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Value</label>
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Config value…"
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <RefreshCw size={14} className="animate-spin" />}
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ConfigurationTab ────────────────────────────────────────────────────────

interface ConfigurationTabProps {
  providerCode: string;
  config: CfgRow[];
  onReload: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
  brandCode: string;
}

function ConfigurationTab({
  providerCode,
  config,
  onReload,
  showToast,
  brandCode,
}: ConfigurationTabProps) {
  const [cfgEditingKey, setCfgEditingKey] = useState<string | null>(null);
  const [cfgRemoveKey, setCfgRemoveKey] = useState<string | null>(null);
  const [cfgRemoving, setCfgRemoving] = useState(false);
  const [showAddCfgModal, setShowAddCfgModal] = useState(false);
  const [prefillCfgKey, setPrefillCfgKey] = useState<string | undefined>(undefined);
  const [openCfgOverflowKey, setOpenCfgOverflowKey] = useState<string | null>(null);

  const templateKeys = CONFIG_TEMPLATES[providerCode.toUpperCase()] ?? [];
  const cfgKeySet = new Set(config.map(c => c.key));

  function openAddModal(key?: string) {
    setPrefillCfgKey(key);
    setShowAddCfgModal(true);
  }

  async function handleAdd(key: string, value: string) {
    const res = await fetch(
      `/api/brands/${brandCode}/providers/${providerCode}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'config', key, value }),
      },
    );
    if (!res.ok) {
      const data =
        (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    setShowAddCfgModal(false);
    onReload();
    showToast('Configuration added', 'success');
  }

  async function handleUpdate(key: string, value: string) {
    const res = await fetch(
      `/api/brands/${brandCode}/providers/${providerCode}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'config', key, value }),
      },
    );
    if (!res.ok) {
      const data =
        (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    setCfgEditingKey(null);
    onReload();
    showToast('Configuration updated', 'success');
  }

  async function handleRemoveConfirm() {
    if (!cfgRemoveKey) return;
    setCfgRemoving(true);
    try {
      const res = await fetch(
        `/api/brands/${brandCode}/providers/${providerCode}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'config',
            key: cfgRemoveKey,
            value: '[CLEARED]',
          }),
        },
      );
      if (!res.ok) {
        const data =
          (await res.json().catch(() => ({}))) as { error?: string };
        showToast(data.error ?? 'Failed to clear config value', 'error');
      } else {
        showToast('Config value cleared.', 'success');
        onReload();
      }
    } catch {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setCfgRemoving(false);
      setCfgRemoveKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {showAddCfgModal && (
        <AddConfigModal
          prefillKey={prefillCfgKey}
          onClose={() => setShowAddCfgModal(false)}
          onAdd={handleAdd}
        />
      )}

      <ConfirmDialog
        open={!!cfgRemoveKey}
        title="Clear Config Value"
        description={`Clear the value for "${cfgRemoveKey}"? The key will be retained with a placeholder value \`[CLEARED]\`. This cannot be undone.`}
        confirmLabel="Clear"
        confirmVariant="danger"
        onConfirm={handleRemoveConfirm}
        onCancel={() => setCfgRemoveKey(null)}
        saving={cfgRemoving}
      />

      {/* Template chips */}
      {templateKeys.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {templateKeys.map(k => {
            const filled = cfgKeySet.has(k);
            return (
              <button
                key={k}
                onClick={() => !filled && openAddModal(k)}
                disabled={filled}
                className={
                  `px-2.5 py-1 rounded-full text-xs font-mono transition-colors ` +
                  (filled
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-default'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer')
                }
              >
                {filled ? `✓ ${k}` : k}
              </button>
            );
          })}
        </div>
      )}

      {/* Config list */}
      <div className="space-y-1">
        {config.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="No configuration yet"
            description="Add configuration values for this provider to enable the integration."
            action={{ label: '+ Add Configuration', onClick: () => openAddModal() }}
          />
        ) : (
          config.map(cfg => (
            <ConfigRow
              key={cfg.key}
              cfg={cfg}
              editingKey={cfgEditingKey}
              onEdit={k => setCfgEditingKey(k)}
              onCancelEdit={() => setCfgEditingKey(null)}
              onUpdate={handleUpdate}
              onRemove={k => setCfgRemoveKey(k)}
              openOverflowKey={openCfgOverflowKey}
              setOpenOverflowKey={setOpenCfgOverflowKey}
            />
          ))
        )}
      </div>

      {config.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => openAddModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Add Configuration
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Health icon mapping ──────────────────────────────────────────────────────

const HEALTH_ICON_CFG: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  [HEALTH_STATUS.HEALTHY]:  { icon: CheckCircle,   color: 'text-emerald-500', label: 'Healthy' },
  [HEALTH_STATUS.DEGRADED]: { icon: AlertTriangle, color: 'text-amber-500',   label: 'Degraded' },
  [HEALTH_STATUS.DOWN]:     { icon: XCircle,       color: 'text-red-500',     label: 'Down' },
  [HEALTH_STATUS.UNKNOWN]:  { icon: HelpCircle,    color: 'text-slate-400',   label: 'Unknown' },
};

// ─── HealthTab ────────────────────────────────────────────────────────────────

interface HealthTabProps {
  bp: BrandProviderDetail;
}

function HealthTab({ bp }: HealthTabProps) {
  const cfg = HEALTH_ICON_CFG[bp.health_status] ?? HEALTH_ICON_CFG[HEALTH_STATUS.UNKNOWN];
  const Icon = cfg.icon;

  const statCardCls =
    'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Health Status */}
        <div className={statCardCls}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Health Status
          </p>
          <div className={`flex flex-col items-center py-2 ${cfg.color}`}>
            <Icon size={48} />
            <span className="mt-2 text-sm font-semibold">{cfg.label}</span>
          </div>
        </div>

        {/* Last Checked */}
        <div className={statCardCls}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Last Checked
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {bp.health_checked_at
              ? new Date(bp.health_checked_at).toLocaleString()
              : '—'}
          </p>
        </div>

        {/* Last Success */}
        <div className={statCardCls}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Last Success
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {bp.last_success_at
              ? new Date(bp.last_success_at).toLocaleString()
              : '—'}
          </p>
        </div>

        {/* Last Failed */}
        <div className={statCardCls}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Last Failed
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {bp.last_failed_at
              ? new Date(bp.last_failed_at).toLocaleString()
              : '—'}
          </p>
        </div>
      </div>

      {/* Future banner */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400 text-sm">
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        Automated health monitoring will be available after provider integration is complete.
      </div>
    </div>
  );
}

// ─── Logs / Statistics / Audit tabs ──────────────────────────────────────────

function LogsTab() {
  return (
    <EmptyState
      icon={ScrollText}
      title="No Log Data"
      description="Provider activity logs will be available after the provider is integrated and active."
    />
  );
}

function StatisticsTab() {
  return (
    <EmptyState
      icon={BarChart3}
      title="No Statistics"
      description="Traffic statistics will appear once the provider is receiving player activity."
    />
  );
}

function AuditTab() {
  return (
    <EmptyState
      icon={ClipboardList}
      title="No Audit Records"
      description="Configuration change history will be recorded once provider operations begin."
    />
  );
}

// ─── OverflowMenu ────────────────────────────────────────────────────────────

interface OverflowMenuProps {
  status: string;
  onReload: () => void;
  onDisable: () => void;
  onRemove: () => void;
}

function OverflowMenu({
  status,
  onReload,
  onDisable,
  onRemove,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMousedown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMousedown);
    return () => document.removeEventListener('mousedown', handleMousedown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="More options"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
          <button
            onClick={() => {
              setOpen(false);
              onReload();
            }}
            className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Reload
          </button>

          {status === PROVIDER_STATUS.ACTIVE && (
            <button
              onClick={() => {
                setOpen(false);
                onDisable();
              }}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Disable
            </button>
          )}

          <div className="my-1 border-t border-slate-200 dark:border-slate-700" />

          <button
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Remove Provider
          </button>

          <button
            disabled
            className="w-full text-left px-4 py-2 text-sm text-slate-400 dark:text-slate-600 cursor-not-allowed"
            title="Coming soon"
          >
            Export Config
          </button>
        </div>
      )}
    </div>
  );
}

// ─── RemoveProviderModal ─────────────────────────────────────────────────────

interface RemoveProviderModalProps {
  open: boolean;
  providerCode: string;
  brandCode: string;
  onClose: () => void;
  onSuccess: () => void;
}

function RemoveProviderModal({
  open,
  providerCode,
  brandCode,
  onClose,
  onSuccess,
}: RemoveProviderModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/brands/${brandCode}/providers/${providerCode}`,
        { method: 'DELETE' },
      );
      if (res.status === 409) {
        const data =
          (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error ??
            'Cannot remove: provider is ACTIVE. Set status to DISABLED first.',
        );
        return;
      }
      if (!res.ok) {
        const data =
          (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to remove provider',
      );
    } finally {
      setSaving(false);
    }
  }

  const defaultDescription = `This will permanently remove ${providerCode} from ${brandCode}. All credentials and configuration will be deleted. This cannot be undone.`;

  return (
    <ConfirmDialog
      open={open}
      title="Remove Provider"
      description={error ?? defaultDescription}
      confirmLabel="Remove Provider"
      confirmVariant="danger"
      onConfirm={handleConfirm}
      onCancel={() => {
        if (!saving) {
          setError(null);
          onClose();
        }
      }}
      saving={saving}
    />
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BrandProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();
  const providerCode = (params.providerCode as string).toUpperCase();

  const [bp, setBp] = useState<BrandProviderDetail | null>(null);
  const [credentials, setCredentials] = useState<CredRow[]>([]);
  const [config, setConfig] = useState<CfgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3500);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/brands/${code}/providers/${providerCode}`,
      );
      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error('Failed to load provider');
      const data = (await res.json()) as {
        brand_provider: BrandProviderDetail;
        credentials: CredRow[];
        config: CfgRow[];
      };
      setBp(data.brand_provider);
      setCredentials(data.credentials);
      setConfig(data.config);
    } catch {
      showToast('Failed to load provider data', 'error');
    } finally {
      setLoading(false);
    }
  }, [code, providerCode, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveGeneral(fields: {
    status: string;
    wallet_type: string;
    environment: string;
    currency: string;
  }) {
    const res = await fetch(
      `/api/brands/${code}/providers/${providerCode}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'settings', ...fields }),
      },
    );
    if (!res.ok) {
      const data =
        (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    showToast('Settings saved', 'success');
    load();
  }

  async function handleDisable() {
    try {
      const res = await fetch(
        `/api/brands/${code}/providers/${providerCode}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'settings',
            status: PROVIDER_STATUS.DISABLED,
          }),
        },
      );
      if (!res.ok) {
        const data =
          (await res.json().catch(() => ({}))) as { error?: string };
        showToast(data.error ?? 'Failed to disable provider', 'error');
        return;
      }
      showToast('Provider disabled', 'success');
      load();
    } catch {
      showToast('Network error. Please try again.', 'error');
    }
  }

  if (loading) return <LoadingState message="Loading provider…" />;
  if (unauthorized) return <PermissionDenied />;
  if (notFound || !bp) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-1">
          Provider Not Found
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          No provider &ldquo;{providerCode}&rdquo; found for brand &ldquo;
          {code}&rdquo;.
        </p>
        <Link
          href={`/brand-center/${code}`}
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Back to Brand
        </Link>
      </div>
    );
  }

  const completion = calcCompletion(providerCode, credentials, config);

  function renderTabContent() {
    switch (activeTab) {
      case 'general':
        return (
          <GeneralTab
            bp={bp!}
            onSave={handleSaveGeneral}
          />
        );
      case 'credentials':
        return (
          <CredentialsTab
            providerCode={providerCode}
            credentials={credentials}
            onReload={load}
            showToast={showToast}
            brandCode={code}
          />
        );
      case 'configuration':
        return (
          <ConfigurationTab
            providerCode={providerCode}
            config={config}
            onReload={load}
            showToast={showToast}
            brandCode={code}
          />
        );
      case 'health':
        return <HealthTab bp={bp!} />;
      case 'logs':
        return <LogsTab />;
      case 'statistics':
        return <StatisticsTab />;
      case 'audit':
        return <AuditTab />;
    }
  }

  return (
    <>
      {/* Toast notification */}
      {toast && (
        <div
          className={
            `fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ` +
            (toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white')
          }
        >
          {toast.type === 'error' && <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}

      {/* Remove Provider Dialog */}
      <RemoveProviderModal
        open={showRemoveModal}
        providerCode={providerCode}
        brandCode={code}
        onClose={() => setShowRemoveModal(false)}
        onSuccess={() => {
          setShowRemoveModal(false);
          showToast('Provider removed', 'success');
          router.push(`/brand-center/${code}`);
        }}
      />

      {/* Disable Provider Confirmation */}
      <ConfirmDialog
        open={showDisableConfirm}
        title="Disable Provider"
        description={`This will set ${bp?.provider_code} to DISABLED and stop all player traffic on ${bp?.brand_code}. Are you sure?`}
        confirmLabel="Disable"
        confirmVariant="danger"
        onConfirm={() => { setShowDisableConfirm(false); handleDisable(); }}
        onCancel={() => setShowDisableConfirm(false)}
      />

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <Link
            href="/brand-center"
            className="text-blue-600 hover:underline dark:text-blue-400 font-medium"
          >
            Brand Center
          </Link>
          <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
          <Link
            href={`/brand-center/${code}`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {code}
          </Link>
          <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
          <span className="text-slate-500 dark:text-slate-400 font-mono">
            {providerCode}
          </span>
        </nav>

        {/* Header card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-start gap-4">
            <ProviderLogoAvatar providerCode={providerCode} size="md" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                  {bp.provider_display_name || bp.provider_name}
                </h1>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {bp.provider_code}
                </span>
                <ProviderStatusBadge status={bp.status} />
                <HealthBadge status={bp.health_status} />
                <CompletionPill percent={completion} />
              </div>

              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">
                Brand: {bp.brand_code} — {bp.brand_name}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {bp.wallet_type} · {bp.environment} · {bp.currency}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={load}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Refresh"
              >
                <RefreshCw size={16} />
              </button>
              <OverflowMenu
                status={bp.status}
                onReload={load}
                onDisable={() => setShowDisableConfirm(true)}
                onRemove={() => setShowRemoveModal(true)}
              />
            </div>
          </div>
        </div>

        {/* Tab bar + Content */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          {/* Tab bar — horizontal scroll */}
          <div className="overflow-x-auto border-b border-slate-200 dark:border-slate-700">
            <div className="flex min-w-max">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={
                      `flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ` +
                      (active
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800')
                    }
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          <div className="p-6">{renderTabContent()}</div>
        </div>
      </div>
    </>
  );
}
