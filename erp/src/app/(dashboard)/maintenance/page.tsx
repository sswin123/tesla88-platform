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

type MigrationRow = { filename: string; applied_at: string };

type DbHealth = {
  users_pending_withdrawal:   boolean;
  users_available_balance:    boolean;
  trg_withdrawal_pending:     boolean;
  table_member_activity_logs: boolean;
  table_wallet_transactions:  boolean;
  wt_reference_columns:       boolean;
};

type MigrationStatus = {
  applied: MigrationRow[];
  applied_count: number;
  health: DbHealth;
};

type MigrateResult = { migration: string; status: 'ok' | 'error'; detail?: string };

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${ok ? 'bg-green-500' : 'bg-red-500'}`}
    />
  );
}

function CheckIcon({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <svg className="h-4 w-4 text-green-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
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

// Target: highest known migration number
const MAX_MIGRATION = 64;

export default function MaintenancePage() {
  const [health, setHealth]               = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [maintenanceOn, setMaintenanceOn]       = useState(false);
  const [settingsLoading, setSettingsLoading]   = useState(true);
  const [toggleLoading, setToggleLoading]       = useState(false);

  const [backupLoading, setBackupLoading] = useState(false);

  // Migration section state
  const [migStatus, setMigStatus]           = useState<MigrationStatus | null>(null);
  const [migStatusLoading, setMigStatusLoading] = useState(false);
  const [migRunning, setMigRunning]         = useState(false);
  const [migResults, setMigResults]         = useState<MigrateResult[] | null>(null);
  const [migError, setMigError]             = useState<string | null>(null);

  useEffect(() => {
    loadMaintenanceMode();
    loadMigrationStatus();
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

  async function loadMigrationStatus() {
    setMigStatusLoading(true);
    try {
      const r = await fetch('/api/settings/migrate');
      if (r.ok) setMigStatus(await r.json() as MigrationStatus);
    } finally {
      setMigStatusLoading(false);
    }
  }

  async function runHealthCheck() {
    setHealthLoading(true);
    try {
      const r = await fetch('/api/maintenance/health');
      const d = await r.json() as HealthResponse;
      setHealth(d);
    } catch { /* leave previous */ } finally {
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
      if (r.ok) await loadMaintenanceMode();
      else alert('Failed to update maintenance mode');
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

  async function runMigration() {
    setMigRunning(true);
    setMigResults(null);
    setMigError(null);
    try {
      const r = await fetch('/api/settings/migrate', { method: 'POST' });
      const d = await r.json() as { ok: boolean; results: MigrateResult[]; error?: string };
      if (!r.ok || d.error) {
        setMigError(d.error ?? 'Migration failed');
      } else {
        setMigResults(d.results);
        await loadMigrationStatus(); // refresh status after run
      }
    } catch (e) {
      setMigError(String(e));
    } finally {
      setMigRunning(false);
    }
  }

  // Build the migration grid: array of 001..063, each with applied status
  const appliedSet = new Set((migStatus?.applied ?? []).map(r => r.filename));
  const migrationRows = Array.from({ length: MAX_MIGRATION }, (_, i) => {
    const num = String(i + 1).padStart(3, '0');
    const match = (migStatus?.applied ?? []).find(r => r.filename.startsWith(`${num}_`));
    return { num, filename: match?.filename ?? null, applied_at: match?.applied_at ?? null, applied: !!match };
  });
  const appliedCount = migrationRows.filter(r => r.applied).length;

  const dbHealthItems: { key: keyof DbHealth; label: string }[] = [
    { key: 'users_pending_withdrawal',   label: 'users.pending_withdrawal 列' },
    { key: 'users_available_balance',    label: 'users.available_balance 列 (GENERATED)' },
    { key: 'trg_withdrawal_pending',     label: 'trg_withdrawal_pending 触发器' },
    { key: 'table_member_activity_logs', label: 'member_activity_logs 表' },
    { key: 'table_wallet_transactions',  label: 'wallet_transactions 表' },
    { key: 'wt_reference_columns',       label: 'wallet_transactions.reference_type/id 列' },
  ];
  const healthAllGreen = migStatus ? dbHealthItems.every(i => migStatus.health[i.key]) : false;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup &amp; Maintenance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor system health, run database migrations, manage maintenance mode, and download backups.
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
                      <p className="text-xs text-red-500 mt-1 break-all">{health.checks.database.error}</p>
                    )}
                  </div>
                </div>

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
                      <p className="text-xs text-red-500 mt-1 break-all">{health.checks.bot_relay.error}</p>
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
              {healthLoading ? <><SpinnerIcon />Checking…</> : 'Run Health Check'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Database Migration ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Database Migration</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Apply all pending schema migrations. Each step is idempotent — safe to re-run.
            </p>
          </div>
          {migStatus && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              appliedCount === MAX_MIGRATION
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              {appliedCount} / {MAX_MIGRATION} applied
            </span>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Run button */}
          <div className="flex items-center gap-4">
            <button
              onClick={runMigration}
              disabled={migRunning}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {migRunning ? <><SpinnerIcon />Running…</> : 'Run Database Migration'}
            </button>
            {!migRunning && (
              <button
                onClick={loadMigrationStatus}
                disabled={migStatusLoading}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                <svg className={`h-3.5 w-3.5 ${migStatusLoading ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Refresh
              </button>
            )}
          </div>

          {/* Run results */}
          {migError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              <strong>Migration failed:</strong> {migError}
            </div>
          )}
          {migResults && (
            <div className="rounded-md bg-gray-50 border border-gray-200 divide-y divide-gray-100 text-sm">
              {migResults.map((r) => (
                <div key={r.migration} className="flex items-center gap-3 px-4 py-2">
                  <CheckIcon ok={r.status === 'ok'} />
                  <span className="font-mono text-xs text-gray-700 flex-1">{r.migration}</span>
                  {r.status === 'error' && (
                    <span className="text-xs text-red-500 truncate max-w-xs">{r.detail}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Migration status grid */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Migration Status
            </p>
            {migStatusLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <SpinnerIcon />
                Loading…
              </div>
            ) : (
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {migrationRows.map((row) => (
                    <div
                      key={row.num}
                      className={`flex items-center gap-3 px-4 py-1.5 ${
                        row.applied ? 'bg-white' : 'bg-red-50'
                      }`}
                    >
                      <CheckIcon ok={row.applied} />
                      <span className="font-mono text-xs text-gray-600 w-8">{row.num}</span>
                      <span className="text-xs text-gray-500 flex-1 truncate">
                        {row.filename
                          ? row.filename.replace(/^\d{3}_/, '').replace(/\.sql$/, '')
                          : <span className="text-gray-300 italic">not applied</span>
                        }
                      </span>
                      {row.applied_at && (
                        <span className="text-xs text-gray-300 hidden sm:block">
                          {new Date(row.applied_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Database Health */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Database Health
              </p>
              {migStatus && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  healthAllGreen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {healthAllGreen ? 'All checks passed' : 'Issues detected'}
                </span>
              )}
            </div>
            {migStatusLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <SpinnerIcon />
                Loading…
              </div>
            ) : migStatus ? (
              <div className="border border-gray-200 rounded-md divide-y divide-gray-100 overflow-hidden">
                {dbHealthItems.map((item) => (
                  <div key={item.key} className={`flex items-center gap-3 px-4 py-2 ${
                    migStatus.health[item.key] ? 'bg-white' : 'bg-red-50'
                  }`}>
                    <CheckIcon ok={migStatus.health[item.key]} />
                    <span className="text-sm text-gray-700">{item.label}</span>
                    <span className={`ml-auto text-xs font-medium ${
                      migStatus.health[item.key] ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {migStatus.health[item.key] ? 'OK' : 'MISSING'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Click Refresh to check database health.</p>
            )}
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
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">ON</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">OFF</span>
                )}
              </div>

              {maintenanceOn && (
                <div className="flex items-start gap-3 rounded-md bg-red-50 border border-red-300 p-4">
                  <svg className="h-5 w-5 flex-shrink-0 text-red-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm font-semibold text-red-700">
                    Maintenance mode is active. New admin logins may be blocked.
                  </p>
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
                  {toggleLoading ? <><SpinnerIcon />Updating…</> : maintenanceOn ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
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
                <><SpinnerIcon />Preparing backup…</>
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
