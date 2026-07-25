'use client';

import { useState, useEffect, useCallback } from 'react';
import WorkspaceSection from './WorkspaceSection';
import TimelineItem from './TimelineItem';
import type { TimelineEvent } from './types';

const PAGE_SIZE = 20;

export interface TimelinePanelProps {
  type: string;
  id: number;
  // Realtime interface — reserved for Phase D SSE/WebSocket wiring
  onRefresh?: () => void;
  onSubscribe?: (cb: () => void) => () => void;
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[0, 1, 2].map(i => (
        <div key={i} className="flex gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-200 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="h-3 bg-gray-100 rounded w-48" />
            <div className="h-3 bg-gray-100 rounded w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center py-8 text-sm text-gray-400">
      No timeline events yet
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-2">
      <p className="text-sm text-gray-400">Failed to load timeline</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-blue-600 hover:underline"
      >
        Retry
      </button>
    </div>
  );
}

function FilterPlaceholder() {
  return (
    <div className="flex items-center gap-2 pb-3 mb-1 border-b border-gray-100">
      {(['All', 'Status', 'Notes'] as const).map(label => (
        <button
          key={label}
          type="button"
          disabled
          className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-300 cursor-not-allowed select-none"
        >
          {label}
        </button>
      ))}
      <span className="text-xs text-gray-300 italic ml-auto">Phase C</span>
    </div>
  );
}

export default function TimelinePanel({
  type,
  id,
  onRefresh,
  onSubscribe,
}: TimelinePanelProps) {
  const [items,       setItems]       = useState<TimelineEvent[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState(false);
  const [noPermission, setNoPermission] = useState(false);

  const fetchPage = useCallback(async (p: number, append: boolean) => {
    try {
      const res = await fetch(
        `/api/transactions/${type}/${id}/timeline?page=${p}&pageSize=${PAGE_SIZE}`
      );
      if (res.status === 401 || res.status === 403) {
        setNoPermission(true);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json() as { items: TimelineEvent[]; total: number };
      setItems(prev => append ? [...prev, ...data.items] : data.items);
      setTotal(data.total);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [type, id]);

  useEffect(() => {
    setLoading(true);
    setItems([]);
    setPage(1);
    setError(false);
    setNoPermission(false);
    void fetchPage(1, false);
  }, [fetchPage]);

  // Realtime subscription — Phase D wiring point
  useEffect(() => {
    if (!onSubscribe) return;
    const unsub = onSubscribe(() => {
      setPage(1);
      void fetchPage(1, false);
    });
    return unsub;
  }, [onSubscribe, fetchPage]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setItems([]);
    setPage(1);
    setError(false);
    void fetchPage(1, false);
    onRefresh?.();
  }, [fetchPage, onRefresh]);

  const handleLoadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    void fetchPage(next, true);
  }, [page, fetchPage]);

  // No permission → entire section hidden (no 403 / no "Permission Denied")
  if (noPermission) return null;

  const hasMore = items.length < total;

  const headerActions = (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={loading}
      className="text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40 leading-none"
      title="Refresh timeline"
    >
      ↻
    </button>
  );

  return (
    <WorkspaceSection
      title="Timeline"
      defaultOpen
      badge={total > 0 ? String(total) : undefined}
      headerActions={headerActions}
    >
      <FilterPlaceholder />

      {loading && <TimelineSkeleton />}

      {!loading && error && <ErrorState onRetry={handleRefresh} />}

      {!loading && !error && items.length === 0 && <EmptyState />}

      {!loading && !error && items.length > 0 && (
        <div>
          {items.map((item, idx) => (
            <TimelineItem
              key={item.id}
              item={item}
              isLast={idx === items.length - 1 && !hasMore}
            />
          ))}

          {hasMore && (
            <div className="pt-3 flex justify-center border-t border-gray-100 mt-2">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 transition-colors"
              >
                {loadingMore
                  ? 'Loading…'
                  : `Load more (${total - items.length} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}
    </WorkspaceSection>
  );
}
