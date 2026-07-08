'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

type Settings = Record<string, string>;
type EnvInfo  = { bot_token_masked: string; relay_url: string };

type SvcStatus = {
  ok: boolean;
  latency_ms?: number;
  version?: string;
  uptime_seconds?: number;
  error?: string;
  telegram?: { ok: boolean; username?: string | null; latency_ms?: number; error?: string };
};

type HealthData = {
  status: string;
  timestamp: string;
  checks: { database: SvcStatus; bot_relay: SvcStatus };
};

// ── Helpers ────────────────────────────────────────────────────────────────

function uptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Badge({ ok, sub }: { ok: boolean; sub?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {ok ? 'Online' : 'Offline'}{sub ? ` · ${sub}` : ''}
    </span>
  );
}

function SaveBtn({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
    >
      {busy ? (
        <>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Saving…
        </>
      ) : 'Save'}
    </button>
  );
}

// ── Notification keys ──────────────────────────────────────────────────────

const NOTIFY: Array<{ key: string; label: string }> = [
  { key: 'notify_deposit',      label: 'Deposit' },
  { key: 'notify_withdrawal',   label: 'Withdrawal' },
  { key: 'notify_promotion',    label: 'Promotion' },
  { key: 'notify_bonus',        label: 'Bonus' },
  { key: 'notify_announcement', label: 'Announcement' },
  { key: 'notify_broadcast',    label: 'Broadcast' },
  { key: 'notify_support',      label: 'Support' },
  { key: 'notify_maintenance',  label: 'Maintenance' },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function BotSettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [env, setEnv]           = useState<EnvInfo>({ bot_token_masked: '…', relay_url: '' });
  const [health, setHealth]     = useState<HealthData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flash = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadSettings = useCallback(async () => {
    const r = await fetch('/api/settings/bot');
    if (!r.ok) return;
    const d = await r.json() as { settings: Settings; env: EnvInfo };
    setSettings(d.settings);
    setEnv(d.env);
    setLoading(false);
  }, []);

  const loadHealth = useCallback(async () => {
    const r = await fetch('/api/maintenance/health');
    if (r.ok) setHealth(await r.json() as HealthData);
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadHealth();
    timerRef.current = setInterval(() => void loadHealth(), 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadSettings, loadHealth]);

  const set = (key: string, value: string) =>
    setSettings((p) => ({ ...p, [key]: value }));

  const toggle = (key: string) =>
    setSettings((p) => ({ ...p, [key]: p[key] === 'true' ? 'false' : 'true' }));

  const save = async (sectionId: string, keys: string[]) => {
    setSaving(sectionId);
    const updates: Settings = {};
    keys.forEach((k) => { updates[k] = settings[k] ?? ''; });
    try {
      const r = await fetch('/api/settings/bot', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(updates),
      });
      const d = await r.json() as { ok?: boolean; reloaded?: boolean; telegram_synced?: boolean; telegram_error?: string };
      if (r.ok) {
        let msg = d.reloaded ? 'Saved and settings reloaded.' : 'Saved. (Relay reload timed out — settings will apply within 60 seconds.)';
        if (d.telegram_synced) msg += ' Telegram profile updated.';
        if (d.telegram_error) msg += ` Telegram sync failed: ${d.telegram_error}`;
        flash(msg, !d.telegram_error);
        await loadSettings();
      } else {
        flash('Save failed.', false);
      }
    } catch {
      flash('Network error.', false);
    } finally {
      setSaving(null);
    }
  };

  const syncFromTelegram = async () => {
    setSyncing(true);
    try {
      const r = await fetch('/api/settings/bot/sync', { method: 'POST' });
      const d = await r.json() as { ok?: boolean; bot_username?: string; bot_name?: string; error?: string };
      if (r.ok) {
        flash(`Synced from Telegram: @${d.bot_username ?? ''} (${d.bot_name ?? ''})`, true);
        await loadSettings();
      } else {
        flash(d.error ?? 'Sync failed.', false);
      }
    } catch {
      flash('Cannot reach Telegram API.', false);
    } finally {
      setSyncing(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      flash('Only JPG and PNG images are allowed.', false);
      return;
    }
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch('/api/settings/bot/avatar', { method: 'POST', body: form });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (r.ok) {
        flash('Avatar saved to media library.', true);
        await loadSettings();
      } else {
        flash(d.error ?? 'Avatar upload failed.', false);
      }
    } catch {
      flash('Network error during avatar upload.', false);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const reload = async () => {
    setSaving('reload');
    try {
      const r = await fetch('/api/settings/bot/reload', { method: 'POST' });
      const d = await r.json() as { ok?: boolean };
      flash(d.ok ? 'Settings reloaded.' : 'Reload failed.', d.ok ?? false);
    } catch {
      flash('Cannot reach relay.', false);
    } finally {
      setSaving(null);
    }
  };

  const restart = async () => {
    if (!confirm('Restart the bot relay? It will be unavailable for ~5 seconds.')) return;
    setRestarting(true);
    try {
      await fetch('/api/settings/bot/restart', { method: 'POST' });
    } catch {
      // connection reset is expected
    }
    flash('Relay is restarting…', true);
    setTimeout(() => { void loadHealth(); setRestarting(false); }, 6000);
  };

  if (loading) return <div className="p-8 text-gray-400 animate-pulse">Loading…</div>;

  const relay    = health?.checks.bot_relay;
  const db       = health?.checks.database;
  const telegram = relay?.telegram;

  const avatarMediaId = settings['bot_avatar_media_id'];
  const lastSynced    = settings['last_synced_at'];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Telegram Bot</h1>
          <p className="mt-1 text-sm text-gray-500">Bot configuration, relay settings, and notification preferences.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void syncFromTelegram()}
            disabled={syncing}
            className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 shadow-sm hover:bg-blue-100 disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync From Telegram'}
          </button>
          <button
            onClick={() => void reload()}
            disabled={saving === 'reload'}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {saving === 'reload' ? 'Reloading…' : 'Reload Config'}
          </button>
          <button
            onClick={() => void restart()}
            disabled={restarting}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-50"
          >
            {restarting ? 'Restarting…' : 'Restart Relay'}
          </button>
        </div>
      </div>

      {/* Health Dashboard */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">System Health</h2>
          <span className="text-xs text-gray-400">
            {health ? `Updated ${new Date(health.timestamp).toLocaleTimeString()}` : 'Loading…'}
          </span>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Telegram */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Telegram</p>
            {telegram ? (
              <>
                <Badge ok={telegram.ok} sub={telegram.latency_ms ? `${telegram.latency_ms}ms` : undefined} />
                {telegram.username && <p className="text-xs text-gray-500">{telegram.username}</p>}
                {telegram.error && <p className="text-xs text-red-500 truncate">{telegram.error}</p>}
              </>
            ) : (
              <span className="text-xs text-gray-400">{relay?.ok ? 'Checking…' : 'Unavailable'}</span>
            )}
          </div>
          {/* Relay */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Relay</p>
            {relay ? (
              <>
                <Badge ok={relay.ok} sub={relay.latency_ms ? `${relay.latency_ms}ms` : undefined} />
                {relay.ok && relay.uptime_seconds != null && (
                  <p className="text-xs text-gray-500">Up {uptime(relay.uptime_seconds)}</p>
                )}
                {relay.version && <p className="text-xs text-gray-400">v{relay.version}</p>}
                {relay.error && <p className="text-xs text-red-500 truncate">{relay.error}</p>}
              </>
            ) : (
              <span className="text-xs text-gray-400">Checking…</span>
            )}
          </div>
          {/* Database */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Database</p>
            {db ? (
              <>
                <Badge ok={db.ok} sub={db.latency_ms ? `${db.latency_ms}ms` : undefined} />
                {db.error && <p className="text-xs text-red-500 truncate">{db.error}</p>}
              </>
            ) : (
              <span className="text-xs text-gray-400">Checking…</span>
            )}
          </div>
          {/* ERP */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">ERP</p>
            <Badge ok={true} />
            <p className="text-xs text-gray-400">This instance</p>
          </div>
        </div>
      </div>

      {/* Bot Identity */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Bot Identity</h2>
          {lastSynced && (
            <span className="text-xs text-gray-400">
              Last synced {new Date(lastSynced).toLocaleString()}
            </span>
          )}
        </div>
        <div className="px-6 py-4 space-y-4">
          {/* Token — always read-only */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bot Token</label>
            <input
              readOnly
              value={env.bot_token_masked}
              className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-400">Change in .env and redeploy to update the bot token.</p>
          </div>

          {/* Username — read-only */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              readOnly
              value={settings['bot_username'] ? `@${settings['bot_username']}` : ''}
              placeholder="@your_bot"
              className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-400">Username can only be changed in BotFather.</p>
          </div>

          {/* Bot ID — read-only */}
          {settings['bot_id'] && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bot ID</label>
              <input
                readOnly
                value={settings['bot_id']}
                className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
              />
            </div>
          )}

          {/* Editable identity fields */}
          {([
            ['bot_name',              'Display Name',        'Support Bot'],
            ['bot_description',       'Description',         'Customer support bot'],
            ['bot_short_description', 'Short About',         'Get help & support'],
            ['bot_language',          'Language Code',       'en'],
            ['support_chat_id',       'Support Group ID',    '0 (0 = disabled)'],
          ] as const).map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type="text"
                value={settings[key] ?? ''}
                placeholder={placeholder}
                onChange={(e) => set(key, e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <SaveBtn
            busy={saving === 'identity'}
            onClick={() => void save('identity', ['bot_name', 'bot_description', 'bot_short_description', 'bot_language', 'support_chat_id'])}
          />
        </div>
      </div>

      {/* Bot Avatar */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-800">Bot Avatar</h2>
        </div>
        <div className="px-6 py-4 space-y-4">
          {avatarMediaId && (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/${avatarMediaId}/thumbnail`}
                alt="Bot avatar"
                className="h-16 w-16 rounded-full object-cover border border-gray-200"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span className="text-sm text-gray-500">Current avatar (media #{avatarMediaId})</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload New Avatar</label>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png"
              disabled={avatarUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAvatar(file);
              }}
              className="block text-sm text-gray-600 file:mr-4 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50 disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-gray-400">
              JPG or PNG only. Stored in Media Library.
              To update the actual Telegram profile photo, use BotFather.
            </p>
          </div>
        </div>
      </div>

      {/* Relay Configuration */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-800">Relay Configuration</h2>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Relay URL (from environment)</label>
            <input
              readOnly
              value={env.relay_url}
              className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Relay URL Override</label>
            <input
              readOnly
              value={settings['bot_relay_url'] ?? ''}
              className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-400">ERP routes always use <code>BOT_RELAY_URL</code> from environment. This field is stored for future use.</p>
          </div>
          {([
            ['relay_timeout_secs',     'Timeout (seconds)',     '30'],
            ['relay_retry_count',      'Retry Count',           '3'],
            ['relay_retry_delay_secs', 'Retry Delay (seconds)', '1'],
          ] as const).map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label} <span className="text-gray-400 font-normal">(future use)</span></label>
              <input
                type="number"
                min={0}
                value={settings[key] ?? ''}
                placeholder={placeholder}
                onChange={(e) => set(key, e.target.value)}
                className="block w-32 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <SaveBtn
            busy={saving === 'relay'}
            onClick={() => void save('relay', ['bot_relay_url', 'relay_timeout_secs', 'relay_retry_count', 'relay_retry_delay_secs'])}
          />
        </div>
      </div>

      {/* Notification Switches */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-800">Notification Switches</h2>
          <p className="mt-0.5 text-xs text-gray-500">Control which events trigger Telegram messages to customers.</p>
        </div>
        <div className="px-6 py-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NOTIFY.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 cursor-pointer hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={settings[key] === 'true'}
                onClick={() => toggle(key)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${settings[key] === 'true' ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${settings[key] === 'true' ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </button>
            </label>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <SaveBtn
            busy={saving === 'notifications'}
            onClick={() => void save('notifications', NOTIFY.map((n) => n.key))}
          />
        </div>
      </div>
    </div>
  );
}
