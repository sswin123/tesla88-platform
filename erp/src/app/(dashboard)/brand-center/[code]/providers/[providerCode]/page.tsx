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
  Zap,
  Power,
  Activity,
  Layers,
  Server,
  Globe,
  Database,
  Lock,
  Cpu,
  ArrowRight,
} from 'lucide-react';

import {
  PROVIDER_STATUS,
  HEALTH_STATUS,
  WALLET_TYPES,
  ENVIRONMENTS,
  CREDENTIAL_TEMPLATES,
  CONFIG_TEMPLATES,
} from '@/components/brand-center/constants';
import type { RuntimeSnapshot, RuntimeCheck } from '@/lib/providers';
import { ProviderLogoAvatar } from '@/components/brand-center/ProviderLogoAvatar';
import { ProviderStatusBadge } from '@/components/brand-center/ProviderStatusBadge';
import { HealthBadge } from '@/components/brand-center/HealthBadge';
import { EmptyState } from '@/components/brand-center/EmptyState';
import { LoadingState } from '@/components/brand-center/LoadingState';
import { PermissionDenied } from '@/components/brand-center/PermissionDenied';
import { ConfirmDialog } from '@/components/brand-center/ConfirmDialog';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',      label: 'Overview',      icon: Activity },
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
  gp_wallet_type: string;
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

// ─── LaunchReadyCard ─────────────────────────────────────────────────────────

interface LaunchReadyCardProps {
  bp: BrandProviderDetail;
  credCount: number;
  cfgCount: number;
  onEnable: () => void;
  enabling: boolean;
}

