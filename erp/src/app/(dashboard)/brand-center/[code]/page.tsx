'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Store,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Plus,
  X,
  ChevronRight as ArrowRight,
} from 'lucide-react';

import { ProviderLogoAvatar } from '@/components/brand-center/ProviderLogoAvatar';
import { ProviderStatusBadge } from '@/components/brand-center/ProviderStatusBadge';
import { HealthBadge } from '@/components/brand-center/HealthBadge';
import { StatusBadge } from '@/components/brand-center/StatusBadge';
import { LoadingState } from '@/components/brand-center/LoadingState';
import { PermissionDenied } from '@/components/brand-center/PermissionDenied';
import { EmptyState } from '@/components/brand-center/EmptyState';
import { WALLET_TYPES, ENVIRONMENTS } from '@/components/brand-center/constants';

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
  provider_display_name?: string;
  status: string;
  wallet_type: string;
  environment: string;
  currency: string;
  health_status: string;
  updated_at: string;
};

type RegistryProvider = {
  code: string;
  name: string;
  display_name: string;
  status: string;
  wallet_type: string;
};

type ToastState = { message: string; type: 'success' | 'error' } | null;

// ─── AddProviderModal ─────────────────────────────────────────────────────────

interface AddProviderModalProps {
  brandCode: string;
  existingCodes: string[];
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

function AddProviderModal({
  brandCode,
  existingCodes,
  onClose,
  onSuccess,
  showToast,
}: AddProviderModalProps) {
  const [registry, setRegistry] = useState<RegistryProvider[]>([]);
  const [loadingReg, setLoadingReg] = useState(true);
  const [providerCode, setProviderCode] = useState('');
  const [walletType, setWalletType] = useState('');
  const [environment, setEnvironment] = useState('PRODUCTION');
  const [currency, setCurrency] = useState('MYR');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/games/settings')
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown) => {
        const providers = (Array.isArray(data) ? data : []) as RegistryProvider[];
        setRegistry(providers.filter(p => !existingCodes.includes(p.code)));
      })
      .catch(() => setRegistry([]))
      .finally(() => setLoadingReg(false));
  }, [existingCodes]);

  function handleProviderChange(code: string) {
    setProviderCode(code);
    const found = registry.find(p => p.code === code);
    if (found) setWalletType(found.wallet_type);
  }

  async function handleAdd() {
    if (!providerCode) { setError('Please select a provider'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandCode}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_code: providerCode, wallet_type: walletType, environment, currency }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); return; }
      showToast(`${providerCode} added to ${brandCode}`, 'success');
      onSuccess();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Add Provider
          </h3>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
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
            <label className={labelCls}>Provider</label>
            {loadingReg ? (
              <div className="text-sm text-slate-400 py-2">Loading registry…</div>
            ) : registry.length === 0 ? (
              <div className="text-sm text-slate-400 py-2 italic">
                All available providers are already configured for this brand.
              </div>
            ) : (
              <select
                value={providerCode}
                onChange={e => handleProviderChange(e.target.value)}
                className={inputCls}
              >
                <option value="">— select provider —</option>
                {registry.map(p => (
                  <option key={p.code} value={p.code}>
                    {p.display_name || p.name} ({p.code})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className={labelCls}>Wallet Type</label>
            <select value={walletType} onChange={e => setWalletType(e.target.value)} className={inputCls}>
              <option value="">— inherit from registry —</option>
              {WALLET_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Environment</label>
              <select value={environment} onChange={e => setEnvironment(e.target.value)} className={inputCls}>
                {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <input
                type="text"
                value={currency}
                onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                maxLength={3}
                className={inputCls}
                placeholder="MYR"
              />
            </div>
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
            disabled={saving || !providerCode || registry.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <RefreshCw size={14} className="animate-spin" />}
            Add Provider
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ProviderCard ─────────────────────────────────────────────────────────────

function ProviderCard({ provider, brandCode }: { provider: BrandProvider; brandCode: string }) {
  return (
    <Link
      href={`/brand-center/${brandCode}/providers/${provider.provider_code}`}
      className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all group"
    >
      <ProviderLogoAvatar providerCode={provider.provider_code} size="md" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {provider.provider_display_name || provider.provider_name}
          </span>
          <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
            {provider.provider_code}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ProviderStatusBadge status={provider.status} />
          <HealthBadge status={provider.health_status} />
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {provider.wallet_type} · {provider.environment} · {provider.currency}
          </span>
        </div>
      </div>

      <ArrowRight
        size={16}
        className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 flex-shrink-0 transition-colors"
      />
    </Link>
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
  const [toast, setToast] = useState<ToastState>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const brandRes = await fetch(`/api/brands/${code}`);
      if (brandRes.status === 401) { setUnauthorized(true); return; }
      if (brandRes.status === 404) { setNotFound(true); return; }
      if (!brandRes.ok) throw new Error('Failed to load brand');
      const brandData = await brandRes.json() as {
        brand: Brand;
        settings: BrandSettings;
        providers: BrandProvider[];
      };
      setBrand(brandData.brand);
      setSettings(brandData.settings);
      setProviders(brandData.providers ?? []);
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
        <Link href="/brand-center" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
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
            (toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')
          }
        >
          {toast.type === 'error' && <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}

      {/* Add Provider Modal */}
      {showAddModal && (
        <AddProviderModal
          brandCode={code}
          existingCodes={providers.map(p => p.provider_code)}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); void loadData(); }}
          showToast={showToast}
        />
      )}

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
          <span className="text-slate-500 dark:text-slate-400 font-mono">{code}</span>
        </nav>

        {/* Brand Overview Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Store size={24} className="text-blue-600 dark:text-blue-400" />
            </div>

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

        {/* Gaming Providers Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Gaming Providers
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {providers.length} provider{providers.length !== 1 ? 's' : ''} configured for {code}
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Plus size={14} />
              Add Provider
            </button>
          </div>

          {providers.length === 0 ? (
            <EmptyState
              icon={Store}
              title="No providers configured"
              description="Add a gaming provider to enable game launches for this brand."
              action={{ label: '+ Add Provider', onClick: () => setShowAddModal(true) }}
            />
          ) : (
            <div className="space-y-2">
              {providers.map(p => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  brandCode={code}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
