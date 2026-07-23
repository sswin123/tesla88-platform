'use client';
import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Phone, Landmark, AtSign, Mail, Monitor, Globe, List, Building2, AlertTriangle, Plus, Trash2, RefreshCw, ShieldOff } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type Cfg = Record<string, string>;
type Tab = 'policy' | 'whitelist' | 'brand' | 'report';

interface WhitelistPhone  { id: number; phone: string; note: string | null; created_at: string }
interface WhitelistBank   { id: number; bank_name: string; account_number: string; note: string | null; created_at: string }
interface BrandOverride   { id: number; brand_name: string; phone_check_enabled: boolean | null; phone_max_accounts: number | null; bank_check_enabled: boolean | null; bank_max_members: number | null; notes: string | null }
interface DupRow          { phone?: string; bank_account?: string; telegram_id?: string; email?: string; count: number; user_ids: number[]; names: string[] }
interface DupReport       { phones: DupRow[]; banks: DupRow[]; telegrams: DupRow[]; emails: DupRow[]; totals: { phones: number; banks: number; telegrams: number; emails: number } }

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <Icon size={15} className="text-blue-600" />
        <span className="text-sm font-semibold text-gray-800">{title}</span>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

// ── Policy row ────────────────────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-40 shrink-0 pt-0.5 text-xs font-medium text-gray-500">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ── Radio group ───────────────────────────────────────────────────────────────
function RadioGroup({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map(o => (
        <label key={o.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input type="radio" className="accent-blue-600" checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

// ── Number input ──────────────────────────────────────────────────────────────
function Num({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number" min={min} max={max}
      value={value}
      onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || 0)))}
      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RegistrationSecurityPage() {
  const [tab,       setTab]       = useState<Tab>('policy');
  const [cfg,       setCfg]       = useState<Cfg>({});
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState('');
  const [migMissing, setMigMissing] = useState(false);

  // Whitelist state
  const [wlPhones,    setWlPhones]    = useState<WhitelistPhone[]>([]);
  const [wlBanks,     setWlBanks]     = useState<WhitelistBank[]>([]);
  const [newPhone,    setNewPhone]    = useState('');
  const [newPhoneNote, setNewPhoneNote] = useState('');
  const [newBankName, setNewBankName] = useState('');
  const [newBankAcct, setNewBankAcct] = useState('');
  const [newBankNote, setNewBankNote] = useState('');

  // Brand override state
  const [overrides,    setOverrides]    = useState<BrandOverride[]>([]);
  const [newBrand,     setNewBrand]     = useState('');
  const [nbPhoneChk,   setNbPhoneChk]   = useState<boolean | null>(null);
  const [nbPhoneMax,   setNbPhoneMax]   = useState<number | null>(null);
  const [nbBankChk,    setNbBankChk]    = useState<boolean | null>(null);
  const [nbBankMax,    setNbBankMax]    = useState<number | null>(null);

  // Duplicate report state
  const [report,       setReport]       = useState<DupReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportTab,    setReportTab]    = useState<'phones' | 'banks' | 'telegrams' | 'emails'>('phones');

  // Rate limit clear state
  const [rlClearing, setRlClearing] = useState(false);
  const [rlMsg,      setRlMsg]      = useState<{ text: string; ok: boolean } | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ── Load config ─────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    const res = await fetch('/api/registration-security/config');
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      if (d.error === 'migration_required') { setMigMissing(true); return; }
      return;
    }
    const d = await res.json() as { config: { key: string; value: string }[] };
    const map: Cfg = {};
    for (const r of d.config) map[r.key] = r.value;
    setCfg(map);
  }, []);

  const loadWhitelists = useCallback(async () => {
    const [ph, bk] = await Promise.all([
      fetch('/api/registration-security/whitelist/phones').then(r => r.json() as Promise<{ phones: WhitelistPhone[] }>),
      fetch('/api/registration-security/whitelist/banks').then(r => r.json() as Promise<{ banks: WhitelistBank[] }>),
    ]);
    setWlPhones(ph.phones ?? []);
    setWlBanks(bk.banks ?? []);
  }, []);

  const loadOverrides = useCallback(async () => {
    const res = await fetch('/api/registration-security/brand-override');
    if (res.ok) {
      const d = await res.json() as { overrides: BrandOverride[] };
      setOverrides(d.overrides ?? []);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadWhitelists();
    loadOverrides();
  }, [loadConfig, loadWhitelists, loadOverrides]);

  const val  = (k: string) => cfg[k] ?? '';
  const bool = (k: string) => cfg[k] !== 'false';
  const set  = (k: string, v: string) => setCfg(prev => ({ ...prev, [k]: v }));

  // ── Save config ──────────────────────────────────────────────────────────
  async function saveConfig() {
    setSaving(true);
    try {
      const res = await fetch('/api/registration-security/config', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
      });
      if (res.ok) showToast('✓ 保存成功，策略已生效');
      else showToast('❌ 保存失败');
    } finally {
      setSaving(false);
    }
  }

  // ── Whitelist actions ────────────────────────────────────────────────────
  async function addPhone() {
    if (!newPhone.trim()) return;
    const res = await fetch('/api/registration-security/whitelist/phones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: newPhone.trim(), note: newPhoneNote.trim() }),
    });
    const d = await res.json() as { error?: string };
    if (res.ok) { setNewPhone(''); setNewPhoneNote(''); loadWhitelists(); showToast('✓ 已添加'); }
    else showToast(`❌ ${d.error ?? '添加失败'}`);
  }

  async function removePhone(id: number) {
    await fetch('/api/registration-security/whitelist/phones', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadWhitelists();
  }

  async function addBank() {
    if (!newBankName.trim() || !newBankAcct.trim()) return;
    const res = await fetch('/api/registration-security/whitelist/banks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_name: newBankName.trim(), account_number: newBankAcct.trim(), note: newBankNote.trim() }),
    });
    const d = await res.json() as { error?: string };
    if (res.ok) { setNewBankName(''); setNewBankAcct(''); setNewBankNote(''); loadWhitelists(); showToast('✓ 已添加'); }
    else showToast(`❌ ${d.error ?? '添加失败'}`);
  }

  async function removeBank(id: number) {
    await fetch('/api/registration-security/whitelist/banks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadWhitelists();
  }

  // ── Brand override actions ───────────────────────────────────────────────
  async function addOverride() {
    if (!newBrand.trim()) return;
    const res = await fetch('/api/registration-security/brand-override', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_name: newBrand.trim(), phone_check_enabled: nbPhoneChk, phone_max_accounts: nbPhoneMax, bank_check_enabled: nbBankChk, bank_max_members: nbBankMax }),
    });
    if (res.ok) { setNewBrand(''); setNbPhoneChk(null); setNbPhoneMax(null); setNbBankChk(null); setNbBankMax(null); loadOverrides(); showToast('✓ 已保存'); }
  }

  async function removeOverride(id: number) {
    await fetch('/api/registration-security/brand-override', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadOverrides();
  }

  // ── Duplicate report ─────────────────────────────────────────────────────
  async function loadReport() {
    setReportLoading(true);
    try {
      const res = await fetch('/api/registration-security/duplicate-report');
      if (res.ok) setReport(await res.json() as DupReport);
    } finally {
      setReportLoading(false);
    }
  }

  useEffect(() => { if (tab === 'report' && !report) loadReport(); }, [tab, report]);

  // ── Migration missing banner ─────────────────────────────────────────────
  if (migMissing) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center space-y-3">
          <AlertTriangle size={32} className="mx-auto text-amber-500" />
          <p className="font-semibold text-amber-800">Migration 057 尚未执行</p>
          <p className="text-sm text-amber-700">请在 VPS 上运行 <code className="bg-amber-100 px-1 rounded">migrate.sh</code>，然后刷新此页面。</p>
        </div>
      </div>
    );
  }

  const modePolicies = {
    STRICT:   { phone_max_accounts: '1', bank_max_members: '1', ip_protection_enabled: 'true',  ip_max_per_24h: '3'  },
    STANDARD: { phone_max_accounts: '1', bank_max_members: '1', ip_protection_enabled: 'false', ip_max_per_24h: '10' },
    RELAXED:  { phone_max_accounts: '3', bank_max_members: '3', ip_protection_enabled: 'false', ip_max_per_24h: '50' },
  } as const;

  function applyMode(mode: string) {
    if (mode === 'CUSTOM') { set('registration_mode', 'CUSTOM'); return; }
    const preset = modePolicies[mode as keyof typeof modePolicies];
    if (preset) setCfg(prev => ({ ...prev, registration_mode: mode, ...preset }));
  }

  async function clearRateLimit() {
    setRlClearing(true);
    setRlMsg(null);
    try {
      const res = await fetch('/api/admin/rate-limit', { method: 'POST' });
      const d = await res.json() as { ok?: boolean; message?: string; error?: string };
      setRlMsg({ text: d.message ?? d.error ?? (res.ok ? 'Cleared' : 'Failed'), ok: res.ok });
    } catch {
      setRlMsg({ text: 'Network error', ok: false });
    } finally {
      setRlClearing(false);
      setTimeout(() => setRlMsg(null), 5000);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className="text-blue-600" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Registration Security Center</h1>
            <p className="text-xs text-gray-500">统一管理 Website · ERP · Bot · API 注册风控</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${bool('security_enabled') ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${bool('security_enabled') ? 'bg-green-500' : 'bg-gray-400'}`} />
            {bool('security_enabled') ? `模式: ${val('registration_mode') || 'STANDARD'}` : '安全检查已禁用'}
          </span>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-2 text-sm text-blue-800">{toast}</div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['policy','政策配置'],['whitelist','白名单'],['brand','品牌覆盖'],['report','重复报告']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
            {t === 'report' && report && (report.totals.phones + report.totals.banks + report.totals.telegrams + report.totals.emails) > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
                {report.totals.phones + report.totals.banks + report.totals.telegrams + report.totals.emails}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════ TAB: POLICY ══════════════════════════════════════════ */}
      {tab === 'policy' && (
        <div className="space-y-4">

          {/* S1: Global Policy */}
          <Section icon={ShieldCheck} title="Section 1 — 全局政策">
            <Row label="启用安全检查">
              <Toggle checked={bool('security_enabled')} onChange={v => set('security_enabled', v ? 'true' : 'false')} />
              <p className="mt-1 text-xs text-gray-400">关闭后所有检查均跳过（仅限紧急维护）</p>
            </Row>
            <Row label="注册模式">
              <RadioGroup
                value={val('registration_mode') || 'STANDARD'}
                onChange={applyMode}
                options={[
                  { label: 'Strict（最严格）',    value: 'STRICT'   },
                  { label: 'Standard（推荐）',    value: 'STANDARD' },
                  { label: 'Relaxed（宽松）',     value: 'RELAXED'  },
                  { label: 'Custom（自定义）',    value: 'CUSTOM'   },
                ]}
              />
            </Row>
          </Section>

          {/* S2: Phone */}
          <Section icon={Phone} title="Section 2 — 手机号政策">
            <Row label="启用手机检查">
              <Toggle checked={bool('phone_check_enabled')} onChange={v => { set('phone_check_enabled', v ? 'true' : 'false'); set('registration_mode', 'CUSTOM'); }} />
            </Row>
            <Row label="政策">
              <RadioGroup
                value={val('phone_policy') || 'UNIQUE'}
                onChange={v => { set('phone_policy', v); set('phone_max_accounts', v === 'UNIQUE' ? '1' : v === 'ALLOW_2' ? '2' : v === 'ALLOW_3' ? '3' : '0'); set('registration_mode', 'CUSTOM'); }}
                options={[
                  { label: '唯一（Unique）',      value: 'UNIQUE'     },
                  { label: '允许 2 个账号',        value: 'ALLOW_2'    },
                  { label: '允许 3 个账号',        value: 'ALLOW_3'    },
                  { label: '无限制',              value: 'UNLIMITED'  },
                ]}
              />
            </Row>
            <Row label="最大账号数">
              <div className="flex items-center gap-2">
                <Num value={parseInt(val('phone_max_accounts') || '1')} onChange={n => { set('phone_max_accounts', String(n)); set('registration_mode', 'CUSTOM'); }} min={0} max={99} />
                <span className="text-xs text-gray-400">（0 = 无限制）</span>
              </div>
            </Row>
          </Section>

          {/* S3: Bank */}
          <Section icon={Landmark} title="Section 3 — 银行账号政策">
            <Row label="启用银行检查">
              <Toggle checked={bool('bank_check_enabled')} onChange={v => { set('bank_check_enabled', v ? 'true' : 'false'); set('registration_mode', 'CUSTOM'); }} />
            </Row>
            <Row label="政策">
              <RadioGroup
                value={val('bank_policy') || 'UNIQUE'}
                onChange={v => { set('bank_policy', v); set('bank_max_members', v === 'UNIQUE' ? '1' : v === 'ALLOW_2' ? '2' : v === 'ALLOW_3' ? '3' : v === 'ALLOW_5' ? '5' : '0'); set('registration_mode', 'CUSTOM'); }}
                options={[
                  { label: '唯一（Unique）',     value: 'UNIQUE'    },
                  { label: '允许 2 名会员',       value: 'ALLOW_2'   },
                  { label: '允许 3 名会员',       value: 'ALLOW_3'   },
                  { label: '允许 5 名会员',       value: 'ALLOW_5'   },
                  { label: '无限制',             value: 'UNLIMITED' },
                ]}
              />
            </Row>
            <Row label="最大会员数">
              <div className="flex items-center gap-2">
                <Num value={parseInt(val('bank_max_members') || '1')} onChange={n => { set('bank_max_members', String(n)); set('registration_mode', 'CUSTOM'); }} min={0} max={99} />
                <span className="text-xs text-gray-400">（0 = 无限制）</span>
              </div>
            </Row>
            <Row label="Normalize">
              <div className="rounded bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
                自动去除空格、<code>-</code>、<code>.</code>（例：<code>1234 5678</code> → <code>12345678</code>）
              </div>
            </Row>
          </Section>

          {/* S4: Telegram */}
          <Section icon={AtSign} title="Section 4 — Telegram 政策">
            <Row label="启用 Telegram 检查">
              <Toggle checked={bool('telegram_check_enabled')} onChange={v => { set('telegram_check_enabled', v ? 'true' : 'false'); set('registration_mode', 'CUSTOM'); }} />
            </Row>
            <Row label="检查字段">
              <div className="text-xs text-gray-500 bg-blue-50 rounded px-3 py-2">
                Bot 注册：检查 <strong>Telegram User ID</strong>（唯一标识）<br />
                Website 注册：检查 <strong>Username</strong>（最佳努力，用户名可更改）
              </div>
            </Row>
          </Section>

          {/* S5: Email */}
          <Section icon={Mail} title="Section 5 — Email 政策">
            <Row label="启用 Email 检查">
              <Toggle checked={bool('email_check_enabled')} onChange={v => { set('email_check_enabled', v ? 'true' : 'false'); set('registration_mode', 'CUSTOM'); }} />
            </Row>
          </Section>

          {/* S6: Device */}
          <Section icon={Monitor} title="Section 6 — Device Fingerprint">
            <Row label="启用设备保护">
              <Toggle checked={bool('device_protection_enabled')} onChange={v => { set('device_protection_enabled', v ? 'true' : 'false'); set('registration_mode', 'CUSTOM'); }} />
            </Row>
            <Row label="24h 注册上限">
              <div className="flex items-center gap-2">
                <Num value={parseInt(val('device_max_per_24h') || '3')} onChange={n => set('device_max_per_24h', String(n))} min={1} max={99} />
                <span className="text-xs text-gray-400">次 / 设备 / 24 小时</span>
              </div>
            </Row>
          </Section>

          {/* S7: IP */}
          <Section icon={Globe} title="Section 7 — IP 保护">
            <Row label="启用 IP 保护">
              <Toggle checked={bool('ip_protection_enabled')} onChange={v => { set('ip_protection_enabled', v ? 'true' : 'false'); set('registration_mode', 'CUSTOM'); }} />
            </Row>
            <Row label="24h 注册上限">
              <div className="flex items-center gap-2">
                <Num value={parseInt(val('ip_max_per_24h') || '10')} onChange={n => set('ip_max_per_24h', String(n))} min={1} max={999} />
                <span className="text-xs text-gray-400">次 / IP / 24 小时</span>
              </div>
            </Row>
          </Section>

          {/* Save */}
          <div className="flex justify-end pt-2">
            <button onClick={() => void saveConfig()} disabled={saving}
              className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? '保存中…' : '保存所有政策'}
            </button>
          </div>

          {/* ── Rate Limit Management ───────────────────────────────────── */}
          <div className="rounded-lg border border-orange-200 bg-orange-50">
            <div className="flex items-center gap-2 border-b border-orange-200 px-5 py-3">
              <ShieldOff size={15} className="text-orange-600" />
              <span className="text-sm font-semibold text-orange-800">Login Rate Limit — 登录限速管理</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-orange-700">
                ERP 登录限速：同一 IP <strong>5 次失败 / 15 分钟</strong>触发锁定。<br />
                点击下方按钮可立即解锁所有被限速的 IP（清除内存中的计数器）。
              </p>
              {rlMsg && (
                <div className={`rounded-md px-3 py-2 text-sm font-medium ${rlMsg.ok ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                  {rlMsg.ok ? '✓ ' : '✗ '}{rlMsg.text}
                </div>
              )}
              <button
                onClick={() => void clearRateLimit()}
                disabled={rlClearing}
                className="flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                <ShieldOff size={14} />
                {rlClearing ? '清除中…' : 'Clear All Rate Limits（解锁所有 IP）'}
              </button>
              <p className="text-[11px] text-orange-500">
                ⚠ 此操作会清除 ERP + Website 所有登录限速计数。操作已记录至 Audit Log。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ TAB: WHITELIST ════════════════════════════════════════ */}
      {tab === 'whitelist' && (
        <div className="space-y-6">

          {/* Phone whitelist */}
          <Section icon={Phone} title="Section 8 — 手机号白名单（允许重复注册）">
            <div className="flex gap-2">
              <input placeholder="60111234567" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
              <input placeholder="备注（可选）" value={newPhoneNote} onChange={e => setNewPhoneNote(e.target.value)}
                className="w-40 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
              <button onClick={() => void addPhone()}
                className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
                <Plus size={14} />加入
              </button>
            </div>
            <div className="divide-y divide-gray-100 rounded border border-gray-200 mt-2">
              {wlPhones.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">暂无白名单号码</p>
              ) : wlPhones.map(p => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="text-sm font-mono font-medium">{p.phone}</span>
                    {p.note && <span className="ml-2 text-xs text-gray-400">{p.note}</span>}
                  </div>
                  <button onClick={() => void removePhone(p.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </Section>

          {/* Bank whitelist */}
          <Section icon={Landmark} title="Section 9 — 银行账号白名单（允许重复使用）">
            <div className="flex gap-2">
              <input placeholder="银行名称" value={newBankName} onChange={e => setNewBankName(e.target.value)}
                className="w-36 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
              <input placeholder="账号" value={newBankAcct} onChange={e => setNewBankAcct(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
              <input placeholder="备注" value={newBankNote} onChange={e => setNewBankNote(e.target.value)}
                className="w-32 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
              <button onClick={() => void addBank()}
                className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
                <Plus size={14} />加入
              </button>
            </div>
            <div className="divide-y divide-gray-100 rounded border border-gray-200 mt-2">
              {wlBanks.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">暂无白名单账号</p>
              ) : wlBanks.map(b => (
                <div key={b.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="text-xs text-gray-500">{b.bank_name}</span>
                    <span className="ml-2 text-sm font-mono font-medium">{b.account_number}</span>
                    {b.note && <span className="ml-2 text-xs text-gray-400">{b.note}</span>}
                  </div>
                  <button onClick={() => void removeBank(b.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* ══════════ TAB: BRAND OVERRIDE ══════════════════════════════════ */}
      {tab === 'brand' && (
        <div className="space-y-4">
          <Section icon={Building2} title="Section 10 — 品牌覆盖（各品牌独立政策）">
            <p className="text-xs text-gray-500">未设定的字段将继承全局政策。<code>NULL</code> = 跟随全局。</p>

            {/* Add form */}
            <div className="rounded border border-dashed border-gray-300 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-600">新增品牌覆盖</p>
              <div className="flex flex-wrap gap-3">
                <input placeholder="品牌名称（如 OPULUX）" value={newBrand} onChange={e => setNewBrand(e.target.value.toUpperCase())}
                  className="w-40 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-24">手机检查:</span>
                  <select value={nbPhoneChk === null ? '' : String(nbPhoneChk)} onChange={e => setNbPhoneChk(e.target.value === '' ? null : e.target.value === 'true')}
                    className="rounded border border-gray-300 px-2 py-1 text-sm">
                    <option value="">继承全局</option>
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-24">手机最大数:</span>
                  <input type="number" min={0} max={99} placeholder="继承"
                    value={nbPhoneMax ?? ''}
                    onChange={e => setNbPhoneMax(e.target.value === '' ? null : parseInt(e.target.value))}
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-sm" />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-24">银行检查:</span>
                  <select value={nbBankChk === null ? '' : String(nbBankChk)} onChange={e => setNbBankChk(e.target.value === '' ? null : e.target.value === 'true')}
                    className="rounded border border-gray-300 px-2 py-1 text-sm">
                    <option value="">继承全局</option>
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-24">银行最大数:</span>
                  <input type="number" min={0} max={99} placeholder="继承"
                    value={nbBankMax ?? ''}
                    onChange={e => setNbBankMax(e.target.value === '' ? null : parseInt(e.target.value))}
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-sm" />
                </label>
                <button onClick={() => void addOverride()}
                  className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
                  <Plus size={14} />保存
                </button>
              </div>
            </div>

            {/* Override table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-semibold text-gray-500">
                    <th className="pb-2 pr-4">品牌</th>
                    <th className="pb-2 pr-4">手机检查</th>
                    <th className="pb-2 pr-4">手机最大</th>
                    <th className="pb-2 pr-4">银行检查</th>
                    <th className="pb-2 pr-4">银行最大</th>
                    <th className="pb-2">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overrides.length === 0 ? (
                    <tr><td colSpan={6} className="py-4 text-center text-xs text-gray-400">暂无品牌覆盖（使用全局政策）</td></tr>
                  ) : overrides.map(o => (
                    <tr key={o.id}>
                      <td className="py-2 pr-4 font-semibold">{o.brand_name}</td>
                      <td className="py-2 pr-4">{o.phone_check_enabled === null ? '— 继承' : o.phone_check_enabled ? '✓ 开启' : '✗ 关闭'}</td>
                      <td className="py-2 pr-4">{o.phone_max_accounts === null ? '— 继承' : o.phone_max_accounts === 0 ? '无限制' : o.phone_max_accounts}</td>
                      <td className="py-2 pr-4">{o.bank_check_enabled === null ? '— 继承' : o.bank_check_enabled ? '✓ 开启' : '✗ 关闭'}</td>
                      <td className="py-2 pr-4">{o.bank_max_members === null ? '— 继承' : o.bank_max_members === 0 ? '无限制' : o.bank_max_members}</td>
                      <td className="py-2">
                        <button onClick={() => void removeOverride(o.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {/* ══════════ TAB: DUPLICATE REPORT ════════════════════════════════ */}
      {tab === 'report' && (
        <div className="space-y-4">
          <Section icon={List} title="Section 12 — 重复数据报告">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">扫描所有会员，找出重复手机号、银行账号、Telegram ID、Email</p>
              <button onClick={() => void loadReport()} disabled={reportLoading}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50">
                <RefreshCw size={13} className={reportLoading ? 'animate-spin' : ''} />刷新
              </button>
            </div>

            {report && (
              <div className="flex gap-4 text-sm">
                {([['phones','手机','text-red-600'],['banks','银行','text-orange-600'],['telegrams','Telegram','text-blue-600'],['emails','Email','text-purple-600']] as const).map(([k, label, color]) => (
                  <button key={k} onClick={() => setReportTab(k)}
                    className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${reportTab === k ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {label}
                    {report.totals[k] > 0 && <span className={`ml-1 ${color} font-bold`}>{report.totals[k]}</span>}
                  </button>
                ))}
              </div>
            )}

            {!report && !reportLoading && (
              <p className="py-6 text-center text-xs text-gray-400">点击「刷新」扫描重复数据</p>
            )}

            {reportLoading && <p className="py-6 text-center text-xs text-gray-400">扫描中…</p>}

            {report && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-semibold text-gray-500">
                      <th className="pb-2 pr-4">{reportTab === 'phones' ? '手机号' : reportTab === 'banks' ? '银行账号' : reportTab === 'telegrams' ? 'Telegram ID' : 'Email'}</th>
                      <th className="pb-2 pr-4">重复数</th>
                      <th className="pb-2 pr-4">会员 ID</th>
                      <th className="pb-2">姓名</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(report[reportTab] as DupRow[]).length === 0 ? (
                      <tr><td colSpan={4} className="py-4 text-center text-xs text-green-600">✓ 无重复数据</td></tr>
                    ) : (report[reportTab] as DupRow[]).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2 pr-4 font-mono text-xs">{row.phone ?? row.bank_account ?? row.telegram_id ?? row.email}</td>
                        <td className="py-2 pr-4"><span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{row.count}</span></td>
                        <td className="py-2 pr-4 text-xs text-gray-500">{row.user_ids.join(', ')}</td>
                        <td className="py-2 text-xs">{row.names.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
