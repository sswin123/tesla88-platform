# Phase A: Brand Center UI — Brand Provider Management

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Brand Center UI module — a first-class ERP section where each Brand's Provider configurations (credentials, config, health, logs) are managed independently using the new SaaS `brand_provider_*` tables.

**Architecture:** All backend APIs are already complete. This plan is purely frontend. Three new Next.js pages are created under `(dashboard)/brand-center/`. The existing Gaming Platform page is lightly annotated with "Legacy" badges but is NOT restructured. The sidebar gains a new Brand Center group.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, lucide-react, fetch API, `'use client'` pattern (same as gaming-platform/page.tsx and games-library/page.tsx).

## Global Constraints

- Do NOT touch: 918KISS adapter, game APIs, wallet logic, deposit/withdraw, auth, existing API contracts.
- Do NOT remove or break the existing Credentials/Config editors in `gaming-platform/page.tsx` — mark them Legacy only.
- All new pages use `'use client'` and the same className / Tailwind patterns as existing pages.
- Permission guard: all Brand Center pages require `game.manage`. Use the same `requirePermission` pattern via fetch to `/api/auth/me`.
- New pages only read/write `brand_provider_credentials` and `brand_provider_config` (new SaaS tables). They never touch `gp_credentials` or `gp_config`.
- TypeScript: zero new errors. Run `cd erp && npx tsc --noEmit` after each task.
- Vitest suite (currently 501 tests) must remain green. Run `cd erp && npx vitest run` after each task.
- Provider code always uppercase (`.toUpperCase()` on all code params).
- No new database tables, no new API routes — everything uses existing APIs.
- Credential templates are hardcoded in UI code — no DB storage required.

---

## API Reference (all already implemented)

All APIs require `game.manage` permission (JWT cookie, same as existing pages).

```
GET  /api/brands
     → Array<{ id, code, name, is_active, created_at, updated_at, provider_count: number, brand_name: string|null }>

POST /api/brands
     body: { code, name }
     → { ok: true, brand: { id, code, name } }  201

GET  /api/brands/[code]
     → { brand: { id, code, name, is_active, created_at, updated_at },
         settings: { id, brand_name, company_name, logo_media_id }|null,
         providers: Array<{ id, provider_code, provider_name, status, wallet_type, environment, currency, health_status, updated_at }> }

PATCH /api/brands/[code]
     body: { name?: string, is_active?: boolean }
     → { ok: true, brand: { id, code, name, is_active } }

GET  /api/brands/[code]/providers
     → Array<{ id, provider_code, provider_name, provider_display_name, status, wallet_type, environment,
                currency, health_status, health_checked_at, last_success_at, last_failed_at,
                credential_count: number, config_count: number, updated_at }>

POST /api/brands/[code]/providers
     body: { provider_code, wallet_type?, environment?, currency? }
     → { ok: true, brand_provider: { id, brand_code, provider_code } }  201

GET  /api/brands/[code]/providers/[providerCode]
     → { brand_provider: { id, status, wallet_type, environment, currency,
                            health_status, health_checked_at, last_success_at, last_failed_at,
                            created_at, updated_at,
                            provider_code, provider_name, provider_display_name,
                            brand_code, brand_name },
         credentials: Array<{ key, is_encrypted, updated_at, updated_by_name, masked_value }>,
         config: Array<{ key, value, updated_at, updated_by_name }> }

PATCH /api/brands/[code]/providers/[providerCode]
     body: { type: 'settings', status?, wallet_type?, environment?, currency? }
     body: { type: 'credential', key, value, encrypt?: true }
     body: { type: 'config', key, value }
     → { ok: true }

DELETE /api/brands/[code]/providers/[providerCode]
     → { ok: true }

GET /api/games/settings
    → Array<GpProvider>   (provider_code, name, display_name, status, ...)
```

---

## File Structure

```
erp/src/
  components/
    sidebar.tsx                                         MODIFY — add Brand Center nav group

  app/(dashboard)/
    brand-center/
      page.tsx                                          CREATE — brand list
      [code]/
        page.tsx                                        CREATE — brand detail + provider list
        providers/
          [providerCode]/
            page.tsx                                    CREATE — provider detail (5 tabs)

  app/(dashboard)/gaming-platform/
    page.tsx                                            MODIFY — add Legacy badge to credentials/config
```

---

## Shared Constants (used across Task 3 and Task 4 — define once in Task 3)

