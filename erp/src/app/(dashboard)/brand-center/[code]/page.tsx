'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Store,
  ChevronRight,
  RefreshCw,
  Plug,
  Plus,
  Key,
  Settings,
  X,
  AlertCircle,
} from 'lucide-react';

import { StatusBadge } from '@/components/brand-center/StatusBadge';
import { ProviderStatusBadge } from '@/components/brand-center/ProviderStatusBadge';
import { ProviderLogoAvatar } from '@/components/brand-center/ProviderLogoAvatar';
import { CompletionBar } from '@/components/brand-center/CompletionBar';
import { EmptyState } from '@/components/brand-center/EmptyState';
import { LoadingState } from '@/components/brand-center/LoadingState';
import { PermissionDenied } from '@/components/brand-center/PermissionDenied';
import {
  WALLET_TYPES,
  ENVIRONMENTS,
  CREDENTIAL_TEMPLATES,
  CONFIG_TEMPLATES,
} from '@/components/brand-center/constants';

// ─── Completion calculation ──────────────────────────────────────────────────

function calcCompletion(
  providerCode: string,
  credentialCount: number,
  configCount: number,
): number | null {
  const upper = providerCode.toUpperCase();
  const credTemplate = CREDENTIAL_TEMPLATES[upper] ?? [];
  const cfgTemplate = CONFIG_TEMPLATES[upper] ?? [];
  const total = credTemplate.length + cfgTemplate.length;
  if (total === 0) return null;
  const filled =
    Math.min(credentialCount, credTemplate.length) +
    Math.min(configCount, cfgTemplate.length);
  return Math.round((filled / total) * 100);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Brand = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type BrandSettings = {
  brand_name?: string;
  company_name?: string;
} | null;

type BrandProvider = {
  id: number;
  provider_code: string;
  provider_name: string;
  provider_display_name: string;
  status: string;
  wallet_type: string;
  environment: string;
  currency: string;
  health_status: string;
  credential_count: number;
  config_count: number;
  updated_at: string;
};

type CatalogProvider = {
  id: number;
  code: string;
  name: string;
  display_name: string;
  status: string;
};

// ─── Health dot helper ───────────────────────────────────────────────────────

function healthDotClass(healthStatus: string): string {
  switch (healthStatus) {
    case 'HEALTHY':  return 'bg-emerald-500';
    case 'DEGRADED': return 'bg-amber-500';
    case 'DOWN':     return 'bg-red-500';
    default:         return 'bg-slate-400';
  }
}

// ─── Toast ───────────────────────────────────────────────────────────────────

type ToastState = { message: string; type: 'success' | 'error' } | null;

// ─── EnableProviderModal ─────────────────────────────────────────────────────

interface EnableProviderModalProps {
  brandCode: string;
  enabledCodes: string[];
  onClose: () => void;
  onSuccess: () => void;
}

function EnableProviderModal({
  brandCode,
  enabledCodes,
  onClose,
  onSuccess,
}: EnableProviderModalProps) {
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selected, setSelected] = useState('');
  const [walletType, setWalletType] = useState<string>('SEAMLESS');
  const [environment, setEnvironment] = useState<string>('PRODUCTION');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch catalog when modal opens
  useEffect(() => {
    setCatalogLoading(true);
    fetch('/api/games/settings')
      .then(r => r.json())
      .then((data: CatalogProvider[]) => {
        const filtered = Array.isArray(data)
          ? data.filter(p => !enabledCodes.includes(p.code))
          : [];
        setCatalog(filtered);
        if (filtered.length > 0) setSelected(filtered[0].code);
      })
      .catch(() => setError('Failed to load provider catalog'))
      .finally(() => setCatalogLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandCode}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_code: selected,
          wallet_type: walletType,
          environment: environment,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Enable Provider
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {catalogLoading ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Loading providers…
          </div>
        ) : catalog.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            All available providers are already enabled.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Provider select */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Provider
              </label>
              <select
                value={selected}
                onChange={e => setSelected(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {catalog.map(p => (
                  <option key={p.code} value={p.code}>
                    {p.display_name || p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Wallet type */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Wallet Type
              </label>
              <select
                value={walletType}
                onChange={e => setWalletType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {WALLET_TYPES.map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            {/* Environment */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Environment
              </label>
              <select
                value={environment}
                onChange={e => setEnvironment(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ENVIRONMENTS.map(env => (
                  <option key={env} value={env}>{env}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || catalogLoading || catalog.length === 0 || !selected}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Enabling…
              </>
            ) : (
              <>
                <Plus size={14} />
                Enable
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BrandDetailPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();

  const [brand, setBrand] = useState<Brand | null>(null);
  const [settings, setSettings] = useState<BrandSettings>(null);
  const [providers, setProviders] = useState<BrandProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [showEnableModal, setShowEnableModal] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [refreshing, setRefreshing] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      // Fetch brand overview
      const brandRes = await fetch(`/api/brands/${code}`);
      if (brandRes.status === 401) { setUnauthorized(true); return; }
      if (brandRes.status === 404) { setNotFound(true); return; }
      if (!brandRes.ok) throw new Error('Failed to load brand');
      const brandData = await brandRes.json() as { brand: Brand; settings: BrandSettings };
      setBrand(brandData.brand);
      setSettings(brandData.settings);

      // Fetch providers list (includes credential_count / config_count)
      const provRes = await fetch(`/api/brands/${code}/providers`);
      if (!provRes.ok) throw new Error('Failed to load providers');
      const provData = await provRes.json() as BrandProvider[];
      setProviders(provData);
    } catch {
      showToast('Failed to load brand data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [code, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <LoadingState message="Loading brand…" />;
  if (unauthorized) return <PermissionDenied />;
  if (notFound || !brand) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-1">
          Brand Not Found
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          No brand with code &ldquo;{code}&rdquo; exists.
        </p>
        <Link
          href="/brand-center"
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Back to Brand Center
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Toast */}
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

      {/* Enable Provider Modal */}
      {showEnableModal && (
        <EnableProviderModal
          brandCode={code}
          enabledCodes={providers.map(p => p.provider_code)}
          onClose={() => setShowEnableModal(false)}
          onSuccess={() => {
            setShowEnableModal(false);
            showToast('Provider enabled successfully', 'success');
            loadData();
          }}
        />
      )}

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <Link
            href="/brand-center"
            className="text-blue-600 hover:underline dark:text-blue-400 font-medium"
          >
            ← Brand Center
          </Link>
          <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
          <span className="text-slate-500 dark:text-slate-400 font-mono">{code}</span>
        </nav>

        {/* Brand Overview Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-start gap-4">
            {/* Store icon */}
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Store size={24} className="text-blue-600 dark:text-blue-400" />
            </div>

            {/* Brand info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                  {brand.name}
                </h1>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {brand.code}
                </span>
                <StatusBadge isActive={brand.is_active} />
              </div>

              {settings?.brand_name && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                  {settings.brand_name}
                </p>
              )}

              <p className="text-xs text-slate-400 dark:text-slate-500">
                Created{' '}
                {new Date(brand.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>

            {/* Refresh button */}
            <button
              onClick={loadData}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Provider List Section */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          {/* Section header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Providers ({providers.length})
            </h2>
            <button
              onClick={() => setShowEnableModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
              Enable Provider
            </button>
          </div>

          {/* Provider rows or empty state */}
          {providers.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-b-xl">
              <EmptyState
                icon={Plug}
                title="No providers enabled yet"
                description="Enable a provider to get started."
                action={{ label: 'Enable Provider', onClick: () => setShowEnableModal(true) }}
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {providers.map(provider => {
                const completion = calcCompletion(
                  provider.provider_code,
                  provider.credential_count,
                  provider.config_count,
                );
                return (
                  <li key={provider.id}>
                    <Link
                      href={`/brand-center/${code}/providers/${provider.provider_code}`}
                      className="flex items-center gap-3 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      {/* Health dot */}
                      <span
                        className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${healthDotClass(provider.health_status)}`}
                        title={provider.health_status}
                      />

                      {/* Logo avatar */}
                      <ProviderLogoAvatar
                        providerCode={provider.provider_code}
                        size="sm"
                      />

                      {/* Name + badges */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {provider.provider_display_name || provider.provider_name}
                          </span>
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            {provider.provider_code}
                          </span>
                          <ProviderStatusBadge status={provider.status} />
                        </div>

                        {/* Config counts + completion bar */}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Key size={11} />
                            {provider.credential_count}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Settings size={11} />
                            {provider.config_count}
                          </span>
                          <CompletionBar percent={completion} size="sm" />
                        </div>
                      </div>

                      {/* Chevron */}
                      <ChevronRight
                        size={16}
                        className="flex-shrink-0 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
