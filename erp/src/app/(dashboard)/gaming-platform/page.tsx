'use client';

import {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  RefreshCw, Save, Eye, EyeOff, CheckCircle, AlertCircle, XCircle,
  Loader2, ChevronDown, ChevronUp, ShieldCheck, Activity, Wifi, WifiOff,
  Download, Upload, History, RotateCcw, Copy, Check, Lock, Unlock,
  BarChart2, ScrollText, Zap, Filter, Search, ChevronLeft, ChevronRight,
  Clock, TrendingUp, TrendingDown, AlertTriangle,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface Stats24h {
  total_24h: number; success_24h: number; failed_24h: number;
  avg_ms_24h: number | null; last_callback: string | null;
}

interface GpProvider {
  id: number; code: string; name: string; display_name: string; version: string;
  status: string; environment: string; wallet_type: string;
  capabilities: string[];
  health_status: string; health_checked_at: string | null;
  last_success_at: string | null; last_failed_at: string | null;
  last_reload_at: string | null; adapter_loaded: boolean;
  updated_at: string; stats_24h: Stats24h; retry_queue_pending: number;
  // Website display settings
  website_visible: boolean; website_display_name: string | null;
  website_logo_url: string | null; website_banner_url: string | null;
  website_category: string; website_sort_order: number;
  website_is_hot: boolean; website_is_new: boolean;
  website_maintenance: boolean; website_launch_mode: string;
}

interface ConfigRow   { key: string; value: string; updated_at: string; updated_by_name: string | null }
interface CredRow     { key: string; masked_value: string; is_encrypted: boolean; updated_at: string; updated_by_name: string | null }
interface AuditEntry  { action: string; field_key: string | null; old_value_hint: string | null; new_value_hint: string | null; admin_username: string; ip_address: string; created_at: string }
interface ProviderDetail { provider: GpProvider; config: ConfigRow[]; credentials: CredRow[]; recent_audit: AuditEntry[] }

type UrlState = 'ok' | 'configured' | 'error';

interface UrlCheckResult {
  label: string; url: string | null; state: UrlState;
  latency_ms: number | null; http_status?: number; error?: string; note?: string;
}

interface TestResult {
  overall: 'SUCCESS' | 'PARTIAL';
  url_checks: UrlCheckResult[];
  credential_checks: { label: string; loaded: boolean }[];
  config_checks: { label: string; loaded: boolean; value?: string }[];
  summary: { urls_ok: number; urls_configured: number; urls_error: number; creds_ok: number; creds_total: number; config_ok: number; config_total: number };
  total_latency_ms: number;
  tested_at: string;
}

interface ActionStat { action: string; total: number; success: number; failed: number; avg_ms: number | null; last_seen: string }
interface StatsTotals { total: number; success: number; failed: number; avg_ms: number | null; p95_ms: number | null; success_rate: number }
interface StatsData { by_action: ActionStat[]; totals: StatsTotals; generated_at: string }

interface LogRow { id: number; provider: string; action: string; ip: string; status_code: number; verify_result: boolean; processing_time: number; error_message: string | null; created_at: string }
interface LogsData { rows: LogRow[]; total: number; page: number; pages: number }

interface HistoryRow { id: number; version_number: number; provider_status: string; admin_username: string; change_summary: string; created_at: string }
interface AuditRow   { id: number; action: string; field_key: string | null; old_value_hint: string | null; new_value_hint: string | null; admin_username: string; ip_address: string; notes: string | null; created_at: string }
interface AuditData  { rows: AuditRow[]; total: number; page: number; pages: number }

// ══════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════

const CONFIG_LABELS: Record<string, string> = {
  api_base_url: 'API Provider URL', datafeed_url: 'DataFeed URL',
  h5_api_domain: 'H5 API URL', h5_lobby_domain: 'H5 Lobby URL',
  h5_game_domain: 'H5 Game URL', game_icon_url: 'Game Icon URL',
  postfix_id: 'PostFix ID', currency: 'Currency', currency_ratio: 'Currency Ratio',
  timeout_ms: 'Request Timeout (ms)', circuit_threshold: 'Circuit Breaker Threshold',
  circuit_cooldown_ms: 'Circuit Breaker Cooldown (ms)', debug: 'Debug Mode',
  default_lobby_url: 'Default Lobby URL',
};

const CRED_LABELS: Record<string, string> = {
  api_token: 'Access Token', operator_token: 'Operator Token',
  secret_key: 'SecretKey', md5_key: 'Md5EncryptKey',
  encrypt_key: 'EncryptKey', delimiter: 'Delimiter',
};

const STATUS_CFG: Record<string, { label: string; bg: string; dot: string }> = {
  ACTIVE:      { label: 'Active',       bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
  TESTING:     { label: 'Testing',      bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',            dot: 'bg-blue-500' },
  DISABLED:    { label: 'Disabled',     bg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',           dot: 'bg-slate-400' },
  MAINTENANCE: { label: 'Maintenance',  bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',        dot: 'bg-amber-500' },
};

const HEALTH_CFG: Record<string, { color: string; icon: typeof CheckCircle }> = {
  HEALTHY: { color: 'text-emerald-500', icon: CheckCircle },
  DEGRADED:{ color: 'text-amber-500',   icon: AlertCircle },
  DOWN:    { color: 'text-rose-500',    icon: XCircle },
  UNKNOWN: { color: 'text-slate-400',   icon: AlertCircle },
};

const TABS = ['overview', 'website', 'settings', 'credentials', 'logs', 'statistics', 'history', 'audit'] as const;
type Tab = typeof TABS[number];

const ALL_STATUSES: string[] = ['ACTIVE', 'TESTING', 'DISABLED', 'MAINTENANCE'];

// ══════════════════════════════════════════════════════════════
// Utility components
// ══════════════════════════════════════════════════════════════

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium animate-in slide-in-from-bottom-2
      ${ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
      {ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
      {msg}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG['DISABLED'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function HealthBadge({ status }: { status: string }) {
  const cfg = HEALTH_CFG[status] ?? HEALTH_CFG['UNKNOWN'];
  const Icon = cfg.icon;
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}><Icon className="w-3.5 h-3.5" />{status}</span>;
}

function StatCard({ label, value, sub, trend }: { label: string; value: string | number; sub?: string; trend?: 'up' | 'down' | 'neutral' }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      <div className="flex items-end gap-2">
        <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</div>
        {trend === 'up'   && <TrendingUp   className="w-4 h-4 text-emerald-500 mb-0.5" />}
        {trend === 'down' && <TrendingDown  className="w-4 h-4 text-rose-500   mb-0.5" />}
      </div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{title}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Spinner() { return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />; }

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('zh-CN', { timeZone: 'Asia/Kuala_Lumpur' });
}

function fmtMs(ms: number | null | undefined) {
  if (ms == null) return '—';
  return `${ms} ms`;
}

// ══════════════════════════════════════════════════════════════
// Inline field editor (config)
// ══════════════════════════════════════════════════════════════

function InlineEdit({ label, value: initial, updatedBy, onSave }: { label: string; value: string; updatedBy?: string | null; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(initial);
  const [saving, setSaving]   = useState(false);
  useEffect(() => setVal(initial), [initial]);

  async function save() {
    setSaving(true);
    try { await onSave(val); setEditing(false); } finally { setSaving(false); }
  }

  return (
    <div className="group flex items-start gap-2 p-3 rounded-lg border border-slate-100 dark:border-slate-700/60 hover:border-slate-200 dark:hover:border-slate-600 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">{label}</div>
        {editing ? (
          <input autoFocus value={val} onChange={e => setVal(e.target.value)}
            className="w-full text-sm font-mono bg-white dark:bg-slate-900 border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
        ) : (
          <div className="text-sm font-mono text-slate-800 dark:text-slate-200 truncate">
            {val || <span className="text-slate-400 italic text-xs">— not set —</span>}
          </div>
        )}
        {updatedBy && <div className="text-[10px] text-slate-400 mt-0.5">by {updatedBy}</div>}
      </div>
      <div className="shrink-0 mt-4">
        {editing ? (
          <div className="flex gap-1">
            <button onClick={save} disabled={saving} className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
              {saving ? <Spinner /> : <Save className="w-3 h-3" />} 保存
            </button>
            <button onClick={() => { setEditing(false); setVal(initial); }} className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700">取消</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300">
            编辑
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Credential field (never reveals plaintext)
// ══════════════════════════════════════════════════════════════

function CredField({ label, masked, isEncrypted, updatedBy, updatedAt, onUpdate }: {
  label: string; masked: string; isEncrypted: boolean; updatedBy?: string | null; updatedAt: string; onUpdate: (v: string) => Promise<void>
}) {
  const [editing, setEditing]   = useState(false);
  const [val, setVal]           = useState('');
  const [showNew, setShowNew]   = useState(false);
  const [saving, setSaving]     = useState(false);

  async function save() {
    if (!val.trim()) return;
    setSaving(true);
    try { await onUpdate(val.trim()); setEditing(false); setVal(''); } finally { setSaving(false); }
  }

  return (
    <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-700/60">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
        <ShieldCheck className="w-3 h-3" />
        {label}
        {isEncrypted
          ? <span title="AES-256-GCM encrypted"><Lock className="w-3 h-3 text-emerald-500" /></span>
          : <span title="Plaintext (staging)"><Unlock className="w-3 h-3 text-amber-400" /></span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 font-mono text-sm text-slate-500 dark:text-slate-400 tracking-widest truncate">
          {masked || '—'}
        </div>
        <CopyButton value={masked} />
      </div>
      <div className="text-[10px] text-slate-400 mt-1">
        更新: {fmtDate(updatedAt)}{updatedBy ? ` · ${updatedBy}` : ''}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <div className="relative">
            <input
              autoFocus
              type={showNew ? 'text' : 'password'}
              value={val}
              onChange={e => setVal(e.target.value)}
              placeholder="输入新值…"
              className="w-full text-sm font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            <button onClick={() => setShowNew(s => !s)} type="button" className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600">
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex gap-1">
            <button onClick={save} disabled={saving || !val.trim()} className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
              {saving ? <Spinner /> : <Save className="w-3 h-3" />} 保存
            </button>
            <button onClick={() => { setEditing(false); setVal(''); }} className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-700">取消</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="mt-2 px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300">
          更新值
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Connection Test Panel
// ══════════════════════════════════════════════════════════════

function ConnectionTestPanel({ code, onToast }: { code: string; onToast: (m: string, ok: boolean) => void }) {
  const [result, setResult]   = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const r = await fetch(`/api/games/settings/${code}/test`, { method: 'POST' });
      const data = await r.json() as TestResult;
      setResult(data);
      onToast(data.overall === 'SUCCESS' ? '连接测试通过' : '连接测试部分失败', data.overall === 'SUCCESS');
    } catch (e) {
      onToast(`测试失败: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={runTest}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          测试连接
        </button>
        {result && (
          <span className={`flex items-center gap-1.5 text-sm font-semibold ${result.overall === 'SUCCESS' ? 'text-emerald-600' : 'text-amber-600'}`}>
            {result.overall === 'SUCCESS' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {result.overall === 'SUCCESS' ? '测试通过' : '存在异常'}
            <span className="text-slate-400 font-normal text-xs ml-1">
              {result.summary.urls_ok} 可达
              {result.summary.urls_configured > 0 ? ` · ${result.summary.urls_configured} 已配置` : ''}
              {result.summary.urls_error > 0 ? ` · ${result.summary.urls_error} 错误` : ''}
              {' · '}{result.total_latency_ms}ms · {fmtDate(result.tested_at)}
            </span>
          </span>
        )}
      </div>

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* URL Checks */}
          <div className="md:col-span-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">URL 可达性</div>
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" />可达</span>
                <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-amber-500" />已配置</span>
                <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-rose-500" />无法连接</span>
              </div>
            </div>
            <div className="space-y-2.5">
              {result.url_checks.map(c => (
                <div key={c.label}>
                  <div className="flex items-center gap-2 text-sm">
                    {c.state === 'ok'
                      ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      : c.state === 'configured'
                        ? <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                        : <XCircle className="w-4 h-4 text-rose-500 shrink-0" />}
                    <span className="w-28 text-slate-700 dark:text-slate-300 shrink-0 font-medium text-xs">
                      {c.label}
                    </span>
                    <span className={`text-xs font-semibold shrink-0 ${
                      c.state === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
                        : c.state === 'configured' ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}>
                      {c.state === 'ok' ? '可达' : c.state === 'configured' ? '已配置' : '错误'}
                    </span>
                    {c.latency_ms != null && (
                      <span className="text-xs text-slate-400 shrink-0">{c.latency_ms}ms</span>
                    )}
                    <span className="flex-1 font-mono text-[10px] text-slate-400 truncate ml-1">
                      {c.url ?? '未配置'}
                    </span>
                  </div>
                  {/* Note for configured/error state */}
                  {(c.note || c.error) && (
                    <div className={`ml-6 mt-1 text-[10px] leading-relaxed ${
                      c.state === 'configured' ? 'text-amber-500 dark:text-amber-400'
                        : 'text-rose-500 dark:text-rose-400'
                    }`}>
                      {c.note ?? c.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Credential & Config Checks */}
          <div className="space-y-3">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">凭证加载状态</div>
              <div className="space-y-1.5">
                {result.credential_checks.map(c => (
                  <div key={c.label} className="flex items-center gap-2 text-xs">
                    {c.loaded
                      ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      : <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                    {c.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">配置完整性</div>
              <div className="space-y-1.5">
                {result.config_checks.map(c => (
                  <div key={c.label} className="flex items-center gap-2 text-xs">
                    {c.loaded
                      ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      : <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                    <span>{c.label}</span>
                    {c.value && <span className="font-mono text-slate-400 ml-1">{c.value}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Statistics Tab
// ══════════════════════════════════════════════════════════════

function StatsTab({ code }: { code: string }) {
  const [data, setData]       = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/games/settings/${code}/stats`)
      .then(r => r.json() as Promise<StatsData>)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code]);

  if (loading) return <div className="flex gap-2 text-slate-400"><Spinner /><span>加载统计…</span></div>;
  if (!data) return <div className="text-slate-400 text-sm">无统计数据</div>;

  const t = data.totals;
  const successRate = t.total > 0 ? `${t.success_rate.toFixed(1)}%` : '—';
  const failRate    = t.total > 0 ? `${((t.failed / t.total) * 100).toFixed(1)}%` : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHead title="过去24小时 API 统计" />
        <span className="text-xs text-slate-400">{fmtDate(data.generated_at)}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="总请求数" value={t.total.toLocaleString()} />
        <StatCard label="成功率" value={successRate} sub={`${t.success} 成功`} trend={t.success_rate >= 99 ? 'up' : t.success_rate < 95 ? 'down' : 'neutral'} />
        <StatCard label="失败率" value={failRate} sub={`${t.failed} 失败`} trend={t.failed > 0 ? 'down' : 'neutral'} />
        <StatCard label="平均响应" value={fmtMs(t.avg_ms)} sub={`P95: ${fmtMs(t.p95_ms)}`} />
      </div>

      <div>
        <SectionHead title="按操作类型" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {['操作', '总数', '成功', '失败', '平均响应', '最近一次'].map(h => (
                  <th key={h} className="pb-2 pr-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.by_action.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400 text-xs">暂无数据</td></tr>
              ) : data.by_action.map(row => (
                <tr key={row.action} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-700 dark:text-slate-300">{row.action}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.total}</td>
                  <td className="py-2 pr-4 tabular-nums text-emerald-600 dark:text-emerald-400">{row.success}</td>
                  <td className="py-2 pr-4 tabular-nums text-rose-600 dark:text-rose-400">{row.failed}</td>
                  <td className="py-2 pr-4 tabular-nums text-slate-500">{fmtMs(row.avg_ms)}</td>
                  <td className="py-2 text-slate-400 text-xs">{fmtDate(row.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Logs Tab
// ══════════════════════════════════════════════════════════════

const LOG_ACTIONS = ['', 'authenticate', 'getbalance', 'bet', 'betresult', 'refund', 'jackpotwin', 'fundrequest', 'fundreturn', 'fundbetresult'];

function LogsTab({ code }: { code: string }) {
  const [data, setData]         = useState<LogsData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [action, setAction]     = useState('');
  const [status, setStatus]     = useState('');
  const [search, setSearch]     = useState('');
  const [searchInput, setSearchInput] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), limit: '50' });
    if (action) sp.set('action', action);
    if (status) sp.set('status', status);
    if (search) sp.set('search', search);
    fetch(`/api/games/settings/${code}/logs?${sp}`)
      .then(r => r.json() as Promise<LogsData>)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code, page, action, status, search]);

  useEffect(() => { void load(); }, [load]);

  function exportCsv() {
    const sp = new URLSearchParams({ export_csv: '1', limit: '10000' });
    if (action) sp.set('action', action);
    if (status) sp.set('status', status);
    if (search) sp.set('search', search);
    window.open(`/api/games/settings/${code}/logs?${sp}`);
  }

  function rowStatus(row: LogRow) {
    if (!row.verify_result) return { label: 'INVALID SIG', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' };
    if (row.status_code === 200 && !row.error_message) return { label: 'SUCCESS', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
    return { label: 'FAILED', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' };
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
            placeholder="搜索 Body / 错误信息…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 w-52 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
        <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }}
          className="py-1.5 px-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none">
          <option value="">全部操作</option>
          {LOG_ACTIONS.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="py-1.5 px-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none">
          <option value="">全部状态</option>
          <option value="success">SUCCESS</option>
          <option value="failed">FAILED</option>
          <option value="invalid_signature">INVALID SIG</option>
        </select>
        <button onClick={load} className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
        </button>
        <button onClick={exportCsv} className="flex items-center gap-1 py-1.5 px-3 text-xs border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
          <Download className="w-3.5 h-3.5" /> 导出 CSV
        </button>
        {data && <span className="text-xs text-slate-400 ml-auto">共 {data.total.toLocaleString()} 条</span>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {['时间', '操作', '状态', '响应时间', 'IP', '错误信息'].map(h => (
                <th key={h} className="pb-2 pr-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center"><Spinner /></td></tr>
            ) : !data?.rows.length ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-400 text-xs">暂无日志</td></tr>
            ) : data.rows.map(row => {
              const s = rowStatus(row);
              return (
                <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-700 dark:text-slate-300">{row.action ?? '—'}</td>
                  <td className="py-2 pr-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.cls}`}>{s.label}</span></td>
                  <td className="py-2 pr-3 tabular-nums text-xs text-slate-500">{row.processing_time ?? '—'} ms</td>
                  <td className="py-2 pr-3 text-xs text-slate-400 font-mono">{row.ip ?? '—'}</td>
                  <td className="py-2 text-xs text-rose-500 max-w-[200px] truncate">{row.error_message ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center gap-2 justify-end text-sm">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-slate-500 text-xs">第 {page} / {data.pages} 页</span>
          <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages} className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// History Tab
// ══════════════════════════════════════════════════════════════

function HistoryTab({ code, isCredAdmin, onToast }: { code: string; isCredAdmin: boolean; onToast: (m: string, ok: boolean) => void }) {
  const [rows, setRows]           = useState<HistoryRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [rolling, setRolling]     = useState<number | null>(null);
  const [confirmRb, setConfirmRb] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/games/settings/${code}/history`)
      .then(r => r.json() as Promise<HistoryRow[]>)
      .then(d => { setRows(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code]);

  async function rollback(vn: number) {
    setRolling(vn);
    try {
      const r = await fetch(`/api/games/settings/${code}/history/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_number: vn }),
      });
      const d = await r.json() as { ok?: boolean; error?: string; keys_restored?: number };
      if (!d.ok) throw new Error(d.error ?? 'Rollback failed');
      onToast(`已回滚到版本 ${vn}，恢复 ${d.keys_restored ?? 0} 个配置项`, true);
      setConfirmRb(null);
      // Reload history
      const r2 = await fetch(`/api/games/settings/${code}/history`);
      setRows(await r2.json() as HistoryRow[]);
    } catch (e) {
      onToast(`回滚失败: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setRolling(null);
    }
  }

  if (loading) return <div className="flex gap-2 text-slate-400"><Spinner /><span>加载历史…</span></div>;

  return (
    <div className="space-y-3">
      <SectionHead title="配置版本历史" sub="每次配置变更自动创建快照（不含凭证值）" />
      {rows.length === 0 ? (
        <div className="text-slate-400 text-sm py-8 text-center">暂无版本历史</div>
      ) : (
        <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-4">
          {rows.map(row => (
            <div key={row.id} className="relative">
              <div className="absolute -left-[9px] top-1.5 w-3 h-3 rounded-full bg-white dark:bg-slate-900 border-2 border-blue-400" />
              <div className="ml-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">v{row.version_number}</span>
                      <Badge status={row.provider_status} />
                      <span className="text-xs text-slate-500">{fmtDate(row.created_at)}</span>
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{row.change_summary}</div>
                    <div className="text-xs text-slate-400 mt-0.5">by {row.admin_username}</div>
                  </div>
                  {isCredAdmin && (
                    confirmRb === row.version_number ? (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => rollback(row.version_number)} disabled={rolling !== null}
                          className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1">
                          {rolling === row.version_number ? <Spinner /> : <RotateCcw className="w-3 h-3" />} 确认回滚
                        </button>
                        <button onClick={() => setConfirmRb(null)} className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded">取消</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmRb(row.version_number)}
                        className="shrink-0 px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" /> 回滚
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Audit Log Tab
// ══════════════════════════════════════════════════════════════

const AUDIT_ACTIONS = ['', 'UPDATE_CONFIG', 'UPDATE_CREDENTIAL', 'STATUS_CHANGE', 'RELOAD', 'CONNECTION_TEST', 'EXPORT', 'IMPORT', 'ROLLBACK'];

function AuditTab({ code }: { code: string }) {
  const [data, setData]       = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [action, setAction]   = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), limit: '50' });
    if (action) sp.set('action', action);
    fetch(`/api/games/settings/${code}/audit?${sp}`)
      .then(r => r.json() as Promise<AuditData>)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code, page, action]);

  useEffect(() => { void load(); }, [load]);

  function exportCsv() {
    const sp = new URLSearchParams({ export_csv: '1' });
    if (action) sp.set('action', action);
    window.open(`/api/games/settings/${code}/audit?${sp}`);
  }

  const ACTION_LABELS: Record<string, string> = {
    UPDATE_CONFIG: '修改配置', UPDATE_CREDENTIAL: '修改凭证', STATUS_CHANGE: '状态变更',
    RELOAD: '重置适配器', CONNECTION_TEST: '连接测试', EXPORT: '导出', IMPORT: '导入', ROLLBACK: '回滚',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }}
          className="py-1.5 px-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none">
          <option value="">全部操作</option>
          {AUDIT_ACTIONS.filter(Boolean).map(a => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
        </select>
        <button onClick={load} className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
        </button>
        <button onClick={exportCsv} className="flex items-center gap-1 py-1.5 px-3 text-xs border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
          <Download className="w-3.5 h-3.5" /> 导出 CSV
        </button>
        {data && <span className="text-xs text-slate-400 ml-auto">共 {data.total} 条</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {['时间', '操作', '字段', '旧值', '新值', '管理员', 'IP', '备注'].map(h => (
                <th key={h} className="pb-2 pr-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-10 text-center"><Spinner /></td></tr>
            ) : !data?.rows.length ? (
              <tr><td colSpan={8} className="py-10 text-center text-slate-400 text-xs">暂无审计记录</td></tr>
            ) : data.rows.map(row => (
              <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                <td className="py-2 pr-3 text-xs font-medium text-slate-700 dark:text-slate-300">{ACTION_LABELS[row.action] ?? row.action}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{row.field_key ?? '—'}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-400 max-w-[100px] truncate">{row.old_value_hint ?? '—'}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-600 dark:text-slate-300 max-w-[100px] truncate">{row.new_value_hint ?? '—'}</td>
                <td className="py-2 pr-3 text-xs text-slate-500">{row.admin_username}</td>
                <td className="py-2 pr-3 text-xs text-slate-400 font-mono">{row.ip_address ?? '—'}</td>
                <td className="py-2 text-xs text-slate-400 max-w-[120px] truncate">{row.notes ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center gap-2 justify-end">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-500">第 {page} / {data.pages} 页</span>
          <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages} className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Website Display Tab
// ══════════════════════════════════════════════════════════════

const CATEGORY_OPTIONS = [
  { value: 'slot',    label: '老虎机 Slot' },
  { value: 'live',    label: '真人娱乐 Live' },
  { value: 'sport',   label: '体育博彩 Sport' },
  { value: 'fishing', label: '捕鱼 Fishing' },
];

const LAUNCH_MODE_OPTIONS = [
  { value: 'LOBBY',  label: 'LOBBY — 进入 H5 大厅（918KISS 类型）' },
  { value: 'DIRECT', label: 'DIRECT — 直接启动游戏（需游戏列表）' },
];

function WebsiteDisplayTab({
  provider, patchWebsite, onToast,
}: {
  provider: GpProvider;
  patchWebsite: (patch: Record<string, unknown>) => Promise<void>;
  onToast: (m: string, ok: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);

  // Local form state — initialised from provider
  const [visible,     setVisible]     = useState(provider.website_visible);
  const [maintenance, setMaintenance] = useState(provider.website_maintenance);
  const [isHot,       setIsHot]       = useState(provider.website_is_hot);
  const [isNew,       setIsNew]       = useState(provider.website_is_new);
  const [displayName, setDisplayName] = useState(provider.website_display_name ?? '');
  const [logoUrl,     setLogoUrl]     = useState(provider.website_logo_url ?? '');
  const [bannerUrl,   setBannerUrl]   = useState(provider.website_banner_url ?? '');
  const [category,    setCategory]    = useState(provider.website_category);
  const [sortOrder,   setSortOrder]   = useState(String(provider.website_sort_order ?? 0));
  const [launchMode,  setLaunchMode]  = useState(provider.website_launch_mode ?? 'LOBBY');

  async function handleSave() {
    setSaving(true);
    try {
      await patchWebsite({
        website_visible:      visible,
        website_maintenance:  maintenance,
        website_is_hot:       isHot,
        website_is_new:       isNew,
        website_display_name: displayName || null,
        website_logo_url:     logoUrl || null,
        website_banner_url:   bannerUrl || null,
        website_category:     category,
        website_sort_order:   parseInt(sortOrder, 10) || 0,
        website_launch_mode:  launchMode,
      });
      onToast('网站展示设置已保存', true);
    } catch (e) {
      onToast(`保存失败: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setSaving(false);
    }
  }

  function ToggleRow({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700/60 last:border-0">
        <div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</div>
          {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
        </div>
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none
            ${checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5
            ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Visibility toggles */}
      <div>
        <SectionHead title="可见性与状态" sub="控制该 Provider 在玩家网站首页的显示行为" />
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4">
          <ToggleRow label="显示在网站" sub="关闭后玩家不可见，但仍可通过直链进入" checked={visible} onChange={setVisible} />
          <ToggleRow label="维护中" sub="显示维护提示，不允许玩家启动游戏" checked={maintenance} onChange={setMaintenance} />
          <ToggleRow label="🔥 热门标签" sub="在 Provider 卡片上显示 HOT 标签" checked={isHot} onChange={setIsHot} />
          <ToggleRow label="🆕 最新标签" sub="在 Provider 卡片上显示 NEW 标签" checked={isNew} onChange={setIsNew} />
        </div>
      </div>

      {/* Display info */}
      <div>
        <SectionHead title="展示信息" sub="网站 Provider 卡片的显示内容" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">显示名称</label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={provider.display_name ?? provider.code}
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">排列顺序（数字越小越靠前）</label>
            <input
              type="number" min={0}
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Logo URL</label>
            <input
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://cdn.example.com/logo/918kiss.png"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            {logoUrl && (
              <img src={logoUrl} alt="logo preview" className="mt-2 h-10 object-contain rounded" onError={e => (e.currentTarget.style.display = 'none')} />
            )}
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Banner URL</label>
            <input
              value={bannerUrl}
              onChange={e => setBannerUrl(e.target.value)}
              placeholder="https://cdn.example.com/banner/918kiss.jpg"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            {bannerUrl && (
              <img src={bannerUrl} alt="banner preview" className="mt-2 h-20 w-full object-cover rounded-lg" onError={e => (e.currentTarget.style.display = 'none')} />
            )}
          </div>
        </div>
      </div>

      {/* Category & Launch mode */}
      <div>
        <SectionHead title="分类与启动模式" sub="决定 Provider 归属哪个游戏分类，以及网站如何启动它" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">游戏分类</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">启动模式</label>
            <select
              value={launchMode}
              onChange={e => setLaunchMode(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {LAUNCH_MODE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        {launchMode === 'LOBBY' && (
          <div className="mt-2 flex items-start gap-2 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>LOBBY 模式：玩家点击后直接进入 Provider 的 H5 大厅，无需维护独立游戏列表。适用于 918KISS 等大厅型 Provider。</span>
          </div>
        )}
        {launchMode === 'DIRECT' && (
          <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>DIRECT 模式：网站展示该 Provider 的游戏列表，玩家点击具体游戏后传入 game_code 启动。需在 Games Library 维护游戏。</span>
          </div>
        )}
      </div>

      {/* Provider code (read-only) */}
      <div>
        <SectionHead title="Provider 标识（只读）" />
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-300">
          <span className="text-slate-400 text-xs">code</span>
          <span className="font-semibold">{provider.code}</span>
          <CopyButton value={provider.code} />
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 保存中…</> : <><Save className="w-4 h-4" /> 保存网站设置</>}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Provider Detail Panel (tabs)
// ══════════════════════════════════════════════════════════════

function ProviderDetail({ code, onToast, userRole }: { code: string; onToast: (m: string, ok: boolean) => void; userRole: string }) {
  const [detail, setDetail]     = useState<ProviderDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Tab>('overview');
  const [reloading, setReloading] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [syncResult, setSyncResult] = useState<{
    total: number;
    gp_games: { inserted: number; updated: number; deactivated: number };
    website_games: { inserted: number; updated: number };
    website_provider_linked: boolean;
    synced_at: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isCredAdmin = userRole === 'SUPER_ADMIN';

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/games/settings/${code}`);
      if (r.ok) setDetail(await r.json() as ProviderDetail);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { void reload(); }, [reload]);

  async function patchConfig(key: string, value: string) {
    const r = await fetch(`/api/games/settings/${code}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'config', key, value }),
    });
    const d = await r.json() as { ok?: boolean; error?: string };
    if (!d.ok) throw new Error(d.error ?? 'Save failed');
    onToast(`已保存: ${key}`, true);
    await reload();
  }

  async function patchCredential(key: string, value: string) {
    const r = await fetch(`/api/games/settings/${code}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'credential', key, value }),
    });
    const d = await r.json() as { ok?: boolean; error?: string };
    if (!d.ok) throw new Error(d.error ?? 'Save failed');
    onToast(`凭证已更新: ${key}`, true);
    await reload();
  }

  async function patchStatus(s: string) {
    setStatusBusy(true);
    try {
      const r = await fetch(`/api/games/settings/${code}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_status: s }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!d.ok) throw new Error(d.error ?? 'Status update failed');
      onToast(`状态已更新: ${s}`, true);
      await reload();
    } catch (e) {
      onToast(`状态更新失败: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleReload() {
    setReloading(true);
    try {
      const r = await fetch(`/api/games/settings/${code}/reload`, { method: 'POST' });
      const d = await r.json() as { ok?: boolean; message?: string; error?: string };
      if (!d.ok) throw new Error(d.error ?? 'Reload failed');
      onToast('适配器已重置', true);
      await reload();
    } catch (e) {
      onToast(`重置失败: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setReloading(false);
    }
  }

  async function patchWebsite(patch: Record<string, unknown>) {
    const r = await fetch(`/api/games/settings/${code}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'website', website: patch }),
    });
    const d = await r.json() as { ok?: boolean; error?: string };
    if (!d.ok) throw new Error(d.error ?? 'Save failed');
    await reload();
  }

  async function handleSyncGames() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await fetch(`/api/games/settings/${code}/sync`, { method: 'POST' });
      const d = await r.json() as {
        ok?: boolean; error?: string; total?: number;
        gp_games?: { inserted: number; updated: number; deactivated: number };
        website_games?: { inserted: number; updated: number };
        website_provider_linked?: boolean;
        synced_at?: string;
      };
      if (!r.ok || !d.ok) throw new Error(d.error ?? 'Sync failed');
      setSyncResult({
        total: d.total ?? 0,
        gp_games: d.gp_games ?? { inserted: 0, updated: 0, deactivated: 0 },
        website_games: d.website_games ?? { inserted: 0, updated: 0 },
        website_provider_linked: d.website_provider_linked ?? false,
        synced_at: d.synced_at ?? new Date().toISOString(),
      });
      onToast(`同步完成: ${d.total ?? 0} 个游戏 (新增 ${d.website_games?.inserted ?? 0})`, true);
    } catch (e) {
      onToast(`同步失败: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setSyncing(false);
    }
  }

  function handleExport() {
    window.open(`/api/games/settings/${code}/export`);
    onToast('正在下载配置文件（不含凭证值）', true);
  }

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as Record<string, unknown>;
      const r = await fetch(`/api/games/settings/${code}/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      const d = await r.json() as { ok?: boolean; keys_imported?: number; error?: string };
      if (!d.ok) throw new Error(d.error ?? 'Import failed');
      onToast(`导入成功: ${d.keys_imported} 个配置项`, true);
      await reload();
    } catch (e) {
      onToast(`导入失败: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setImporting(false);
    }
  }

  if (loading || !detail) {
    return <div className="flex gap-2 items-center p-6 text-slate-400"><Spinner /><span>加载中…</span></div>;
  }

  const { provider, config, credentials } = detail;
  const cfgMap  = Object.fromEntries(config.map(r => [r.key, r]));
  const credMap = Object.fromEntries(credentials.map(r => [r.key, r]));

  const TAB_META: { id: Tab; label: string; icon: typeof Activity }[] = [
    { id: 'overview',     label: '概览',     icon: Activity },
    { id: 'website',      label: '网站展示',  icon: TrendingUp },
    { id: 'settings',     label: '配置',     icon: Zap },
    { id: 'credentials',  label: '凭证',     icon: ShieldCheck },
    { id: 'statistics',   label: '统计',     icon: BarChart2 },
    { id: 'logs',         label: '回调日志',  icon: ScrollText },
    { id: 'history',      label: '版本历史',  icon: History },
    { id: 'audit',        label: '审计',     icon: Filter },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Provider header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{provider.display_name || provider.name}</h2>
            <Badge status={provider.status} />
            <HealthBadge status={provider.health_status} />
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {provider.code} · v{provider.version} · {provider.environment} · {provider.wallet_type}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isCredAdmin && (
            <>
              <button onClick={handleExport} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                <Download className="w-3.5 h-3.5" /> 导出
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={importing} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50">
                {importing ? <Spinner /> : <Upload className="w-3.5 h-3.5" />} 导入
              </button>
              <input ref={fileRef} type="file" accept=".json" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleImport(f); e.target.value = ''; }} />
              <button onClick={handleReload} disabled={reloading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50">
                {reloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                重置适配器
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-slate-200 dark:border-slate-700 mb-4 overflow-x-auto">
        {TAB_META.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          // Credentials tab — only accessible to game.credentials holders
          if (t.id === 'credentials' && !isCredAdmin) return null;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors
                ${isActive
                  ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              <Icon className="w-3.5 h-3.5" />{t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Status controls */}
            <div>
              <SectionHead title="Provider Status" />
              <div className="flex flex-wrap gap-2">
                {ALL_STATUSES.map(s => (
                  <button key={s} onClick={() => patchStatus(s)} disabled={statusBusy || provider.status === s}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60
                      ${provider.status === s
                        ? (STATUS_CFG[s]?.bg ?? '') + ' ring-2 ring-offset-2 ring-current dark:ring-offset-slate-900'
                        : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {statusBusy && provider.status !== s ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                    {STATUS_CFG[s]?.label ?? s}
                  </button>
                ))}
              </div>
            </div>

            {/* Health info */}
            <div>
              <SectionHead title="Health & Runtime" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Provider Status',   value: <Badge status={provider.status} /> },
                  { label: 'Health Status',      value: <HealthBadge status={provider.health_status} /> },
                  { label: '最近成功回调',        value: fmtDate(provider.last_success_at) },
                  { label: '最近失败回调',        value: <span className={provider.last_failed_at ? 'text-rose-500' : ''}>{fmtDate(provider.last_failed_at)}</span> },
                  { label: '最近重载时间',        value: fmtDate(provider.last_reload_at) },
                  { label: '待重试队列',          value: <span className="font-semibold">{detail.provider.retry_queue_pending ?? 0}</span> },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
                    <div className="text-xs text-slate-500 mb-1">{item.label}</div>
                    <div className="text-sm text-slate-800 dark:text-slate-200">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Connection Test */}
            <div>
              <SectionHead title="Connection Test" sub="服务端发起的连通性测试，不经过浏览器" />
              <ConnectionTestPanel code={code} onToast={onToast} />
            </div>

            {/* Game Sync — conditional on GAME_SYNC capability */}
            <div>
              <SectionHead title="游戏目录同步" sub="从 Provider API 拉取游戏列表，写入 gp_games 和网站 Games Library" />
              {provider.capabilities?.includes('GAME_SYNC') ? (
                <>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => void handleSyncGames()}
                      disabled={syncing}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {syncing
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> 同步中…</>
                        : <><RefreshCw className="w-4 h-4" /> 从 API 同步游戏</>}
                    </button>
                    {syncResult && (
                      <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-4 py-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">共 {syncResult.total} 个游戏</span>
                        <span>gp_games: <span className="text-emerald-600">+{syncResult.gp_games.inserted}</span> ~{syncResult.gp_games.updated} -{syncResult.gp_games.deactivated}</span>
                        <span>Games Library: <span className="text-emerald-600">+{syncResult.website_games.inserted}</span> ~{syncResult.website_games.updated}</span>
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    此 Provider 支持 API 游戏列表同步。同步后在网站 Games Library 可见。
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>此 Provider 不支持自动游戏列表同步（H5 Lobby 模式）。请在 <strong>Website → Games Library</strong> 手动添加游戏，或在 <strong>网站展示</strong> Tab 中配置直接进入 Lobby。</span>
                </div>
              )}
            </div>

            {/* Recent audit */}
            {detail.recent_audit.length > 0 && (
              <div>
                <SectionHead title="最近操作记录" />
                <div className="space-y-1.5">
                  {detail.recent_audit.map((e, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs text-slate-500 py-1.5 border-b border-slate-100 dark:border-slate-800">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-medium text-slate-700 dark:text-slate-300 w-28 shrink-0">{e.action}</span>
                      {e.field_key && <span className="font-mono">{e.field_key}</span>}
                      <span className="ml-auto text-slate-400">{e.admin_username} · {fmtDate(e.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Website Display ── */}
        {tab === 'website' && (
          <WebsiteDisplayTab provider={provider} patchWebsite={patchWebsite} onToast={onToast} />
        )}

        {/* ── Settings ── */}
        {tab === 'settings' && (
          <div className="space-y-3">
            <SectionHead title="Configuration Keys" sub="点击任意行右侧「编辑」按钮修改，保存后立即写入数据库" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(CONFIG_LABELS).map(([key, label]) => (
                <InlineEdit
                  key={key}
                  label={label}
                  value={cfgMap[key]?.value ?? ''}
                  updatedBy={cfgMap[key]?.updated_by_name}
                  onSave={v => patchConfig(key, v)}
                />
              ))}
              {config.filter(r => !CONFIG_LABELS[r.key]).map(r => (
                <InlineEdit key={r.key} label={r.key} value={r.value} updatedBy={r.updated_by_name} onSave={v => patchConfig(r.key, v)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Credentials (SuperAdmin only) ── */}
        {tab === 'credentials' && isCredAdmin && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              凭证值经过掩码处理，API 从不返回明文。更新值将立即覆盖数据库记录，请保存副本。
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(CRED_LABELS).map(([key, label]) => {
                const row = credMap[key];
                return (
                  <CredField
                    key={key}
                    label={label}
                    masked={row?.masked_value ?? '— 未设置 —'}
                    isEncrypted={row?.is_encrypted ?? false}
                    updatedBy={row?.updated_by_name}
                    updatedAt={row?.updated_at ?? ''}
                    onUpdate={v => patchCredential(key, v)}
                  />
                );
              })}
              {credentials.filter(r => !CRED_LABELS[r.key]).map(r => (
                <CredField key={r.key} label={r.key} masked={r.masked_value} isEncrypted={r.is_encrypted}
                  updatedBy={r.updated_by_name} updatedAt={r.updated_at} onUpdate={v => patchCredential(r.key, v)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Statistics ── */}
        {tab === 'statistics' && <StatsTab code={code} />}

        {/* ── Logs ── */}
        {tab === 'logs' && <LogsTab code={code} />}

        {/* ── History ── */}
        {tab === 'history' && <HistoryTab code={code} isCredAdmin={isCredAdmin} onToast={onToast} />}

        {/* ── Audit ── */}
        {tab === 'audit' && <AuditTab code={code} />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Provider Dashboard Card (overview)
// ══════════════════════════════════════════════════════════════

function ProviderCard({ p, isSelected, onClick }: { p: GpProvider; isSelected: boolean; onClick: () => void }) {
  const s = p.stats_24h;
  const rate = s.total_24h > 0 ? Math.round((s.success_24h / s.total_24h) * 100) : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border transition-all
        ${isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{p.display_name || p.name}</div>
          <div className="text-xs text-slate-400 font-mono">{p.code}</div>
        </div>
        <Badge status={p.status} />
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span><HealthBadge status={p.health_status} /></span>
        {s.total_24h > 0 ? (
          <>
            <span>{s.total_24h} 请求</span>
            <span className={rate !== null && rate < 99 ? 'text-rose-500 font-medium' : 'text-emerald-500'}>{rate}% 成功</span>
          </>
        ) : (
          <span className="text-slate-300">无请求</span>
        )}
        {p.retry_queue_pending > 0 && (
          <span className="text-amber-600 font-medium">⚠ {p.retry_queue_pending} 待重试</span>
        )}
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════

export default function GamingPlatformPage() {
  const [providers, setProviders]   = useState<GpProvider[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<string | null>(null);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [userRole, setUserRole]     = useState<string>('ADMIN');
  const [listExpanded, setListExpanded] = useState(true);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const loadProviders = useCallback(() => {
    fetch('/api/games/settings')
      .then(r => r.json() as Promise<GpProvider[]>)
      .then(data => {
        setProviders(data);
        if (!selected && data.length > 0) setSelected(data[0].code);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selected]);

  useEffect(() => {
    void loadProviders();
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((d: { role?: string } | null) => { if (d?.role) setUserRole(d.role); })
      .catch(() => {});
  }, [loadProviders]);

  const activeProvider = providers.find(p => p.code === selected);

  return (
    <div className="h-full flex flex-col px-4 py-6 max-w-7xl mx-auto gap-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Gaming Platform</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            统一管理所有游戏提供商配置、凭证、回调日志与运行状态
          </p>
        </div>
        <button onClick={loadProviders} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-slate-400 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> 加载提供商列表…
        </div>
      ) : providers.length === 0 ? (
        <div className="text-slate-400 text-sm py-12 text-center">
          暂无游戏提供商。请先执行数据库迁移脚本。
        </div>
      ) : (
        <div className="flex gap-4 min-h-0 flex-1">
          {/* Left: Provider list */}
          <div className={`flex-none transition-all ${listExpanded ? 'w-64' : 'w-12'}`}>
            <div className={`${listExpanded ? 'space-y-2' : 'space-y-2 flex flex-col items-center'}`}>
              <button
                onClick={() => setListExpanded(e => !e)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-1"
              >
                {listExpanded ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {listExpanded && <span>提供商列表</span>}
              </button>
              {providers.map(p => listExpanded ? (
                <ProviderCard key={p.code} p={p} isSelected={selected === p.code} onClick={() => setSelected(p.code)} />
              ) : (
                <button key={p.code} onClick={() => setSelected(p.code)} title={p.display_name || p.name}
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold
                    ${selected === p.code ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500'}`}>
                  <span className={`w-2 h-2 rounded-full ${STATUS_CFG[p.status]?.dot ?? 'bg-slate-400'}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Right: Detail panel */}
          <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 overflow-hidden flex flex-col">
            {selected && activeProvider ? (
              <ProviderDetail
                key={selected}
                code={selected}
                onToast={showToast}
                userRole={userRole}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                选择左侧提供商查看详情
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}