```typescript
// Status display
const STATUS_COLORS: Record<string, string> = {
  ACTIVE:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  DISABLED:    'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  MAINTENANCE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  TESTING:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

const HEALTH_COLORS: Record<string, string> = {
  HEALTHY: 'text-emerald-600 dark:text-emerald-400',
  DEGRADED:'text-amber-600  dark:text-amber-400',
  DOWN:    'text-rose-600   dark:text-rose-400',
  UNKNOWN: 'text-slate-400  dark:text-slate-500',
};

// Credential key templates per provider code
const CREDENTIAL_TEMPLATES: Record<string, string[]> = {
  'KISS918':  ['api_token', 'operator_token', 'secret_key', 'md5_key', 'encrypt_key', 'delimiter'],
  '918KISS':  ['api_token', 'operator_token', 'secret_key', 'md5_key', 'encrypt_key', 'delimiter'],
  'MEGAH5':   ['api_token', 'operator_token', 'merchant_code'],
  'JILI':     ['agent_id', 'merchant_code'],
  'PG':       ['operator_token', 'secret_key'],
  'CQ9':      ['api_token', 'operator_token', 'merchant_code'],
  'EVOLUTION':['api_token', 'operator_token', 'hmac_secret'],
};

// Config key templates per provider code
const CONFIG_TEMPLATES: Record<string, string[]> = {
  'KISS918':  ['api_base_url', 'h5_api_domain', 'h5_lobby_domain', 'h5_game_domain',
               'game_icon_url', 'postfix_id', 'currency', 'timeout_ms', 'debug'],
  '918KISS':  ['api_base_url', 'h5_api_domain', 'h5_lobby_domain', 'h5_game_domain',
               'game_icon_url', 'postfix_id', 'currency', 'timeout_ms', 'debug'],
  'MEGAH5':   ['api_base_url', 'lobby_url', 'game_domain', 'currency', 'timeout_ms'],
  'JILI':     ['api_base_url', 'lobby_url', 'currency', 'timeout_ms'],
};

function getCredentialTemplate(providerCode: string): string[] {
  const upper = providerCode.toUpperCase();
  return CREDENTIAL_TEMPLATES[upper] ?? [];
}

function getConfigTemplate(providerCode: string): string[] {
  const upper = providerCode.toUpperCase();
  return CONFIG_TEMPLATES[upper] ?? [];
}
```

---

## Toast Component (copy from gaming-platform — use in all new pages)

```typescript
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
      ${ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
      {ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

// Usage: showToast hook
function useToast() {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);
  return { toast, showToast };
}
```

---

### Task 1: Sidebar + Brand List Page

**Files:**
- Modify: `erp/src/components/sidebar.tsx`
- Create: `erp/src/app/(dashboard)/brand-center/page.tsx`

**Interfaces:**
- Consumes: `GET /api/brands` → `BrandRow[]`
- Produces: `/brand-center` page, links to `/brand-center/[code]`

- [ ] **Step 1: Add Brand Center to sidebar**

In `erp/src/components/sidebar.tsx`, add `Store` to the lucide-react import list:

```typescript
import {
  // ... existing imports ...
  Store,
} from 'lucide-react';
```

In the `NAV_GROUPS` array, insert a new group **before** the `'Control Center'` group (currently index 3). The new group goes between the gaming platform group and Control Center:

```typescript
{
  title: 'Brand Center',
  items: [
    { href: '/brand-center', label: 'Brand Center', icon: Store, permission: 'game.manage' },
  ],
},
```

- [ ] **Step 2: Verify sidebar TypeScript**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp && npx tsc --noEmit 2>&1 | grep -v node_modules | head -10
```

Expected: no new errors.

- [ ] **Step 3: Create the Brand List page**

Create `erp/src/app/(dashboard)/brand-center/page.tsx`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Store, Plus, RefreshCw, Loader2, CheckCircle, XCircle,
  ChevronRight, Package,
} from 'lucide-react';

interface BrandRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  provider_count: number;
  brand_name: string | null;
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
      ${ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
      {ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

function NewBrandModal({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const r = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), name: name.trim() }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) { setError(d.error ?? '创建失败'); return; }
      onCreated();
    } catch {
      setError('网络错误');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">新建品牌</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <XCircle className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={e => void handleSubmit(e)} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Brand Code * <span className="text-slate-400">(如 OPULUX, KING777)</span>
            </label>
            <input required value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              pattern="[A-Z0-9_]{2,30}" title="2-30 uppercase letters, digits, or underscores"
              placeholder="OPULUX"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Brand Name *</label>
            <input required value={name} onChange={e => setName(e.target.value)}
              placeholder="Opulux Gaming"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              取消
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? '创建中…' : '创建品牌'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BrandCenterPage() {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/brands');
      if (r.ok) setBrands(await r.json() as BrandRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Brand Center</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">管理所有品牌的 Provider 配置</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
            新建品牌
          </button>
          <button onClick={load}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Brand List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : brands.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无品牌。点击"新建品牌"开始。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {brands.map(b => (
            <Link key={b.code} href={`/brand-center/${b.code}`}
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-blue-400 dark:hover:border-blue-500 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Store className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{b.name}</span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {b.code}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${b.is_active
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {b.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {b.brand_name && (
                      <p className="text-xs text-slate-400 mt-0.5">{b.brand_name}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                      <Package className="w-3.5 h-3.5" />
                      <span>{b.provider_count} Provider{b.provider_count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <NewBrandModal
          onCreated={() => {
            setShowNew(false);
            showToast('品牌已创建', true);
            void load();
          }}
          onClose={() => setShowNew(false)}
        />
      )}
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript and tests**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx tsc --noEmit 2>&1 | grep -v node_modules | head -10
npx vitest run 2>&1 | tail -5
```

