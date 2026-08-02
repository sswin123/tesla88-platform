'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Store,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

import { StatusBadge } from '@/components/brand-center/StatusBadge';
import { LoadingState } from '@/components/brand-center/LoadingState';
import { PermissionDenied } from '@/components/brand-center/PermissionDenied';

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

// ─── Toast ───────────────────────────────────────────────────────────────────

type ToastState = { message: string; type: 'success' | 'error' } | null;

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BrandDetailPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();

  const [brand, setBrand] = useState<Brand | null>(null);
  const [settings, setSettings] = useState<BrandSettings>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [refreshing, setRefreshing] = useState(false);

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
      const brandData = await brandRes.json() as { brand: Brand; settings: BrandSettings };
      setBrand(brandData.brand);
      setSettings(brandData.settings);
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

      </div>
    </>
  );
}
