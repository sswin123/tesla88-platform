'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Plus, ChevronRight, Store, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { StatusBadge } from '@/components/brand-center/StatusBadge';
import { ProviderLogoAvatar } from '@/components/brand-center/ProviderLogoAvatar';
import { EmptyState } from '@/components/brand-center/EmptyState';
import { LoadingState } from '@/components/brand-center/LoadingState';
import { PermissionDenied } from '@/components/brand-center/PermissionDenied';

// ── Types ─────────────────────────────────────────────────────────────────────

type BrandRow = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  provider_count?: number;
  brand_name?: string | null;
};

type ToastState = { message: string; ok: boolean } | null;

type StatusFilter = 'all' | 'active' | 'inactive';

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium
        ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}
    >
      {toast.ok
        ? <CheckCircle className="w-4 h-4 shrink-0" />
        : <XCircle className="w-4 h-4 shrink-0" />}
      {toast.message}
    </div>
  );
}

// ── NewBrandModal ─────────────────────────────────────────────────────────────

interface NewBrandModalProps {
  onClose: () => void;
  onCreated: () => void;
  setToast: (t: ToastState) => void;
}

function NewBrandModal({ onClose, onCreated, setToast }: NewBrandModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);
    setSaving(true);
    try {
      const resp = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), name: name.trim() }),
      });
      const data = await resp.json() as { error?: string };
      if (resp.status === 201) {
        setToast({ message: 'Brand created successfully', ok: true });
        onCreated();
        onClose();
      } else if (resp.status === 409) {
        setModalError(data.error ?? 'Brand code already exists');
      } else {
        setToast({ message: data.error ?? 'Failed to create brand', ok: false });
        onClose();
      }
    } catch {
      setToast({ message: 'Network error', ok: false });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm mx-4 p-6">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">New Brand</h3>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Brand Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={10}
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setModalError(null); }}
              placeholder="e.g. MYBRAND"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Brand"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {modalError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-2">{modalError}</p>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Create Brand
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── BrandCard ─────────────────────────────────────────────────────────────────

function BrandCard({ brand }: { brand: BrandRow }) {
  return (
    <Link
      href={`/brand-center/${brand.code}`}
      className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all group"
    >
      <ProviderLogoAvatar providerCode={brand.code} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
            {brand.name}
          </span>
          <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded shrink-0">
            {brand.code}
          </span>
          <StatusBadge isActive={brand.is_active} />
        </div>
        {brand.brand_name && (
          <p className="text-[12px] text-slate-400 dark:text-slate-500 truncate">{brand.brand_name}</p>
        )}
        <p className="text-[12px] text-slate-400 dark:text-slate-500">
          📦 {brand.provider_count ?? 0} Providers
        </p>
      </div>
      <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 shrink-0 ml-auto" />
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BrandCenterPage() {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const loadBrands = useCallback(() => {
    setLoading(true);
    fetch('/api/brands')
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          setPermissionDenied(true);
          return null;
        }
        if (!r.ok) {
          setToast({ message: `Failed to load brands (HTTP ${r.status})`, ok: false });
          setBrands([]);
          setLoading(false);
          return null;
        }
        return r.json() as Promise<BrandRow[]>;
      })
      .then((data) => {
        if (data) setBrands(data);
      })
      .catch(() => {
        setToast({ message: 'Failed to load brands', ok: false });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  // Filtered brands computed inline
  const filtered = brands.filter((b) => {
    if (filter === 'active' && !b.is_active) return false;
    if (filter === 'inactive' && b.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        (b.brand_name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (permissionDenied) {
    return <PermissionDenied />;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Brand Center</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage brands and their provider configurations
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          New Brand
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, code, or brand name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingState message="Loading brands…" />
      ) : brands.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No Brands Yet"
          description="Create your first brand to start managing provider configurations."
          action={{ label: 'New Brand', onClick: () => setShowNewModal(true) }}
        />
      ) : filtered.length === 0 ? (
        search ? (
          <EmptyState
            icon={Search}
            title="No brands match your search"
            description={`No brands match "${search}"`}
            action={{ label: 'Clear search', onClick: () => setSearch('') }}
          />
        ) : (
          <EmptyState
            icon={Search}
            title={`No ${filter} brands found`}
            description={`There are no ${filter} brands to display.`}
            action={{ label: 'Clear filters', onClick: () => setFilter('all') }}
          />
        )
      ) : (
        <div className="grid gap-3">
          {filtered.map((brand) => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>
      )}

      {/* New Brand Modal */}
      {showNewModal && (
        <NewBrandModal
          onClose={() => setShowNewModal(false)}
          onCreated={loadBrands}
          setToast={setToast}
        />
      )}

      {/* Toast */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
