'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Save, Eye, EyeOff, CheckCircle, AlertCircle, XCircle, Loader2,
  ChevronDown, ChevronUp, ShieldCheck, Activity,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface GpProvider {
  id: number;
  code: string;
  name: string;
  display_name: string;
  version: string;
  status: 'ACTIVE' | 'DISABLED' | 'MAINTENANCE';
  environment: string;
  wallet_type: string;
  health_status: string;
  updated_at: string;
}

interface ConfigRow {
  key: string;
  value: string;
  updated_at: string;
}

interface CredentialRow {
  key: string;
  masked_value: string;
  is_encrypted: boolean;
  updated_at: string;
}

interface ProviderDetail {
  provider: GpProvider;
  config: ConfigRow[];
  credentials: CredentialRow[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIG_FIELD_LABELS: Record<string, string> = {
  api_base_url:        'API Provider URL',
  datafeed_url:        'DataFeed URL',
  h5_api_domain:       'H5 API URL',
  h5_lobby_domain:     'H5 Lobby URL',
  h5_game_domain:      'H5 Game URL',
  game_icon_url:       'Game Icon URL',
  postfix_id:          'PostFix ID',
  currency:            'Currency',
  currency_ratio:      'Currency Ratio',
  timeout_ms:          'Request Timeout (ms)',
  circuit_threshold:   'Circuit Breaker Threshold',
  circuit_cooldown_ms: 'Circuit Breaker Cooldown (ms)',
  debug:               'Debug Mode',
  default_lobby_url:   'Default Lobby Return URL',
};

const CRED_FIELD_LABELS: Record<string, string> = {
  api_token:      'Access Token',
  operator_token: 'Operator Token',
  secret_key:     'SecretKey',
  md5_key:        'Md5EncryptKey',
  encrypt_key:    'EncryptKey',
  delimiter:      'Delimiter',
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  DISABLED:    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  MAINTENANCE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

const HEALTH_STYLES: Record<string, string> = {
  OK:      'text-emerald-500',
  UNKNOWN: 'text-slate-400',
  ERROR:   'text-rose-500',
  DEGRADED:'text-amber-500',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusIcon(s: string) {
  if (s === 'ACTIVE')      return <CheckCircle className="w-4 h-4 text-emerald-500" />;
  if (s === 'MAINTENANCE') return <AlertCircle className="w-4 h-4 text-amber-500" />;
  return <XCircle className="w-4 h-4 text-slate-400" />;
}

function healthIcon(h: string) {
  const cls = HEALTH_STYLES[h] ?? 'text-slate-400';
  return <Activity className={`w-4 h-4 ${cls}`} />;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
      ${ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
      {ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

function InlineEdit({
  label, value: initialValue, onSave, placeholder,
}: {
  label: string; value: string; onSave: (v: string) => Promise<void>; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(initialValue);
  const [saving, setSaving]   = useState(false);

  useEffect(() => { setVal(initialValue); }, [initialValue]);

  async function handleSave() {
    setSaving(true);
    try { await onSave(val); setEditing(false); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">{label}</div>
        {editing ? (
          <input
            autoFocus
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder={placeholder}
            className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div className="text-sm font-mono text-slate-800 dark:text-slate-200 truncate">
            {val || <span className="text-slate-400 italic">— empty —</span>}
          </div>
        )}
      </div>
      {editing ? (
        <div className="flex gap-1 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          </button>
          <button
            onClick={() => { setEditing(false); setVal(initialValue); }}
            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="mt-5 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
        >
          Edit
        </button>
      )}
    </div>
  );
}

function CredentialInlineEdit({
  label, maskedValue, onSave,
}: {
  label: string; maskedValue: string; onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing]  = useState(false);
  const [val, setVal]          = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving]    = useState(false);

  async function handleSave() {
    if (!val.trim()) return;
    setSaving(true);
    try { await onSave(val.trim()); setEditing(false); setVal(''); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
          <ShieldCheck className="w-3 h-3" />
          {label}
        </div>
        {editing ? (
          <div className="relative">
            <input
              autoFocus
              type={revealed ? 'text' : 'password'}
              value={val}
              onChange={e => setVal(e.target.value)}
              placeholder="Enter new value…"
              className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <button
              type="button"
              onClick={() => setRevealed(r => !r)}
              className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600"
            >
              {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        ) : (
          <div className="text-sm font-mono text-slate-500 dark:text-slate-400 tracking-wider">
            {maskedValue}
          </div>
        )}
      </div>
      {editing ? (
        <div className="flex gap-1 mt-5">
          <button
            onClick={handleSave}
            disabled={saving || !val.trim()}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          </button>
          <button
            onClick={() => { setEditing(false); setVal(''); }}
            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="mt-5 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
        >
          Update
        </button>
      )}
    </div>
  );
}

// ── Provider Card ─────────────────────────────────────────────────────────────

function ProviderCard({ code, onToast }: { code: string; onToast: (m: string, ok: boolean) => void }) {
  const [detail, setDetail]    = useState<ProviderDetail | null>(null);
  const [loading, setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/games/settings/${code}`);
      if (!r.ok) throw new Error(await r.text());
      setDetail(await r.json());
    } catch (e) {
      onToast(`加载失败: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setLoading(false);
    }
  }, [code, onToast]);

  useEffect(() => { void load(); }, [load]);

  async function patchConfig(key: string, value: string) {
    const r = await fetch(`/api/games/settings/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'config', key, value }),
    });
    if (!r.ok) throw new Error(await r.text());
    onToast(`已保存: ${key}`, true);
    await load();
  }

  async function patchCredential(key: string, value: string) {
    const r = await fetch(`/api/games/settings/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'credential', key, value }),
    });
    if (!r.ok) throw new Error(await r.text());
    onToast(`密钥已更新: ${key}`, true);
    await load();
  }

  async function patchStatus(s: 'ACTIVE' | 'DISABLED' | 'MAINTENANCE') {
    setStatusUpdating(true);
    try {
      const r = await fetch(`/api/games/settings/${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_status: s }),
      });
      if (!r.ok) throw new Error(await r.text());
      onToast(`状态已更新: ${s}`, true);
      await load();
    } catch (e) {
      onToast(`状态更新失败: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleReload() {
    setReloading(true);
    try {
      const r = await fetch(`/api/games/settings/${code}/reload`, { method: 'POST' });
      const data = await r.json() as { ok?: boolean; message?: string; error?: string };
      if (!r.ok || !data.ok) throw new Error(data.error ?? 'Reload failed');
      onToast('适配器已重置，下次游戏请求将重新加载配置', true);
    } catch (e) {
      onToast(`重置失败: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setReloading(false);
    }
  }

  if (loading) {
    return (
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-6 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        <span className="text-slate-500">加载中…</span>
      </div>
    );
  }
  if (!detail) return null;

  const { provider, config, credentials } = detail;
  const cfgMap = Object.fromEntries(config.map(r => [r.key, r.value]));
  const credMap = Object.fromEntries(credentials.map(r => [r.key, r.masked_value]));

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          {statusIcon(provider.status)}
          <div>
            <div className="font-semibold text-slate-800 dark:text-slate-100">
              {provider.display_name || provider.name}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {provider.code} · v{provider.version} · {provider.environment} · {provider.wallet_type}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[provider.status] ?? ''}`}>
            {provider.status}
          </span>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            {healthIcon(provider.health_status)}
            {provider.health_status}
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-6">
          {/* Provider Status Control */}
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Provider Status
            </div>
            <div className="flex gap-2">
              {(['ACTIVE', 'DISABLED', 'MAINTENANCE'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => patchStatus(s)}
                  disabled={statusUpdating || provider.status === s}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50
                    ${provider.status === s
                      ? (STATUS_STYLES[s] ?? '') + ' ring-2 ring-offset-1 ring-current'
                      : 'border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                >
                  {statusUpdating && provider.status !== s ? <Loader2 className="w-3 h-3 animate-spin inline" /> : s}
                </button>
              ))}
            </div>
          </div>

          {/* Config Keys */}
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Configuration
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(CONFIG_FIELD_LABELS).map(([key, label]) => (
                <InlineEdit
                  key={key}
                  label={label}
                  value={cfgMap[key] ?? ''}
                  onSave={v => patchConfig(key, v)}
                  placeholder={`Enter ${label}…`}
                />
              ))}
              {/* Any unknown config keys not in the label map */}
              {config
                .filter(r => !CONFIG_FIELD_LABELS[r.key])
                .map(r => (
                  <InlineEdit
                    key={r.key}
                    label={r.key}
                    value={r.value}
                    onSave={v => patchConfig(r.key, v)}
                  />
                ))}
            </div>
          </div>

          {/* Credential Keys */}
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
              Credentials <span className="ml-1 text-[10px] font-normal text-slate-400">(values masked — click Update to replace)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(CRED_FIELD_LABELS).map(([key, label]) => (
                <CredentialInlineEdit
                  key={key}
                  label={label}
                  maskedValue={credMap[key] ?? '—'}
                  onSave={v => patchCredential(key, v)}
                />
              ))}
              {credentials
                .filter(r => !CRED_FIELD_LABELS[r.key])
                .map(r => (
                  <CredentialInlineEdit
                    key={r.key}
                    label={r.key}
                    maskedValue={r.masked_value}
                    onSave={v => patchCredential(r.key, v)}
                  />
                ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
            <button
              onClick={handleReload}
              disabled={reloading}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {reloading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
              重置适配器
            </button>
            <span className="text-xs text-slate-400">
              保存配置后点击此按钮让 ERP 立即生效，无需重启服务。
            </span>
          </div>

          <div className="text-xs text-slate-400 text-right">
            最后更新: {new Date(provider.updated_at).toLocaleString('zh-CN')}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GamingPlatformPage() {
  const [providers, setProviders] = useState<GpProvider[]>([]);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    fetch('/api/games/settings')
      .then(r => r.json())
      .then((data: GpProvider[]) => { setProviders(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Gaming Platform Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          管理游戏提供商配置与凭证。所有变更即时写入数据库，点击&ldquo;重置适配器&rdquo;后立即生效。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          加载提供商列表…
        </div>
      ) : providers.length === 0 ? (
        <div className="text-slate-400 text-sm">暂无游戏提供商。请先运行数据库迁移脚本注册提供商。</div>
      ) : (
        <div className="space-y-4">
          {providers.map(p => (
            <ProviderCard key={p.code} code={p.code} onToast={showToast} />
          ))}
        </div>
      )}

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}
