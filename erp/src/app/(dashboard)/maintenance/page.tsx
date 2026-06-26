'use client';

import { useEffect, useState } from 'react';

type CheckResult = { ok: boolean; latency_ms: number; error?: string };

type HealthResponse = {
  status: 'ok' | 'degraded' | 'down';
  checks: {
    database: CheckResult;
    bot_relay: CheckResult;
  };
  timestamp: string;
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
    />
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

export default function MaintenancePage() {
  const [health, setHealth]           = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [maintenanceOn, setMaintenanceOn]   = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [toggleLoading, setToggleLoading]   = useState(false);

  const [backupLoading, setBackupLoading] = useState(false);

  // Load maintenance mode on mount
  useEffect(() => {
    loadMaintenanceMode();
  }, []);

  async function loadMaintenanceMode() {
    setSettingsLoading(true);
    try {
      const r = await fetch('/api/settings');
      if (!r.ok) return;
      const d = await r.json() as { settings: { key: string; value: string }[] };
      const val = d.settings.find((s) => s.key === 'maintenance_mode')?.value;
      setMaintenanceOn(val === 'true');
    } finally {
      setSettingsLoading(false);
    }
  }

  async function runHealthCheck() {
    setHealthLoading(true);
    try {
      const r = await fetch('/api/maintenance/health');
      const d = await r.json() as HealthResponse;
      setHealth(d);
    } catch {
      // network error — leave previous state
    } finally {
      setHealthLoading(false);
    }
  }

  async function toggleMaintenance() {
    setToggleLoading(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maintenance_mode: maintenanceOn ? 'false' : 'true' }),
      });
      if (r.ok) {
        await loadMaintenanceMode();
      } else {
        alert('Failed to update maintenance mode');
      }
    } finally {
      setToggleLoading(false);
    }
  }

  async function downloadBackup() {
    setBackupLoading(true);
    try {
      const r = await fetch('/api/maintenance/backup', { method: 'POST' });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'Unknown error' }));
        alert((err as { error: string }).error);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `postgres-backup-${new Date().toISOString().split('T')[0]}.sql`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBackupLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup &amp; Maintenance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor system health, manage maintenance mode, and download database backups.
        </p>
      </div>

      {/* ── System Health ───────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-800">System Health</h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          {healthLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <SpinnerIcon />
              Running health check…
            </div>
          ) : health ? (
            <>
              <div className="flex items-center gap-6">
                <span className="text-sm text-gray-500">
                  Overall status:&nbsp;
                  <span
                    className={`font-semibold ${
                      health.status === 'ok'
                        ? 'text-green-600'
                        : health.status === 'degraded'
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}
                  >
                    {health.status.toUpperCase()}
                  </span>
                </span>
                <span className="text-xs text-gray-400">
                  Checked at {new Date(health.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Database */}
                <div className="flex items-start gap-3 rounded-md border border-gray-100 bg-gray-50 px-4 py-3">
                  <StatusDot ok={health.checks.database.ok} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">Database</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {health.checks.database.ok
                        ? `Connected — ${health.checks.database.latency_ms} ms`
                        : `Unreachable — ${health.checks.database.latency_ms} ms`}
                    </p>
                    {health.checks.database.error && (
                      <p className="text-xs text-red-500 mt-1 break-all">
                        {health.checks.database.error}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bot Relay */}
                <div className="flex items-start gap-3 rounded-md border border-gray-100 bg-gray-50 px-4 py-3">
                  <StatusDot ok={health.checks.bot_relay.ok} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">Bot Relay</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {health.checks.bot_relay.ok
                        ? `Reachable — ${health.checks.bot_relay.latency_ms} ms`
                        : `Unreachable — ${health.checks.bot_relay.latency_ms} ms`}
                    </p>
                    {health.checks.bot_relay.error && (
                      <p className="text-xs text-red-500 mt-1 break-all">
                        {health.checks.bot_relay.error}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">No health check run yet. Click the button to check.</p>
          )}

          <div>
            <button
              onClick={runHealthCheck}
              disabled={healthLoading}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {healthLoading ? (
                <>
                  <SpinnerIcon />
                  Checking…
                </>
              ) : (
                'Run Health Check'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Maintenance Mode ────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-800">Maintenance Mode</h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          {settingsLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <SpinnerIcon />
              Loading…
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">Current status:</span>
                {maintenanceOn ? (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                    ON
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                    OFF
                  </span>
                )}
              </div>

              {maintenanceOn && (
                <div className="flex items-start gap-3 rounded-md bg-red-50 border border-red-300 p-4">
                  <svg className="h-5 w-5 flex-shrink-0 text-red-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-red-700">
                      Maintenance mode is active. New admin logins may be blocked.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <button
                  onClick={toggleMaintenance}
                  disabled={toggleLoading}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                    maintenanceOn
                      ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                      : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                  }`}
                >
                  {toggleLoading ? (
                    <>
                      <SpinnerIcon />
                      Updating…
                    </>
                  ) : maintenanceOn ? (
                    'Disable Maintenance Mode'
                  ) : (
                    'Enable Maintenance Mode'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Database Backup ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-800">Database Backup</h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            Download a full SQL dump of the PostgreSQL database. Requires{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs font-mono">pg_dump</code> to
            be available on the server. Only available to Super Admins.
          </p>

          <div>
            <button
              onClick={downloadBackup}
              disabled={backupLoading}
              className="inline-flex items-center gap-2 rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {backupLoading ? (
                <>
                  <SpinnerIcon />
                  Preparing backup…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Download Backup
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-gray-400">
            Manual backup triggered. The file will be named{' '}
            <code className="font-mono">
              postgres-backup-{new Date().toISOString().split('T')[0]}.sql
            </code>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
