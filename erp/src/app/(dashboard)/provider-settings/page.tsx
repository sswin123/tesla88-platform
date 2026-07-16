'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProviderSetting {
  id:               number;
  provider:         string;
  display_name:     string;
  enabled:          boolean;
  agent_id:         string | null;
  secret_key:       string | null;
  callback_secret:  string | null;
  signature_type:   string;
  signature_version: string;
  wallet_type:      string;
  currency:         string;
  api_url:          string | null;
  whitelist_ips:    string | null;
  response_format:  string;
  notes:            string | null;
  updated_at:       string;
}

interface Stats {
  summary: {
    today_total: string; today_success: string; today_failed: string;
    today_duplicate: string; avg_ms: string; p95_ms: string;
  };
  byProvider: Array<{
    provider: string; total: string; success: string; failed: string;
    avg_ms: string; last_seen: string;
  }>;
  recentErrors: Array<{
    id: string; provider: string; action: string; ip: string;
    error_message: string; created_at: string;
  }>;
}

const SIGNATURE_TYPES = ['MD5', 'SHA256', 'HMAC256', 'RSA', 'NONE'];
const WALLET_TYPES    = ['SEAMLESS', 'TRANSFER'];
const RESPONSE_FORMATS = ['JSON_SUCCESS', 'JILI', 'PG', 'EVOLUTION', 'PLAYTECH', 'CQ9'];
const CURRENCIES      = ['MYR', 'SGD', 'USD', 'THB', 'IDR', 'VND', 'PHP'];
const SIG_VERSIONS    = ['v1', 'v2', 'v3'];

const BLANK_FORM: Partial<ProviderSetting> = {
  provider: '', display_name: '', enabled: false,
  agent_id: '', secret_key: '', callback_secret: '',
  signature_type: 'MD5', signature_version: 'v1',
  wallet_type: 'SEAMLESS', currency: 'MYR',
  api_url: '', whitelist_ips: '', response_format: 'JSON_SUCCESS', notes: '',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function SuccessRate({ success, total }: { success: string; total: string }) {
  const s = parseInt(success, 10), t = parseInt(total, 10);
  const pct = t > 0 ? Math.round((s / t) * 100) : 0;
  const color = pct >= 95 ? '#22c55e' : pct >= 80 ? '#f59e0b' : '#ef4444';
  return <span style={{ color, fontWeight: 600 }}>{pct}%</span>;
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
      fontWeight: 700, letterSpacing: 0.5,
      background: enabled ? '#16a34a22' : '#64748b22',
      color: enabled ? '#16a34a' : '#64748b',
    }}>
      {enabled ? 'ACTIVE' : 'DISABLED'}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8',
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
      {children}
    </label>
  );
}

function Input({ value, onChange, type = 'text', placeholder, mono }: {
  value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: mono ? 12 : 13,
        border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0',
        fontFamily: mono ? 'monospace' : undefined, outline: 'none',
      }}
    />
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13,
        border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', outline: 'none',
      }}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ── Provider Edit Modal ────────────────────────────────────────────────────────