Expected: 0 new TypeScript errors. 501 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
git add erp/src/components/sidebar.tsx \
        "erp/src/app/(dashboard)/brand-center/page.tsx"
git commit -m "feat(brand-center): Brand Center sidebar entry and brand list page"
```

---

### Task 2: Brand Detail Page — Overview + Provider List

**Files:**
- Create: `erp/src/app/(dashboard)/brand-center/[code]/page.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/brands/[code]` → `{ brand, settings, providers }`
  - `POST /api/brands/[code]/providers` → enable provider
  - `GET /api/games/settings` → list available providers for the enable-provider dropdown
- Produces: `/brand-center/[code]` page, links to `/brand-center/[code]/providers/[providerCode]`

- [ ] **Step 1: Create Brand Detail page**

Create `erp/src/app/(dashboard)/brand-center/[code]/page.tsx`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Store, Package, ChevronRight, Plus, Loader2,
  CheckCircle, XCircle, RefreshCw, ArrowLeft,
  Activity, AlertCircle,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface Brand {
  id: number; code: string; name: string; is_active: boolean;
  created_at: string; updated_at: string;
}

interface BrandSettings {
  id: number; brand_name: string; company_name: string; logo_media_id: number | null;
}

interface BrandProvider {
  id: number; provider_code: string; provider_name: string;
  status: string; wallet_type: string; environment: string;
  currency: string; health_status: string; updated_at: string;
}

interface GpProvider { id: number; code: string; display_name: string; name: string; status: string }

// ── Constants ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  DISABLED:    'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  MAINTENANCE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  TESTING:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

const HEALTH_DOT: Record<string, string> = {
  HEALTHY: 'bg-emerald-500',
  DEGRADED:'bg-amber-500',
  DOWN:    'bg-rose-500',
  UNKNOWN: 'bg-slate-400',
};

// ── Shared Toast ──────────────────────────────────────────────────────────

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
      ${ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
      {ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

// ── Enable Provider Modal ─────────────────────────────────────────────────

function EnableProviderModal({
  brandCode,
  existingCodes,
  onEnabled,
  onClose,
}: {
  brandCode: string;
  existingCodes: string[];
  onEnabled: (providerCode: string) => void;
  onClose: () => void;
}) {
  const [providers, setProviders] = useState<GpProvider[]>([]);
  const [selected, setSelected] = useState('');
  const [walletType, setWalletType] = useState<'SEAMLESS' | 'TRANSFER'>('SEAMLESS');
  const [environment, setEnvironment] = useState<'PRODUCTION' | 'SANDBOX'>('PRODUCTION');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/games/settings')
      .then(r => r.json() as Promise<GpProvider[]>)
      .then(list => setProviders(list.filter(p => !existingCodes.includes(p.code))));
  }, [existingCodes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) { setError('请选择 Provider'); return; }
    setError(''); setSaving(true);
    try {
      const r = await fetch(`/api/brands/${brandCode}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_code: selected, wallet_type: walletType, environment }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) { setError(d.error ?? '启用失败'); return; }
      onEnabled(selected);
    } catch { setError('网络错误'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">启用 Provider</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <XCircle className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={e => void handleSubmit(e)} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Provider *</label>
            <select value={selected} onChange={e => setSelected(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- 选择 Provider --</option>
              {providers.map(p => (
                <option key={p.code} value={p.code}>{p.display_name || p.name} ({p.code})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Wallet Type</label>
              <select value={walletType} onChange={e => setWalletType(e.target.value as 'SEAMLESS' | 'TRANSFER')}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="SEAMLESS">SEAMLESS</option>
                <option value="TRANSFER">TRANSFER</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Environment</label>
              <select value={environment} onChange={e => setEnvironment(e.target.value as 'PRODUCTION' | 'SANDBOX')}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="SANDBOX">SANDBOX</option>
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              取消
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? '启用中…' : '启用 Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function BrandDetailPage() {
  const params = useParams<{ code: string }>();
  const brandCode = params.code.toUpperCase();

  const [brand, setBrand] = useState<Brand | null>(null);
  const [settings, setSettings] = useState<BrandSettings | null>(null);
  const [providers, setProviders] = useState<BrandProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEnable, setShowEnable] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/brands/${brandCode}`);
      if (r.ok) {
        const d = await r.json() as { brand: Brand; settings: BrandSettings | null; providers: BrandProvider[] };
        setBrand(d.brand);
        setSettings(d.settings);
        setProviders(d.providers);
      }
    } finally {
      setLoading(false);
    }
  }, [brandCode]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );

  if (!brand) return (
    <div className="text-center py-20 text-slate-400">
      <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p>品牌 {brandCode} 不存在。</p>
      <Link href="/brand-center" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
        返回品牌列表
      </Link>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/brand-center" className="hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Brand Center
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-mono text-slate-900 dark:text-slate-100">{brandCode}</span>
      </nav>

      {/* Brand Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
              <Store className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{brand.name}</h1>
                <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {brand.code}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${brand.is_active
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {brand.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {settings && (
                <p className="text-sm text-slate-500 mt-0.5">{settings.brand_name} — {settings.company_name}</p>
              )}
            </div>
          </div>
          <button onClick={load}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Providers Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Providers
            <span className="text-xs font-normal text-slate-400">({providers.length})</span>
          </h2>
          <button onClick={() => setShowEnable(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" />
            启用 Provider
          </button>
        </div>

        {providers.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂未启用任何 Provider。</p>
            <button onClick={() => setShowEnable(true)}
              className="mt-3 text-sm text-blue-600 hover:underline">
              点击启用第一个 Provider →
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {providers.map(p => (
              <Link key={p.provider_code}
                href={`/brand-center/${brandCode}/providers/${p.provider_code}`}
                className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 hover:border-blue-400 dark:hover:border-blue-500 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${HEALTH_DOT[p.health_status] ?? 'bg-slate-400'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{p.provider_name}</span>
                      <span className="text-xs font-mono text-slate-400">{p.provider_code}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[p.status] ?? STATUS_COLORS['DISABLED']}`}>
                        {p.status}
                      </span>
                      <span className="text-xs text-slate-400">{p.wallet_type} · {p.environment} · {p.currency}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{p.health_status}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showEnable && (
        <EnableProviderModal
          brandCode={brandCode}
          existingCodes={providers.map(p => p.provider_code)}
          onEnabled={(code) => {
            setShowEnable(false);
            showToast(`已启用 ${code}（状态 DISABLED，请配置凭证后激活）`, true);
            void load();
          }}
          onClose={() => setShowEnable(false)}
        />
      )}
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript and tests**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx tsc --noEmit 2>&1 | grep -v node_modules | head -10
npx vitest run 2>&1 | tail -5
```

Expected: 0 new TypeScript errors. 501 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
git add "erp/src/app/(dashboard)/brand-center/[code]/page.tsx"
git commit -m "feat(brand-center): brand detail page with provider list and enable-provider modal"
```

---

### Task 3: Provider Detail Page — Shell + General Tab + Credentials Tab

**Files:**
- Create: `erp/src/app/(dashboard)/brand-center/[code]/providers/[providerCode]/page.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/brands/[code]/providers/[providerCode]` → `{ brand_provider, credentials, config }`
  - `PATCH /api/brands/[code]/providers/[providerCode]` with `type: 'settings'` or `type: 'credential'`
- Produces: Provider detail page with tabs General and Credentials (Config/Health/Logs in Task 4)

- [ ] **Step 1: Create the provider detail page**

Create `erp/src/app/(dashboard)/brand-center/[code]/providers/[providerCode]/page.tsx`.

The file has three sections: (A) types + constants, (B) tab components, (C) the page shell. Build them in order.

**(A) Types and constants:**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, ChevronRight, RefreshCw, Loader2,
  CheckCircle, XCircle, AlertCircle, Eye, EyeOff,
  Plus, Save, Key, Settings2, Activity, ScrollText,
  BarChart3, ShieldCheck,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface BrandProviderDetail {
  id: number; status: string; wallet_type: string; environment: string;
  currency: string; health_status: string;
  health_checked_at: string | null; last_success_at: string | null; last_failed_at: string | null;
  created_at: string; updated_at: string;
  provider_code: string; provider_name: string; provider_display_name: string;
  brand_code: string; brand_name: string;
}

interface CredRow {
  key: string; is_encrypted: boolean; updated_at: string;
  updated_by_name: string | null; masked_value: string;
}

interface ConfigRow {
  key: string; value: string; updated_at: string; updated_by_name: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  DISABLED:    'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  MAINTENANCE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  TESTING:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

const HEALTH_COLORS: Record<string, string> = {
  HEALTHY: 'text-emerald-600 dark:text-emerald-400',
  DEGRADED:'text-amber-600  dark:text-amber-400',
  DOWN:    'text-rose-600   dark:text-rose-400',
  UNKNOWN: 'text-slate-400  dark:text-slate-500',
};

const CREDENTIAL_TEMPLATES: Record<string, string[]> = {
  'KISS918': ['api_token','operator_token','secret_key','md5_key','encrypt_key','delimiter'],
  '918KISS': ['api_token','operator_token','secret_key','md5_key','encrypt_key','delimiter'],
  'MEGAH5':  ['api_token','operator_token','merchant_code'],
  'JILI':    ['agent_id','merchant_code'],
  'PG':      ['operator_token','secret_key'],
  'CQ9':     ['api_token','operator_token','merchant_code'],
  'EVOLUTION':['api_token','operator_token','hmac_secret'],
};

const CONFIG_TEMPLATES: Record<string, string[]> = {
  'KISS918': ['api_base_url','h5_api_domain','h5_lobby_domain','h5_game_domain',
              'game_icon_url','postfix_id','currency','timeout_ms','debug'],
  '918KISS': ['api_base_url','h5_api_domain','h5_lobby_domain','h5_game_domain',
              'game_icon_url','postfix_id','currency','timeout_ms','debug'],
  'MEGAH5':  ['api_base_url','lobby_url','game_domain','currency','timeout_ms'],
  'JILI':    ['api_base_url','lobby_url','currency','timeout_ms'],
};

function getCredentialTemplate(code: string): string[] {
  return CREDENTIAL_TEMPLATES[code.toUpperCase()] ?? [];
}

function getConfigTemplate(code: string): string[] {
  return CONFIG_TEMPLATES[code.toUpperCase()] ?? [];
}

// ── Toast ─────────────────────────────────────────────────────────────────

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
      ${ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
      {ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}
```

**(B) General Tab component:**

```typescript
function GeneralTab({
  bp,
  brandCode,
  providerCode,
  onSaved,
  showToast,
}: {
  bp: BrandProviderDetail;
  brandCode: string;
  providerCode: string;
  onSaved: () => void;
  showToast: (msg: string, ok: boolean) => void;
}) {
  const [status,      setStatus]      = useState(bp.status);
  const [walletType,  setWalletType]  = useState(bp.wallet_type);
  const [environment, setEnvironment] = useState(bp.environment);
  const [currency,    setCurrency]    = useState(bp.currency);
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    setStatus(bp.status);
    setWalletType(bp.wallet_type);
    setEnvironment(bp.environment);
    setCurrency(bp.currency);
  }, [bp]);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch(`/api/brands/${brandCode}/providers/${providerCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'settings', status, wallet_type: walletType, environment, currency }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) { showToast(d.error ?? '保存失败', false); return; }
      showToast('设置已保存', true);
      onSaved();
    } catch { showToast('网络错误', false); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="ACTIVE">ACTIVE</option>
            <option value="DISABLED">DISABLED</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
            <option value="TESTING">TESTING</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Wallet Type</label>
          <select value={walletType} onChange={e => setWalletType(e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="SEAMLESS">SEAMLESS</option>
            <option value="TRANSFER">TRANSFER</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Environment</label>
          <select value={environment} onChange={e => setEnvironment(e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="PRODUCTION">PRODUCTION</option>
            <option value="SANDBOX">SANDBOX</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Currency</label>
          <input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
            maxLength={3} placeholder="MYR"
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button onClick={() => void handleSave()} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? '保存中…' : '保存设置'}
        </button>
      </div>

      {/* Timestamps */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
        <div>创建时间：{new Date(bp.created_at).toLocaleString()}</div>
        <div>更新时间：{new Date(bp.updated_at).toLocaleString()}</div>
      </div>
    </div>
  );
}
```

**(C) Credentials Tab component:**

```typescript
function CredentialsTab({
  credentials,
  providerCode,
  brandCode,
  onSaved,
  showToast,
}: {
  credentials: CredRow[];
  providerCode: string;
  brandCode: string;
  onSaved: () => void;
  showToast: (msg: string, ok: boolean) => void;
}) {
  const [editKey,   setEditKey]   = useState('');
  const [editValue, setEditValue] = useState('');
  const [encrypt,   setEncrypt]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [showAdd,   setShowAdd]   = useState(false);
  const [revealed,  setRevealed]  = useState<Set<string>>(new Set());

  const template = getCredentialTemplate(providerCode);
  const existingKeys = new Set(credentials.map(c => c.key));

  async function handleSave() {
    if (!editKey.trim()) { showToast('key 不能为空', false); return; }
    if (!editValue.trim()) { showToast('value 不能为空', false); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/brands/${brandCode}/providers/${providerCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'credential', key: editKey.trim(), value: editValue, encrypt }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) { showToast(d.error ?? '保存凭证失败', false); return; }
      showToast(`凭证 "${editKey}" 已保存`, true);
      setEditKey(''); setEditValue(''); setShowAdd(false);
      onSaved();
    } catch { showToast('网络错误', false); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Template hint */}
      {template.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500 mb-2">凭证模板（{providerCode} 所需的 key）</p>
          <div className="flex flex-wrap gap-1.5">
            {template.map(k => (
              <button key={k}
                onClick={() => { setEditKey(k); setShowAdd(true); }}
                className={`text-xs font-mono px-2 py-0.5 rounded border transition-colors
                  ${existingKeys.has(k)
                    ? 'border-emerald-300 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 cursor-default'
                    : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 cursor-pointer'}`}>
                {existingKeys.has(k) ? '✓ ' : ''}{k}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Credential list */}
      {credentials.length === 0 && !showAdd ? (
        <div className="text-center py-8 text-slate-400">
          <Key className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无凭证。</p>
        </div>
      ) : (
        <div className="space-y-2">
          {credentials.map(c => (
            <div key={c.key}
              className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <Key className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300 shrink-0">{c.key}</span>
                <span className="text-xs font-mono text-slate-400 truncate">{c.masked_value}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                {c.is_encrypted && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
                <button onClick={() => { setEditKey(c.key); setEditValue(''); setShowAdd(true); }}
                  className="text-blue-600 hover:underline">
                  修改
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form */}
      {showAdd ? (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {existingKeys.has(editKey) ? `修改凭证 — ${editKey}` : '添加凭证'}
          </h3>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Key</label>
            <input value={editKey} onChange={e => setEditKey(e.target.value.trim())}
              placeholder="api_token"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Value（明文）</label>
            <input value={editValue} onChange={e => setEditValue(e.target.value)}
              type="password"
              placeholder="输入凭证值"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={encrypt} onChange={e => setEncrypt(e.target.checked)}
              className="w-4 h-4 rounded" />
            标记为加密凭证（is_encrypted = true）
          </label>
          <p className="text-xs text-slate-400">
            ⚠ 仅当值已通过 AES-256-GCM 加密时才勾选此项。BrandProviderManager 将调用 decrypt() 解密。
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowAdd(false); setEditKey(''); setEditValue(''); }}
              className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              取消
            </button>
            <button onClick={() => void handleSave()} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? '保存中…' : '保存凭证'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
          <Plus className="w-4 h-4" />
          添加凭证
        </button>
      )}
    </div>
  );
}
```

**(D) Page shell (tabs: General + Credentials — Config/Health/Logs added in Task 4):**

```typescript
type Tab = 'general' | 'credentials' | 'config' | 'health' | 'logs';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'general',     label: 'General',     icon: Settings2   },
  { id: 'credentials', label: 'Credentials', icon: Key         },
  { id: 'config',      label: 'Config',      icon: Activity    },
  { id: 'health',      label: 'Health',      icon: ShieldCheck },
  { id: 'logs',        label: 'Logs',        icon: ScrollText  },
];

export default function BrandProviderDetailPage() {
  const params = useParams<{ code: string; providerCode: string }>();
  const brandCode    = params.code.toUpperCase();
  const providerCode = params.providerCode.toUpperCase();

  const [bp,          setBp]          = useState<BrandProviderDetail | null>(null);
  const [credentials, setCredentials] = useState<CredRow[]>([]);
  const [config,      setConfig]      = useState<ConfigRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState<Tab>('general');
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/brands/${brandCode}/providers/${providerCode}`);
      if (r.ok) {
        const d = await r.json() as { brand_provider: BrandProviderDetail; credentials: CredRow[]; config: ConfigRow[] };
        setBp(d.brand_provider);
        setCredentials(d.credentials);
        setConfig(d.config);
      }
    } finally { setLoading(false); }
  }, [brandCode, providerCode]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );

  if (!bp) return (
    <div className="text-center py-20 text-slate-400">
      <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p>找不到品牌 Provider 配置。</p>
      <Link href={`/brand-center/${brandCode}`} className="text-blue-600 hover:underline text-sm mt-2 inline-block">
        返回品牌详情
      </Link>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 flex-wrap">
        <Link href="/brand-center" className="hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Brand Center
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href={`/brand-center/${brandCode}`} className="hover:text-slate-900 dark:hover:text-slate-100">
          {brandCode}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span>Providers</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-mono text-slate-900 dark:text-slate-100">{providerCode}</span>
      </nav>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {bp.provider_display_name || bp.provider_name}
              </h1>
              <span className="text-xs font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                {bp.provider_code}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[bp.status] ?? STATUS_COLORS['DISABLED']}`}>
                {bp.status}
              </span>
            </div>
            <div className="text-sm text-slate-500">
              Brand: <span className="font-mono">{bp.brand_code}</span>
              {bp.brand_name && ` — ${bp.brand_name}`}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
              <span>{bp.wallet_type}</span>
              <span>·</span>
              <span>{bp.environment}</span>
              <span>·</span>
              <span>{bp.currency}</span>
              <span>·</span>
              <span className={HEALTH_COLORS[bp.health_status] ?? HEALTH_COLORS['UNKNOWN']}>
                {bp.health_status}
              </span>
            </div>
          </div>
          <button onClick={load}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors
                  ${activeTab === t.id
                    ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="p-5">
          {activeTab === 'general' && (
            <GeneralTab
              bp={bp}
              brandCode={brandCode}
              providerCode={providerCode}
              onSaved={load}
              showToast={showToast}
            />
          )}
          {activeTab === 'credentials' && (
            <CredentialsTab
              credentials={credentials}
              providerCode={providerCode}
              brandCode={brandCode}
              onSaved={load}
              showToast={showToast}
            />
          )}
          {activeTab === 'config' && (
            <div className="text-center py-12 text-slate-400">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Config tab — 将在 Task 4 中实现。</p>
            </div>
          )}
          {activeTab === 'health' && (
            <div className="text-center py-12 text-slate-400">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Health tab — 将在 Task 4 中实现。</p>
            </div>
          )}
          {activeTab === 'logs' && (
            <div className="text-center py-12 text-slate-400">
              <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Logs tab — 将在 Task 4 中实现。</p>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript and tests**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx tsc --noEmit 2>&1 | grep -v node_modules | head -10
npx vitest run 2>&1 | tail -5
```

Expected: 0 new TypeScript errors. 501 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
git add "erp/src/app/(dashboard)/brand-center/[code]/providers/[providerCode]/page.tsx"
git commit -m "feat(brand-center): provider detail page with General and Credentials tabs"
```

---

### Task 4: Config Tab + Health Tab + Logs Tab + Provider Registry Legacy Badge

**Files:**
- Modify: `erp/src/app/(dashboard)/brand-center/[code]/providers/[providerCode]/page.tsx` — replace placeholder tabs with real content
- Modify: `erp/src/app/(dashboard)/gaming-platform/page.tsx` — add Legacy badge

**Interfaces:**
- Consumes: `PATCH /api/brands/[code]/providers/[providerCode]` with `type: 'config'`
- `brand_provider.health_status`, `health_checked_at`, `last_success_at`, `last_failed_at` (already in `BrandProviderDetail`)

- [ ] **Step 1: Add ConfigTab component to the provider detail page**

In `erp/src/app/(dashboard)/brand-center/[code]/providers/[providerCode]/page.tsx`, add the `ConfigTab` component before the `BrandProviderDetailPage` function (after `CredentialsTab`):

```typescript
function ConfigTab({
  config,
  providerCode,
  brandCode,
  onSaved,
  showToast,
}: {
  config: ConfigRow[];
  providerCode: string;
  brandCode: string;
  onSaved: () => void;
  showToast: (msg: string, ok: boolean) => void;
}) {
  const [editKey,   setEditKey]   = useState('');
  const [editValue, setEditValue] = useState('');
  const [saving,    setSaving]    = useState(false);
  const [showAdd,   setShowAdd]   = useState(false);

  const template     = getConfigTemplate(providerCode);
  const existingKeys = new Set(config.map(c => c.key));

  async function handleSave() {
    if (!editKey.trim()) { showToast('key 不能为空', false); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/brands/${brandCode}/providers/${providerCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'config', key: editKey.trim(), value: editValue }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) { showToast(d.error ?? '保存配置失败', false); return; }
      showToast(`配置 "${editKey}" 已保存`, true);
      setEditKey(''); setEditValue(''); setShowAdd(false);
      onSaved();
    } catch { showToast('网络错误', false); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Template hint */}
      {template.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500 mb-2">配置模板（{providerCode} 常用 key）</p>
          <div className="flex flex-wrap gap-1.5">
            {template.map(k => (
              <button key={k}
                onClick={() => {
                  setEditKey(k);
                  setEditValue(config.find(c => c.key === k)?.value ?? '');
                  setShowAdd(true);
                }}
                className={`text-xs font-mono px-2 py-0.5 rounded border transition-colors
                  ${existingKeys.has(k)
                    ? 'border-emerald-300 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600'}`}>
                {existingKeys.has(k) ? '✓ ' : ''}{k}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Config list */}
      {config.length === 0 && !showAdd ? (
        <div className="text-center py-8 text-slate-400">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无配置。</p>
        </div>
      ) : (
        <div className="space-y-2">
          {config.map(c => (
            <div key={c.key}
              className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300 shrink-0">{c.key}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.value}</span>
              </div>
              <button onClick={() => { setEditKey(c.key); setEditValue(c.value); setShowAdd(true); }}
                className="text-xs text-blue-600 hover:underline shrink-0">
                修改
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form */}
      {showAdd ? (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {existingKeys.has(editKey) ? `修改配置 — ${editKey}` : '添加配置'}
          </h3>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Key</label>
            <input value={editKey} onChange={e => setEditKey(e.target.value.trim())}
              placeholder="api_base_url"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Value</label>
            <input value={editValue} onChange={e => setEditValue(e.target.value)}
              placeholder="https://api.example.com"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowAdd(false); setEditKey(''); setEditValue(''); }}
              className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              取消
            </button>
            <button onClick={() => void handleSave()} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? '保存中…' : '保存配置'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
          <Plus className="w-4 h-4" />
          添加配置
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add HealthTab and LogsTab components**

Add these two components after `ConfigTab`, before `BrandProviderDetailPage`:

```typescript
function HealthTab({ bp }: { bp: BrandProviderDetail }) {
  const fmt = (ts: string | null) =>
    ts ? new Date(ts).toLocaleString() : '—';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-400 mb-1">Health Status</p>
          <p className={`text-lg font-bold ${HEALTH_COLORS[bp.health_status] ?? HEALTH_COLORS['UNKNOWN']}`}>
            {bp.health_status}
          </p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-400 mb-1">Last Checked</p>
          <p className="text-sm text-slate-700 dark:text-slate-200">{fmt(bp.health_checked_at)}</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-400 mb-1">Last Success</p>
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{fmt(bp.last_success_at)}</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-400 mb-1">Last Failed</p>
          <p className="text-sm text-rose-500 dark:text-rose-400">{fmt(bp.last_failed_at)}</p>
        </div>
      </div>
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-700 dark:text-amber-300">
        Health check 功能将在 MegaH5 集成（SPEC 2）期间开放。届时将支持主动检查端点：
        <code className="font-mono ml-1">POST /api/brands/{'{brand}'}/providers/{'{provider}'}/health-check</code>
      </div>
    </div>
  );
}

function LogsTab() {
  return (
    <div className="text-center py-16 text-slate-400">
      <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm font-medium">Provider 日志</p>
      <p className="text-xs mt-1">Provider 日志功能将在 Provider 集成完成后开放。</p>
      <p className="text-xs text-slate-300 dark:text-slate-600 mt-3">
        Future: brand_provider_logs table
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Replace placeholder tab content in BrandProviderDetailPage**

In `BrandProviderDetailPage`, find the three placeholder tab renders and replace them:

Replace:
```typescript
          {activeTab === 'config' && (
            <div className="text-center py-12 text-slate-400">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Config tab — 将在 Task 4 中实现。</p>
            </div>
          )}
          {activeTab === 'health' && (
            <div className="text-center py-12 text-slate-400">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Health tab — 将在 Task 4 中实现。</p>
            </div>
          )}
          {activeTab === 'logs' && (
            <div className="text-center py-12 text-slate-400">
              <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Logs tab — 将在 Task 4 中实现。</p>
            </div>
          )}
```

With:
```typescript
          {activeTab === 'config' && (
            <ConfigTab
              config={config}
              providerCode={providerCode}
              brandCode={brandCode}
              onSaved={load}
              showToast={showToast}
            />
          )}
          {activeTab === 'health' && <HealthTab bp={bp} />}
          {activeTab === 'logs'   && <LogsTab />}
```

- [ ] **Step 4: Add Legacy badge to gaming-platform page**

In `erp/src/app/(dashboard)/gaming-platform/page.tsx`, find the section header for the credentials editor in the right-side detail panel. It currently reads something like `// Credentials` or `Credentials` as a section title.

Search for the credentials section header (it will be a `<div>` or `<h3>` containing "Credentials" or "凭证"). Add a Legacy badge immediately next to or below the section title:

```tsx
{/* Legacy badge — to be removed after 918KISS migrates to brand_provider_credentials */}
<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
  Legacy · 918KISS Production
</span>
```

Do the same for the Config section. The exact insertion point depends on the current markup — read the file around the credentials/config section headers (search for "Credentials" or the variable `configRows`) to find the right location, then insert the badge inline next to the section title.

**Important:** Make the minimum possible change. Do NOT restructure any existing JSX. Only add the badge span.

- [ ] **Step 5: Verify TypeScript and tests**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx tsc --noEmit 2>&1 | grep -v node_modules | head -10
npx vitest run 2>&1 | tail -5
```

Expected: 0 new TypeScript errors. 501 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
git add "erp/src/app/(dashboard)/brand-center/[code]/providers/[providerCode]/page.tsx" \
        "erp/src/app/(dashboard)/gaming-platform/page.tsx"
git commit -m "feat(brand-center): Config/Health/Logs tabs complete; Legacy badge on Provider Registry credentials"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Brand Center — first-class ERP module (sidebar entry) | Task 1 |
| Brand List with provider count | Task 1 |
| New Brand modal | Task 1 |
| Brand Detail with provider list | Task 2 |
| Enable Provider modal (from gp_providers catalog) | Task 2 |
| Breadcrumb: Brand Center > [brand] > Providers > [provider] | Task 3 |
| Provider detail page header (name, code, status, env) | Task 3 |
| Tab layout (General, Credentials, Config, Health, Logs) | Task 3/4 |
| General Tab: status/wallet_type/environment/currency + PATCH | Task 3 |
| Credentials Tab: masked list + add/edit + template | Task 3 |
| Config Tab: list + add/edit + template | Task 4 |
| Health Tab: read-only fields from brand_providers | Task 4 |
| Logs Tab: placeholder | Task 4 |
| Credential templates hardcoded per provider code | Task 3 |
| Config templates hardcoded per provider code | Task 4 |
| Health check "coming in SPEC 2" message | Task 4 |
| Provider Registry Legacy badge on credentials/config | Task 4 |
| Read/write brand_provider_credentials / brand_provider_config only | All tasks |
| gp_credentials / gp_config never touched by new pages | All tasks |
| TypeScript zero new errors | All tasks |
| 501 tests remain green | All tasks |

### Placeholder Scan

Clean — all tabs contain complete, working code or explicit placeholder JSX (Logs tab placeholder is intentional per spec).

### Type Consistency

- `BrandProviderDetail` defined in Task 3, consumed by `GeneralTab`, `HealthTab`, and page header — same type throughout.
- `CredRow` / `ConfigRow` defined in Task 3, consumed by `CredentialsTab` / `ConfigTab` in Tasks 3/4.
- `getCredentialTemplate(code)` / `getConfigTemplate(code)` defined in Task 3 constants, called in Tasks 3/4.
- `showToast(msg: string, ok: boolean)` signature consistent across all call sites.
