'use client';

import { useEffect, useState, useCallback } from 'react';

interface ServiceStatus {
  ok: boolean;
  latency_ms: number;
  error?: string;
}

interface HealthResponse {
  database: ServiceStatus;
  services: {
    erp:     ServiceStatus;
    website: ServiceStatus;
    bot:     ServiceStatus;
  };
  version:   string;
  timestamp: string;
}

function StatusBadge({ ok }: { ok: boolean }) {
  return ok
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />在线</span>
    : <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />离线</span>;
}

function ServiceCard({
  name,
  status,
  loading,
}: {
  name: string;
  status: ServiceStatus | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{name}</span>
        {loading ? (
          <span className="text-xs text-gray-400">检查中…</span>
        ) : status ? (
          <StatusBadge ok={status.ok} />
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>
      {!loading && status && (
        <div className="mt-2 space-y-0.5">
          <p className="text-xs text-gray-500">
            响应时间: <span className="font-mono font-medium text-gray-700">{status.latency_ms} ms</span>
          </p>
          {status.error && (
            <p className="text-xs text-red-500 break-all">{status.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SystemHealthPage() {
  const [health, setHealth]   = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/health/system');
      if (r.ok) {
        const d = await r.json() as HealthResponse;
        setHealth(d);
        setLastChecked(new Date());
      }
    } catch {
      /* network error */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runCheck();
    const interval = setInterval(() => void runCheck(), 30_000);
    return () => clearInterval(interval);
  }, [runCheck]);

  const services: { name: string; status: ServiceStatus | null }[] = health
    ? [
        { name: '数据库',      status: health.database },
        { name: 'ERP',         status: health.services.erp },
        { name: '官网',        status: health.services.website },
        { name: 'Telegram Bot',status: health.services.bot },
      ]
    : [
        { name: '数据库',       status: null },
        { name: 'ERP',          status: null },
        { name: '官网',         status: null },
        { name: 'Telegram Bot', status: null },
      ];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">系统健康监控</h1>
          {health && (
            <p className="mt-0.5 text-xs text-gray-400">
              版本 {health.version}
            </p>
          )}
        </div>
        <button
          onClick={() => void runCheck()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? '检查中…' : '立即刷新'}
        </button>
      </div>

      {lastChecked && (
        <p className="text-xs text-gray-400">
          上次检查: {lastChecked.toLocaleString('zh-CN')}　每30秒自动刷新
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {services.map(({ name, status }) => (
          <ServiceCard key={name} name={name} status={status} loading={loading && !health} />
        ))}
      </div>

      {health && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">
            检查时间: {new Date(health.timestamp).toLocaleString('zh-CN')}
          </p>
        </div>
      )}
    </div>
  );
}