function EditModal({ ps, onClose, onSaved }: {
  ps: Partial<ProviderSetting> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !ps?.id;
  const [form, setForm] = useState<Partial<ProviderSetting>>(ps ?? BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function f<K extends keyof ProviderSetting>(key: K) {
    return (v: string | boolean) => setForm(prev => ({ ...prev, [key]: v }));
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const method = isNew ? 'POST' : 'PATCH';
      const r = await fetch('/api/provider-settings', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) { const d = await r.json() as { error?: string }; throw new Error(d.error ?? r.statusText); }
      onSaved(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
    setSaving(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#1e293b', borderRadius: 12, width: '100%', maxWidth: 640,
        maxHeight: '90vh', overflow: 'auto', padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
            {isNew ? 'Add Provider' : `Edit — ${form.provider}`}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {isNew && (
            <div style={{ gridColumn: '1/-1' }}>
              <Label>Provider Code *</Label>
              <Input value={form.provider ?? ''} onChange={v => f('provider')(v.toUpperCase())} placeholder="JILI" mono />
            </div>
          )}
          <div>
            <Label>Display Name</Label>
            <Input value={form.display_name ?? ''} onChange={f('display_name')} placeholder="JILI Games" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20 }}>
            <input
              type="checkbox"
              id="enabled"
              checked={form.enabled ?? false}
              onChange={e => f('enabled')(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#22c55e' }}
            />
            <label htmlFor="enabled" style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>
              Enabled (accept callbacks)
            </label>
          </div>

          <div>
            <Label>Agent ID</Label>
            <Input value={form.agent_id ?? ''} onChange={f('agent_id')} placeholder="agent-001" mono />
          </div>
          <div>
            <Label>Currency</Label>
            <Select value={form.currency ?? 'MYR'} onChange={f('currency')} options={CURRENCIES} />
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <Label>Secret Key {form.secret_key?.startsWith('***') ? '(masked — leave blank to keep)' : ''}</Label>
            <Input value={form.secret_key ?? ''} onChange={f('secret_key')} type="password" placeholder="Enter to update" mono />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <Label>Callback Secret {form.callback_secret?.startsWith('***') ? '(masked — leave blank to keep)' : ''}</Label>
            <Input value={form.callback_secret ?? ''} onChange={f('callback_secret')} type="password" placeholder="Enter to update" mono />
          </div>

          <div>
            <Label>Signature Type</Label>
            <Select value={form.signature_type ?? 'MD5'} onChange={f('signature_type')} options={SIGNATURE_TYPES} />
          </div>
          <div>
            <Label>Signature Version</Label>
            <Select value={form.signature_version ?? 'v1'} onChange={f('signature_version')} options={SIG_VERSIONS} />
          </div>

          <div>
            <Label>Wallet Type</Label>
            <Select value={form.wallet_type ?? 'SEAMLESS'} onChange={f('wallet_type')} options={WALLET_TYPES} />
          </div>
          <div>
            <Label>Response Format</Label>
            <Select value={form.response_format ?? 'JSON_SUCCESS'} onChange={f('response_format')} options={RESPONSE_FORMATS} />
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <Label>API URL (optional)</Label>
            <Input value={form.api_url ?? ''} onChange={f('api_url')} placeholder="https://api.jili.com/v1" mono />
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <Label>Whitelist IPs (comma-separated — empty = allow all)</Label>
            <Input value={form.whitelist_ips ?? ''} onChange={f('whitelist_ips')} placeholder="1.2.3.4, 5.6.7.8" mono />
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <Label>Notes</Label>
            <textarea
              value={form.notes ?? ''}
              onChange={e => f('notes')(e.target.value)}
              rows={2}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13,
                border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0',
                resize: 'vertical', outline: 'none',
              }}
            />
          </div>
        </div>

        {error && (
          <p style={{ color: '#ef4444', fontSize: 13, marginTop: 12 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 18px', borderRadius: 6, border: '1px solid #334155',
            background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13,
          }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{
            padding: '8px 18px', borderRadius: 6, border: 'none',
            background: saving ? '#334155' : '#3b82f6', color: '#fff',
            cursor: saving ? 'default' : 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProviderSettingsPage() {
  const [tab,      setTab]      = useState<'providers' | 'monitor'>('providers');
  const [settings, setSettings] = useState<ProviderSetting[]>([]);
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState<Partial<ProviderSetting> | null | false>(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/provider-settings');
      const d = await r.json() as { providers: ProviderSetting[] };
      setSettings(d.providers ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/provider-settings/stats');
      const d = await r.json() as Stats;
      setStats(d);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  useEffect(() => {
    if (tab === 'monitor') void loadStats();
  }, [tab, loadStats]);

  async function toggleEnabled(ps: ProviderSetting) {
    setToggling(ps.provider);
    await fetch('/api/provider-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: ps.provider, enabled: !ps.enabled }),
    });
    await loadSettings();
    setToggling(null);
  }

  const CALLBACK_URL = 'https://apidemo.club/api/provider/callback';

  return (
    <div style={{ padding: 24, color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>
            Provider Callback Settings
          </h1>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{
              fontSize: 12, padding: '3px 8px', borderRadius: 4,
              background: '#0f172a', color: '#38bdf8', border: '1px solid #1e3a5f',
            }}>
              POST {CALLBACK_URL}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(CALLBACK_URL)}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #334155',
                background: 'transparent', color: '#64748b', cursor: 'pointer' }}
            >
              Copy
            </button>
          </div>
        </div>
        <button
          onClick={() => setEditing(BLANK_FORM)}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#3b82f6', color: '#fff', cursor: 'pointer',
            fontWeight: 600, fontSize: 13,
          }}
        >
          + Add Provider
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid #1e293b' }}>
        {(['providers', 'monitor'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 18px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
              color: tab === t ? '#3b82f6' : '#64748b',
              borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
            }}
          >
            {t === 'providers' ? 'Providers' : 'Monitor'}
          </button>
        ))}
      </div>

      {/* ── Providers Tab ─────────────────────────────────────────────────────── */}
      {tab === 'providers' && (
        loading ? (
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Provider', 'Status', 'Wallet', 'Signature', 'Response', 'Currency', 'Whitelist IPs', 'Updated', ''].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px 12px', fontWeight: 700,
                      fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
                      color: '#64748b', borderBottom: '1px solid #1e293b',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {settings.map(ps => (
                  <tr key={ps.provider} style={{ borderBottom: '1px solid #0f172a' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{ps.provider}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{ps.display_name}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <StatusBadge enabled={ps.enabled} />
                        <button
                          disabled={toggling === ps.provider}
                          onClick={() => toggleEnabled(ps)}
                          style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 4,
                            border: '1px solid #334155', background: 'transparent',
                            color: '#94a3b8', cursor: 'pointer',
                          }}
                        >
                          {ps.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{ps.wallet_type}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <code style={{ fontSize: 11, color: '#a78bfa' }}>{ps.signature_type}</code>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <code style={{ fontSize: 11, color: '#38bdf8' }}>{ps.response_format}</code>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{ps.currency}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {ps.whitelist_ips
                        ? <code style={{ fontSize: 10, color: '#64748b' }}>{ps.whitelist_ips}</code>
                        : <span style={{ color: '#334155', fontSize: 11 }}>All allowed</span>}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#475569', fontSize: 11 }}>
                      {ps.updated_at ? new Date(ps.updated_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        onClick={() => setEditing(ps)}
                        style={{
                          fontSize: 12, padding: '4px 12px', borderRadius: 4,
                          border: '1px solid #334155', background: 'transparent',
                          color: '#94a3b8', cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Monitor Tab ───────────────────────────────────────────────────────── */}
      {tab === 'monitor' && (
        stats ? (
          <div>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { label: 'Total (24h)',    value: stats.summary.today_total,     color: '#38bdf8' },
                { label: 'Success',       value: stats.summary.today_success,    color: '#22c55e' },
                { label: 'Failed',        value: stats.summary.today_failed,     color: '#ef4444' },
                { label: 'Duplicates',    value: stats.summary.today_duplicate,  color: '#f59e0b' },
                { label: 'Avg (ms)',      value: stats.summary.avg_ms,           color: '#a78bfa' },
                { label: 'P95 (ms)',      value: stats.summary.p95_ms,           color: '#a78bfa' },
              ].map(c => (
                <div key={c.label} style={{
                  background: '#0f172a', borderRadius: 8, padding: '14px 16px',
                  border: '1px solid #1e293b',
                }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: c.color, marginTop: 4 }}>
                    {c.value || '0'}
                  </div>
                </div>
              ))}
            </div>

            {/* Per-provider table */}
            {stats.byProvider.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>
                  By Provider (24h)
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Provider', 'Total', 'Success Rate', 'Failed', 'Avg ms', 'Last Seen'].map(h => (
                        <th key={h} style={{
                          textAlign: 'left', padding: '8px 12px', fontWeight: 700,
                          fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
                          color: '#64748b', borderBottom: '1px solid #1e293b',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byProvider.map(row => (
                      <tr key={row.provider} style={{ borderBottom: '1px solid #0f172a' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f1f5f9' }}>{row.provider}</td>
                        <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{row.total}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <SuccessRate success={row.success} total={row.total} />
                        </td>
                        <td style={{ padding: '10px 12px', color: parseInt(row.failed,10) > 0 ? '#ef4444' : '#475569' }}>
                          {row.failed}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748b' }}>{row.avg_ms}ms</td>
                        <td style={{ padding: '10px 12px', color: '#475569', fontSize: 11 }}>
                          {row.last_seen ? new Date(row.last_seen).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recent errors */}
            {stats.recentErrors.length > 0 && (
              <div>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                  Recent Errors
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stats.recentErrors.map(e => (
                    <div key={e.id} style={{
                      background: '#0f172a', borderRadius: 6, padding: '10px 14px',
                      border: '1px solid #1e293b', fontSize: 12,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
                          [{e.provider}] {e.action ?? 'unknown'}
                        </span>
                        <span style={{ color: '#475569' }}>
                          {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                          {e.ip ? ` · ${e.ip}` : ''}
                        </span>
                      </div>
                      <code style={{ color: '#ef4444', fontSize: 11, wordBreak: 'break-all' }}>
                        {e.error_message}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.byProvider.length === 0 && stats.recentErrors.length === 0 && (
              <p style={{ color: '#475569', fontSize: 14 }}>No callback traffic in the last 24 hours.</p>
            )}

            <button
              onClick={loadStats}
              style={{
                marginTop: 16, padding: '8px 18px', borderRadius: 6, border: '1px solid #334155',
                background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13,
              }}
            >
              ↺ Refresh
            </button>
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: 14 }}>Loading monitoring data…</p>
        )
      )}

      {/* Edit Modal */}
      {editing !== false && (
        <EditModal
          ps={editing}
          onClose={() => setEditing(false)}
          onSaved={loadSettings}
        />
      )}
    </div>
  );
}