function LaunchReadyCard({ bp, credCount, cfgCount, onEnable, enabling }: LaunchReadyCardProps) {
  const isActive  = bp.status === PROVIDER_STATUS.ACTIVE;
  const hasCreds  = credCount > 0;
  const hasCfg    = cfgCount > 0;
  const healthOk  = bp.health_status === HEALTH_STATUS.HEALTHY;
  const allReady  = isActive && hasCreds && hasCfg && healthOk;

  const checks: { label: string; ok: boolean; hint: string }[] = [
    { label: 'Credentials configured', ok: hasCreds,  hint: 'Add at least one credential in the Credentials tab' },
    { label: 'Configuration set',      ok: hasCfg,    hint: 'Add at least one config key in the Configuration tab' },
    { label: 'Connection test passed', ok: healthOk,  hint: 'Run a connection test in the Health tab' },
    { label: 'Status = ACTIVE',        ok: isActive,  hint: 'Change Status to ACTIVE in the General tab' },
  ];

  return (
    <div className={`rounded-xl border p-4 ${
      allReady
        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
        : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={14} className={allReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} />
          <span className={`text-sm font-semibold ${allReady ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {allReady ? 'Launch Ready' : 'Not Ready to Launch'}
          </span>
        </div>
        {!isActive && (
          <button
            onClick={onEnable}
            disabled={enabling}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {enabling ? <RefreshCw size={11} className="animate-spin" /> : <Power size={11} />}
            Enable Now
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {checks.map(c => (
          <div key={c.label} className="flex items-start gap-2">
            {c.ok
              ? <CheckCircle size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />
              : <XCircle    size={13} className="text-red-400     flex-shrink-0 mt-0.5" />}
            <div>
              <span className="text-xs text-slate-700 dark:text-slate-300">{c.label}</span>
              {!c.ok && (
                <p className="text-xs text-slate-400 dark:text-slate-500 leading-tight">{c.hint}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DisabledBanner ───────────────────────────────────────────────────────────

function DisabledBanner({ providerCode, onEnable, enabling }: { providerCode: string; onEnable: () => void; enabling: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30">
      <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Provider is DISABLED — players cannot launch {providerCode} games
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
          Change Status to <strong>ACTIVE</strong> in the General tab, or click Enable Now to activate immediately.
        </p>
      </div>
      <button
        onClick={onEnable}
        disabled={enabling}
        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
      >
        {enabling ? <RefreshCw size={11} className="animate-spin" /> : <Power size={11} />}
        Enable Now
      </button>
    </div>
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
          {walletType !== bp.gp_wallet_type && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertCircle size={11} className="flex-shrink-0" />
              Provider Registry default is <strong>{bp.gp_wallet_type}</strong>. Confirm this override is intentional.
            </p>
          )}
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

// ─── OverviewTab ──────────────────────────────────────────────────────────────

const STATE_ORDER: string[] = [
  'CREATED', 'CONFIGURED', 'CREDENTIAL_READY', 'CONNECTED', 'HEALTHY', 'LAUNCH_READY',
];

const STATE_CFG: Record<string, { label: string; color: string; dot: string; hint: string }> = {
  CREATED:          { label: 'Created',           color: 'text-slate-500',              dot: 'bg-slate-400',    hint: 'Add configuration and credentials to continue' },
  CONFIGURED:       { label: 'Configured',        color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', hint: 'Add credentials in the Credentials tab' },
  CREDENTIAL_READY: { label: 'Credential Ready',  color: 'text-blue-600 dark:text-blue-400',   dot: 'bg-blue-500',  hint: 'Run Connection Test to verify API connectivity' },
  CONNECTED:        { label: 'Connected',         color: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-500', hint: 'API reachable — run Connection Test for full health' },
  HEALTHY:          { label: 'Healthy',           color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', hint: 'Sync game catalog and set Status to ACTIVE' },
  LAUNCH_READY:     { label: 'Launch Ready',      color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', hint: 'Set Status to ACTIVE in the General tab' },
};

interface OverviewTabProps {
  bp: BrandProviderDetail;
  snapshot: RuntimeSnapshot | null;
  brandCode: string;
  providerCode: string;
  onReload: () => void;
}

function OverviewTab({ bp, snapshot, brandCode, providerCode, onReload }: OverviewTabProps) {
  const [reloading, setReloading] = useState(false);

  const handleReload = async () => {
    setReloading(true);
    try {
      await fetch(`/api/brands/${brandCode}/providers/${providerCode}/reload`, { method: 'POST' });
      onReload();
    } catch { /* ignore */ } finally {
      setReloading(false);
    }
  };

  const cardCls = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4';

  const statePct = snapshot
    ? Math.round(((STATE_ORDER.indexOf(snapshot.state) + 1) / STATE_ORDER.length) * 100)
    : null;
  const stCfg = snapshot ? (STATE_CFG[snapshot.state] ?? STATE_CFG.CREATED) : null;

  return (
    <div className="space-y-5">
      {/* State Machine Progress */}
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Provider State</p>
          <button
            onClick={handleReload}
            disabled={reloading}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg
              bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600
              text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={11} className={reloading ? 'animate-spin' : ''} />
            Reload Runtime
          </button>
        </div>

        {snapshot ? (
          <>
            {/* Progress bar */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${statePct}%` }}
                />
              </div>
              <span className="text-xs text-slate-500">{statePct}%</span>
            </div>
            {/* State steps */}
            <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-1">
              {STATE_ORDER.map((s, i) => {
                const current   = STATE_ORDER.indexOf(snapshot.state);
                const reached   = i <= current;
                const isCurrent = i === current;
                const sCfg      = STATE_CFG[s];
                return (
                  <div key={s} className="flex items-center gap-1 flex-shrink-0">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className={`h-2 w-2 rounded-full transition-colors ${reached ? (sCfg?.dot ?? 'bg-slate-400') : 'bg-slate-200 dark:bg-slate-600'}`} />
                      <span className={`text-xs whitespace-nowrap ${isCurrent ? (stCfg?.color ?? 'text-slate-500') : reached ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300 dark:text-slate-600'}`}>
                        {sCfg?.label}
                      </span>
                    </div>
                    {i < STATE_ORDER.length - 1 && (
                      <div className={`h-px w-4 flex-shrink-0 mt-[-10px] ${i < current ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    )}
                  </div>
                );
              })}
            </div>
            {stCfg && snapshot.state !== 'LAUNCH_READY' && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <ArrowRight size={11} />
                {stCfg.hint}
              </p>
            )}
          </>
        ) : (
          <div className="h-8 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
        )}
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            icon: Server,
            label: 'Admin Status',
            value: bp.status,
            color: bp.status === 'ACTIVE'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400',
          },
          {
            icon: Globe,
            label: 'Environment',
            value: bp.environment,
            color: bp.environment === 'PRODUCTION' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400',
          },
          {
            icon: Layers,
            label: 'Wallet Type',
            value: bp.wallet_type,
            color: 'text-slate-600 dark:text-slate-300',
          },
          {
            icon: Database,
            label: 'Games Synced',
            value: snapshot ? `${snapshot.games_synced} games` : '…',
            color: (snapshot?.games_synced ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400',
          },
          {
            icon: Cpu,
            label: 'Adapter Version',
            value: snapshot?.adapter_version ?? '—',
            color: 'text-slate-600 dark:text-slate-300',
          },
          {
            icon: Activity,
            label: 'Config Keys',
            value: snapshot ? `${snapshot.config_count} / ${snapshot.config_count + snapshot.missing_config_keys.length}` : '…',
            color: (snapshot?.missing_config_keys.length ?? 0) === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
          },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className={cardCls}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={13} className="text-slate-400" />
              <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            </div>
            <p className={`text-sm font-semibold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Readiness checks */}
      {snapshot && (
        <div className={cardCls}>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Readiness Checks</p>
          <div className="space-y-2">
            {[
              { icon: SlidersHorizontal, label: 'Configuration', check: snapshot.health.configuration },
              { icon: Lock,              label: 'Credentials',   check: snapshot.health.credentials    },
              { icon: Cpu,               label: 'Adapter',       check: snapshot.health.adapter        },
              { icon: Globe,             label: 'Network',       check: snapshot.health.network        },
              { icon: ShieldCheck,       label: 'Authentication',check: snapshot.health.authentication },
              { icon: Activity,          label: 'Provider API',  check: snapshot.health.provider_api   },
              { icon: Database,          label: 'Game Sync',     check: snapshot.health.game_sync      },
              { icon: Zap,               label: 'Launch Ready',  check: snapshot.health.launch         },
            ].map(({ icon: Icon, label, check }) => (
              <OverviewCheckRow key={label} icon={Icon} label={label} check={check} />
            ))}
          </div>
          {snapshot.health.tested_at && (
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
              Last tested: {new Date(snapshot.health.tested_at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Missing keys */}
      {snapshot && (snapshot.missing_config_keys.length > 0 || snapshot.missing_credential_keys.length > 0) && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-sm">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="text-amber-700 dark:text-amber-300">
            {snapshot.missing_config_keys.length > 0 && (
              <p>Missing config: <span className="font-mono text-xs">{snapshot.missing_config_keys.join(', ')}</span></p>
            )}
            {snapshot.missing_credential_keys.length > 0 && (
              <p>Missing credentials: <span className="font-mono text-xs">{snapshot.missing_credential_keys.join(', ')}</span></p>
            )}
          </div>
        </div>
      )}

      {/* Diagnostics */}
      {snapshot && snapshot.diagnostics.length > 0 && (
        <div className={cardCls}>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Build Diagnostics</p>
          <div className="space-y-1.5">
            {snapshot.diagnostics.map((step, i) => {
              const col =
                step.status === 'ok'      ? 'text-emerald-600 dark:text-emerald-400'
                : step.status === 'failed'  ? 'text-red-600 dark:text-red-400'
                :                            'text-slate-400';
              const dot =
                step.status === 'ok'      ? 'bg-emerald-500'
                : step.status === 'failed'  ? 'bg-red-500'
                :                            'bg-slate-300 dark:bg-slate-600';
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1 ${dot}`} />
                  <span className="w-32 flex-shrink-0 font-mono text-slate-500 dark:text-slate-400">{step.step}</span>
                  <span className={`flex-shrink-0 ${col}`}>{step.status}</span>
                  <span className="text-slate-400 flex-shrink-0">{step.duration_ms}ms</span>
                  {step.detail && <span className="text-slate-400 truncate">{step.detail}</span>}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Snapshot built at {new Date(snapshot.loaded_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

function OverviewCheckRow({
  icon: Icon,
  label,
  check,
}: {
  icon: typeof Server;
  label: string;
  check: RuntimeCheck;
}) {
  const { color, dot } =
    check.status === 'ok'      ? { color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' }
    : check.status === 'warning' ? { color: 'text-amber-600 dark:text-amber-400',   dot: 'bg-amber-500' }
    : check.status === 'error'   ? { color: 'text-red-600 dark:text-red-400',        dot: 'bg-red-500' }
    :                              { color: 'text-slate-400',                         dot: 'bg-slate-300 dark:bg-slate-600' };

  return (
    <div className="flex items-start gap-3">
      <Icon size={13} className="text-slate-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-28 flex-shrink-0">{label}</span>
          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dot}`} />
          <span className={`text-xs ${color} truncate`}>{check.message}</span>
        </div>
        {check.detail && (
          <p className="text-xs text-slate-400 dark:text-slate-500 pl-30 mt-0.5 ml-30 truncate">{check.detail}</p>
        )}
      </div>
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

interface UrlCheckResult {
  label: string;
  url: string | null;
  state: 'ok' | 'configured' | 'error';
  latency_ms: number | null;
  http_status?: number;
  error?: string;
}

interface CredCheckResult {
  label: string;
  key: string;
  loaded: boolean;
}

interface TestResult {
  overall: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  url_checks: UrlCheckResult[];
  credential_checks: CredCheckResult[];
  adapter: { built: boolean; error: string | null; decrypt_errors: string[] };
  health: { provider: string; status: string; latency_ms: number | null; error_message?: string; checked_at: string } | null;
  summary: {
    urls_checked: number;
    urls_ok: number;
    urls_configured: number;
    urls_error: number;
    credentials_present: number;
    credentials_total: number;
    adapter_built: boolean;
    health_status: string;
  };
  tested_at: string;
}

interface HealthTabProps {
  bp: BrandProviderDetail;
  brandCode: string;
  providerCode: string;
  onReload: () => void;
  snapshot?: RuntimeSnapshot | null;
}

function HealthTab({ bp, brandCode, providerCode, onReload, snapshot }: HealthTabProps) {
  const cfg = HEALTH_ICON_CFG[bp.health_status] ?? HEALTH_ICON_CFG[HEALTH_STATUS.UNKNOWN];
  const Icon = cfg.icon;

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const runTest = async () => {
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const res = await fetch(`/api/brands/${brandCode}/providers/${providerCode}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setTestError(data.error ?? `HTTP ${res.status}`);
      } else {
        setTestResult(data as TestResult);
        onReload();
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const statCardCls =
    'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4';

  const urlStateColor = (state: UrlCheckResult['state']) =>
    state === 'ok'         ? 'text-emerald-600 dark:text-emerald-400'
    : state === 'configured' ? 'text-amber-600 dark:text-amber-400'
    :                          'text-red-600 dark:text-red-400';

  const urlStateDot = (state: UrlCheckResult['state']) =>
    state === 'ok'           ? 'bg-emerald-500'
    : state === 'configured' ? 'bg-amber-500'
    :                          'bg-red-500';

  const overallColor = (s: string) =>
    s === 'HEALTHY'  ? 'text-emerald-600 dark:text-emerald-400'
    : s === 'DEGRADED' ? 'text-amber-600 dark:text-amber-400'
    :                    'text-red-600 dark:text-red-400';

  return (
    <div className="space-y-4">
      {/* Snapshot-based pre-test breakdown */}
      {snapshot && (
        <div className={statCardCls}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Health Breakdown</p>
          <div className="space-y-1.5">
            {[
              { icon: SlidersHorizontal, label: 'Configuration', check: snapshot.health.configuration },
              { icon: Lock,              label: 'Credentials',   check: snapshot.health.credentials    },
              { icon: Cpu,               label: 'Adapter',       check: snapshot.health.adapter        },
              { icon: Globe,             label: 'Network',       check: snapshot.health.network        },
              { icon: ShieldCheck,       label: 'Authentication',check: snapshot.health.authentication },
              { icon: Activity,          label: 'Provider API',  check: snapshot.health.provider_api   },
              { icon: Database,          label: 'Game Sync',     check: snapshot.health.game_sync      },
              { icon: Zap,               label: 'Launch',        check: snapshot.health.launch         },
            ].map(({ icon: HIcon, label, check }) => {
              const dot =
                check.status === 'ok'      ? 'bg-emerald-500'
                : check.status === 'warning' ? 'bg-amber-500'
                : check.status === 'error'   ? 'bg-red-500'
                :                              'bg-slate-300 dark:bg-slate-600';
              const msgColor =
                check.status === 'ok'      ? 'text-emerald-600 dark:text-emerald-400'
                : check.status === 'warning' ? 'text-amber-600 dark:text-amber-400'
                : check.status === 'error'   ? 'text-red-600 dark:text-red-400'
                :                              'text-slate-400';
              return (
                <div key={label} className="flex items-start gap-2 text-xs">
                  <HIcon size={12} className="text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="w-24 flex-shrink-0 text-slate-600 dark:text-slate-300">{label}</span>
                  <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1 ${dot}`} />
                  <span className={msgColor}>{check.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status cards */}
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

      {/* Connection Test button */}
      <div className="flex items-center gap-3">
        <button
          onClick={runTest}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white transition-colors"
        >
          {testing ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Testing…
            </>
          ) : (
            <>Run Connection Test</>
          )}
        </button>
        {testResult && !testing && (
          <span className={`text-sm font-semibold ${overallColor(testResult.overall)}`}>
            {testResult.overall}
          </span>
        )}
        {testError && !testing && (
          <span className="text-sm text-red-600 dark:text-red-400">{testError}</span>
        )}
      </div>

      {/* Test results */}
      {testResult && (
        <div className="space-y-3">
          {/* URL checks */}
          {testResult.url_checks.length > 0 && (
            <div className={statCardCls}>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">URL Reachability</p>
              <div className="space-y-2">
                {testResult.url_checks.map((c) => (
                  <div key={c.label} className="flex items-start gap-2 text-sm">
                    <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${urlStateDot(c.state)}`} />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{c.label}</span>
                      {c.url && (
                        <span className="ml-2 text-slate-400 dark:text-slate-500 truncate text-xs">
                          {c.url}
                        </span>
                      )}
                      <div className={`text-xs mt-0.5 ${urlStateColor(c.state)}`}>
                        {c.state === 'ok'          ? `HTTP ${c.http_status} · ${c.latency_ms}ms`
                         : c.state === 'configured' ? `HTTP ${c.http_status} — server reached (auth required)`
                         :                            c.error ?? 'Unreachable'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credential checks */}
          {testResult.credential_checks.length > 0 && (
            <div className={statCardCls}>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Credential Presence</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {testResult.credential_checks.map((c) => (
                  <div key={c.key} className="flex items-center gap-1.5 text-sm">
                    <span className={`h-2 w-2 rounded-full ${c.loaded ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className={c.loaded ? 'text-slate-700 dark:text-slate-200' : 'text-red-600 dark:text-red-400'}>
                      {c.label}
                    </span>
                  </div>
                ))}
              </div>
              {testResult.adapter.decrypt_errors.length > 0 && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                  Decrypt errors: {testResult.adapter.decrypt_errors.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Adapter + live health */}
          <div className={statCardCls}>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Adapter &amp; Live Health</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${testResult.adapter.built ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="text-slate-700 dark:text-slate-200">
                  {testResult.adapter.built ? 'Adapter built successfully' : 'Adapter build failed'}
                </span>
              </div>
              {testResult.adapter.error && (
                <p className="text-xs text-red-600 dark:text-red-400 pl-4">{testResult.adapter.error}</p>
              )}
              {testResult.health && (
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${
                    testResult.health.status === 'HEALTHY' ? 'bg-emerald-500'
                    : testResult.health.status === 'DEGRADED' ? 'bg-amber-500'
                    : 'bg-red-500'
                  }`} />
                  <span className={`font-medium ${overallColor(testResult.health.status)}`}>
                    {testResult.health.status}
                  </span>
                  {testResult.health.latency_ms != null && (
                    <span className="text-slate-400 dark:text-slate-500 text-xs">
                      {testResult.health.latency_ms}ms
                    </span>
                  )}
                  {testResult.health.error_message && (
                    <span className="text-red-600 dark:text-red-400 text-xs">
                      — {testResult.health.error_message}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            Tested at {new Date(testResult.tested_at).toLocaleString()}
          </p>
        </div>
      )}
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
  onEnable: () => void;
  onDisable: () => void;
  onRemove: () => void;
}

function OverflowMenu({
  status,
  onReload,
  onEnable,
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

          {status !== PROVIDER_STATUS.ACTIVE && (
            <button
              onClick={() => {
                setOpen(false);
                onEnable();
              }}
              className="w-full text-left px-4 py-2 text-sm text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors font-medium"
            >
              Enable Provider
            </button>
          )}

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
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [enabling, setEnabling] = useState(false);
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

      // Fetch snapshot in parallel (non-blocking — UI shows without it)
      fetch(`/api/brands/${code}/providers/${providerCode}/snapshot`)
        .then(r => r.ok ? r.json() : null)
        .then(snap => { if (snap) setSnapshot(snap as RuntimeSnapshot); })
        .catch(() => undefined);
    } catch {
      showToast('Failed to load provider data', 'error');
    } finally {
      setLoading(false);
    }
  }, [code, providerCode, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Warn before hard navigation / tab close when provider is still DISABLED
  useEffect(() => {
    if (!bp || bp.status !== PROVIDER_STATUS.DISABLED) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [bp]);

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

  async function handleEnable() {
    setEnabling(true);
    try {
      const res = await fetch(`/api/brands/${code}/providers/${providerCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'settings', status: PROVIDER_STATUS.ACTIVE }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(data.error ?? 'Failed to enable provider', 'error');
        return;
      }
      showToast('Provider enabled — players can now launch games', 'success');
      load();
    } catch {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setEnabling(false);
    }
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
      case 'overview':
        return (
          <OverviewTab
            bp={bp!}
            snapshot={snapshot}
            brandCode={code}
            providerCode={providerCode}
            onReload={load}
          />
        );
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
        return <HealthTab bp={bp!} brandCode={code} providerCode={providerCode} onReload={load} snapshot={snapshot} />;
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

      {/* DISABLED warning banner */}
      {bp.status === PROVIDER_STATUS.DISABLED && (
        <div className="mb-4">
          <DisabledBanner
            providerCode={providerCode}
            onEnable={handleEnable}
            enabling={enabling}
          />
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
                onEnable={handleEnable}
                onDisable={() => setShowDisableConfirm(true)}
                onRemove={() => setShowRemoveModal(true)}
              />
            </div>
          </div>
        </div>

        {/* Launch Ready checklist */}
        <LaunchReadyCard
          bp={bp}
          credCount={credentials.length}
          cfgCount={config.length}
          onEnable={handleEnable}
          enabling={enabling}
        />

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
