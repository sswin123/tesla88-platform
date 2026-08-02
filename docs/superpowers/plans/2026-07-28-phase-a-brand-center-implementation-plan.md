# Phase A: Brand Center UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Brand Center UI module — a first-class ERP section where each Brand's Provider configurations (credentials, config, health, logs) are managed independently using the new SaaS `brand_provider_*` tables.

**Architecture:** All backend APIs are already complete. This plan is 100% frontend. Three new Next.js pages are created under `(dashboard)/brand-center/`. A shared component directory `erp/src/components/brand-center/` centralizes reusable pieces (StatusBadge, ProviderStatusBadge, EmptyState, LoadingState, PermissionDenied, ConfirmDialog, etc.). The sidebar gains a Brand Center group. The existing Gaming Platform page is lightly annotated with "Legacy" badges but NOT restructured.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, lucide-react, fetch API, `'use client'` pattern (same as gaming-platform/page.tsx and games-library/page.tsx).

## Global Constraints

- Do NOT touch: 918KISS adapter, game APIs, wallet logic, deposit/withdraw, auth, existing API contracts.
- Do NOT remove or break the existing Credentials/Config editors in `gaming-platform/page.tsx` — mark them Legacy only.
- All new pages use `'use client'` and the same Tailwind className patterns as existing pages.
- Permission guard: all Brand Center pages require `game.manage`. Fetch `/api/auth/me` and check `permissions` array.
- New pages only read/write `brand_provider_credentials` and `brand_provider_config`. Never touch `gp_credentials` or `gp_config`.
- TypeScript: zero new errors. Run `cd erp && npx tsc --noEmit` after each task.
- Vitest: 501 existing tests must remain green. Run `cd erp && npx vitest run` after each task.
- ESLint: run `cd erp && npx next lint` after each task — must pass (no new errors).
- Provider code always uppercase on all API calls (`.toUpperCase()`).
- No new database tables, no new API routes.
- Use status enum constants (not hardcoded strings) for provider status throughout.
- Shared components go in `erp/src/components/brand-center/` — do not define them inline if they are spec'd for reuse.
- The interaction model is: Create → Modal Dialog, Edit → Inline form (replaces row), Delete → ConfirmDialog.
- Credential value input: `type="password"`, `autoComplete="new-password"`.
- Legacy badge text: `"Legacy · 918KISS Production"` (amber pill).
- All timestamps displayed in locale format: `new Date(ts).toLocaleString()`.

## API Reference (all already implemented)

```
GET  /api/brands
     → Array<{ id, code, name, is_active, created_at, updated_at,
                provider_count?: number, brand_name?: string|null }>

POST /api/brands
     body: { code, name }
     → { ok: true, brand: {...} }  201
     409 → { error: "..." }  (duplicate code)

GET  /api/brands/[code]
     → { brand: { id, code, name, is_active, created_at, updated_at },
         settings: { brand_name, company_name }|null,
         providers: Array<{ id, provider_code, provider_name, provider_display_name,
                             status, wallet_type, environment, currency,
                             health_status, credential_count, config_count, updated_at }> }
     404 → not found

GET  /api/brands/[code]/providers
     → Array<{ id, provider_code, provider_name, provider_display_name,
                status, wallet_type, environment, currency,
                health_status, health_checked_at, last_success_at, last_failed_at,
                credential_count: number, config_count: number, updated_at }>

POST /api/brands/[code]/providers
     body: { provider_code, wallet_type?, environment?, currency? }
     → { ok: true, brand_provider: { id, brand_code, provider_code } }  201
     409 → already enabled

GET  /api/brands/[code]/providers/[providerCode]
     → { brand_provider: { id, status, wallet_type, environment, currency,
                            health_status, health_checked_at, last_success_at, last_failed_at,
                            created_at, updated_at, provider_code, provider_name,
                            provider_display_name, brand_code, brand_name },
         credentials: Array<{ key, is_encrypted, updated_at, updated_by_name, masked_value }>,
         config: Array<{ key, value, updated_at, updated_by_name }> }
     404 → not found

PATCH /api/brands/[code]/providers/[providerCode]
     body: { type: 'settings', status?, wallet_type?, environment?, currency? }
     body: { type: 'credential', key, value, encrypt?: boolean }
     body: { type: 'config', key, value }
     → { ok: true }

DELETE /api/brands/[code]/providers/[providerCode]
     → { ok: true }
     409 → still ACTIVE (must disable first)

GET /api/games/settings
    → Array<{ code, name, display_name, status, ... }>
```

## Shared Constants (used across all tasks)

Define in `erp/src/components/brand-center/constants.ts`:

```typescript
export const PROVIDER_STATUS = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  MAINTENANCE: 'MAINTENANCE',
  TESTING: 'TESTING',
} as const;
export type ProviderStatus = typeof PROVIDER_STATUS[keyof typeof PROVIDER_STATUS];

export const HEALTH_STATUS = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  DOWN: 'DOWN',
  UNKNOWN: 'UNKNOWN',
} as const;
export type HealthStatus = typeof HEALTH_STATUS[keyof typeof HEALTH_STATUS];

export const WALLET_TYPES = ['SEAMLESS', 'TRANSFER'] as const;
export const ENVIRONMENTS = ['PRODUCTION', 'SANDBOX'] as const;

// Provider credential templates — keys expected for each provider
// Used to calculate completion percentage
export const CREDENTIAL_TEMPLATES: Record<string, string[]> = {
  KISS918: ['username', 'password', 'api_url'],
  MEGAH5: ['api_key', 'secret', 'api_url'],
  PGSOFT: ['operator_token', 'secret_key'],
  JILI: ['api_key', 'agent_id'],
  CQ9: ['agent_token', 'agent_id', 'api_url'],
};

export const CONFIG_TEMPLATES: Record<string, string[]> = {
  KISS918: ['lobby_url', 'currency'],
  MEGAH5: ['lobby_url', 'currency', 'language'],
  PGSOFT: ['lobby_url', 'currency', 'language'],
  JILI: ['lobby_url', 'currency'],
  CQ9: ['lobby_url', 'currency', 'language'],
};
```

## File Structure

```
erp/src/
  components/
    sidebar.tsx                                       MODIFY (+6 lines: Store icon + NavGroup)
    brand-center/
      constants.ts                                    CREATE — status enums + templates
      StatusBadge.tsx                                 CREATE — brand is_active badge
      ProviderStatusBadge.tsx                         CREATE — provider status badge
      HealthBadge.tsx                                 CREATE — health status badge (icon+label)
      ProviderLogoAvatar.tsx                          CREATE — initials avatar, 28/36px sizes
      CompletionBar.tsx                               CREATE — 4px progress bar + percentage
      EmptyState.tsx                                  CREATE — professional empty state
      LoadingState.tsx                                CREATE — spinner + message
      PermissionDenied.tsx                            CREATE — 403 full-page state
      ConfirmDialog.tsx                               CREATE — modal confirmation dialog

  app/(dashboard)/
    brand-center/
      page.tsx                                        CREATE — brand list (~250 lines)
      [code]/
        page.tsx                                      CREATE — brand detail (~350 lines)
        providers/
          [providerCode]/
            page.tsx                                  CREATE — provider detail, 7 tabs (~700 lines)

  app/(dashboard)/gaming-platform/
    page.tsx                                          MODIFY — +4 lines: 2× Legacy badge
```

---

## Task 1: Sidebar Entry + Shared Components + Brand List Page

**Files:**
- Create: `erp/src/components/brand-center/constants.ts`
- Create: `erp/src/components/brand-center/StatusBadge.tsx`
- Create: `erp/src/components/brand-center/ProviderStatusBadge.tsx`
- Create: `erp/src/components/brand-center/HealthBadge.tsx`
- Create: `erp/src/components/brand-center/ProviderLogoAvatar.tsx`
- Create: `erp/src/components/brand-center/EmptyState.tsx`
- Create: `erp/src/components/brand-center/LoadingState.tsx`
- Create: `erp/src/components/brand-center/PermissionDenied.tsx`
- Create: `erp/src/components/brand-center/ConfirmDialog.tsx`
- Create: `erp/src/components/brand-center/CompletionBar.tsx`
- Modify: `erp/src/components/sidebar.tsx`
- Create: `erp/src/app/(dashboard)/brand-center/page.tsx`

**Context:**
This is Task 1 of 4 in Phase A Brand Center UI. It establishes all shared components that Tasks 2, 3, 4 will import, adds the sidebar navigation, and builds the Brand List page.

**Design spec key decisions:**
- Brand List page shows brand cards in a grid/list. Each card: brand name (14px 600), code chip (mono slate bg), status badge (Active/Inactive), provider count ("📦 N Providers"), chevron right.
- Search: client-side filter by name/code/brand_name. Filter dropdown: All/Active/Inactive.
- New Brand modal: code field (required, auto-uppercase, max 10 chars), name field (required). POST /api/brands. 409 → inline error in modal.
- Toast: fixed bottom-right, 3s auto-dismiss. Green for success, red for error.
- PermissionDenied: full-page state shown when /api/brands returns 401/403.
- Empty state when no brands: icon + title "No Brands Yet" + subtitle + "New Brand" button.
- Empty state when search has no match: icon + "No brands match your search" + clear button.

**Shared Components Spec:**

`constants.ts` — export PROVIDER_STATUS, HEALTH_STATUS, WALLET_TYPES, ENVIRONMENTS, CREDENTIAL_TEMPLATES, CONFIG_TEMPLATES as shown in the plan header.

`StatusBadge.tsx` — props: `{ isActive: boolean }`. Renders: `is_active=true` → green "Active" pill; `false` → slate "Inactive" pill. Class: `text-xs font-medium px-2 py-0.5 rounded-full`.

`ProviderStatusBadge.tsx` — props: `{ status: string }`. Colors: ACTIVE=green, DISABLED=slate, MAINTENANCE=amber, TESTING=blue, unknown=gray. Same pill style.

`HealthBadge.tsx` — props: `{ status: string }`. Uses lucide-react icons: HEALTHY=CheckCircle(green), DEGRADED=AlertTriangle(amber), DOWN=XCircle(red), UNKNOWN=HelpCircle(slate). Renders icon (16px) + label text. Inline flex.

`ProviderLogoAvatar.tsx` — props: `{ providerCode: string, size?: 'sm'|'md' }`. sm=28px, md=36px. Phase A: always renders initials (first 2 chars of code, uppercase). Background: slate-200 dark:slate-700. Text: slate-600 dark:slate-300.

`CompletionBar.tsx` — props: `{ percent: number | null, size?: 'sm'|'md' }`. If percent is null, renders nothing. Bar: h-1 (4px) rounded. Colors: 0-50%=red, 51-79%=amber, 80-99%=yellow, 100%=green. Shows percentage text beside bar. sm: bar only with tooltip. md: bar + "NN% complete" text.

`EmptyState.tsx` — props: `{ icon: LucideIcon, title: string, description?: string, action?: { label: string, onClick: () => void } }`. Centered, py-12, icon in circle bg, title 16px 600, description 14px muted, optional button.

`LoadingState.tsx` — props: `{ message?: string }`. Centered spinner (Loader2 with animate-spin) + optional message.

`PermissionDenied.tsx` — props: `{ message?: string }`. Full-page state: Lock icon, "Access Denied", description, optional back link.

`ConfirmDialog.tsx` — props: `{ open: boolean, title: string, description: string, confirmLabel?: string, confirmVariant?: 'danger'|'default', onConfirm: () => void, onCancel: () => void, saving?: boolean }`. Modal overlay + card. Default confirmLabel="Confirm". danger variant = red button.

**Sidebar modification:**
Read `erp/src/components/sidebar.tsx` first to understand the NavGroup pattern. Add a Brand Center group with Store icon from lucide-react. Position it before the Control Center group (or after Gaming Platform — read the file to determine the correct position). The nav item should require `game.manage` permission.

**Brand List page (`brand-center/page.tsx`) implementation:**

```typescript
// Types
type BrandRow = {
  id: number; code: string; name: string; is_active: boolean;
  created_at: string; updated_at: string;
  provider_count?: number; brand_name?: string | null;
};

// State: brands, loading, error, search, filter, showNewModal, toast
// On mount: fetch /api/brands → set brands. 401/403 → show PermissionDenied.

// Filtered brands computed inline: filter by search (name/code/brand_name) and status filter.

// NewBrandModal: controlled by showNewModal boolean.
//   - code field: onChange → value.toUpperCase(), max 10 chars
//   - name field: required
//   - POST /api/brands body: { code: code.trim(), name: name.trim() }
//   - 201 → close modal + setToast success + reload brands
//   - 409 → setModalError(resp.error)
//   - other error → setToast error

// BrandCard: Link to /brand-center/[brand.code]
//   - ProviderLogoAvatar size="sm" providerCode={brand.code}
//   - brand.name (14px 600)
//   - code chip: mono text, slate-100 dark:slate-800 bg, rounded
//   - StatusBadge isActive={brand.is_active}
//   - brand.brand_name line if set (12px muted)
//   - "📦 {brand.provider_count ?? 0} Providers" (12px muted)
//   - ChevronRight icon (16px, muted, ml-auto)
```

**Step-by-step:**

- [ ] **Step 1: Read existing sidebar to understand NavGroup pattern**

  Run: `cat erp/src/components/sidebar.tsx | head -100`

- [ ] **Step 2: Read existing page for Tailwind className patterns**

  Run: `head -80 erp/src/app/\(dashboard\)/gaming-platform/page.tsx`

- [ ] **Step 3: Create `erp/src/components/brand-center/constants.ts`**

  Use the PROVIDER_STATUS, HEALTH_STATUS, WALLET_TYPES, ENVIRONMENTS, CREDENTIAL_TEMPLATES, CONFIG_TEMPLATES from the plan header above. Export all.

- [ ] **Step 4: Create all 9 shared components**

  Create each of the 9 component files in `erp/src/components/brand-center/`:
  `StatusBadge.tsx`, `ProviderStatusBadge.tsx`, `HealthBadge.tsx`, `ProviderLogoAvatar.tsx`, `CompletionBar.tsx`, `EmptyState.tsx`, `LoadingState.tsx`, `PermissionDenied.tsx`, `ConfirmDialog.tsx`

- [ ] **Step 5: Modify sidebar.tsx — add Brand Center nav group**

  Add a `Store` icon import from lucide-react (or appropriate icon). Add the Brand Center NavGroup. The group requires `game.manage` permission (follow existing pattern for permission-based nav filtering).

- [ ] **Step 6: Create `erp/src/app/(dashboard)/brand-center/page.tsx`**

  Implement BrandCenterPage with all states (loading, permission denied, empty-no-brands, empty-no-match, normal), NewBrandModal, BrandCard, SearchBar, Toast.

- [ ] **Step 7: Run TypeScript check**

  Run: `cd erp && npx tsc --noEmit 2>&1 | grep -v node_modules | head -30`
  Expected: 0 new errors.

- [ ] **Step 8: Run lint**

  Run: `cd erp && npx next lint 2>&1 | tail -10`
  Expected: no new errors.

- [ ] **Step 9: Run test suite**

  Run: `cd erp && npx vitest run 2>&1 | tail -10`
  Expected: 501 tests pass.

- [ ] **Step 10: Commit**

  ```bash
  cd /Users/hang/Downloads/Test/telegram-member-bot
  git add erp/src/components/brand-center/ erp/src/components/sidebar.tsx erp/src/app/\(dashboard\)/brand-center/
  git commit -m "feat(brand-center): Task 1 — shared components + sidebar + Brand List page"
  ```

---

## Task 2: Brand Detail Page

**Files:**
- Create: `erp/src/app/(dashboard)/brand-center/[code]/page.tsx`

**Context:**
Task 2 of 4. Depends on Task 1's shared components being available. Builds the Brand Detail page which shows brand overview + provider list.

**Design spec key decisions:**
- Breadcrumb: clickable `← Brand Center` link (Link component) + `›` separator + `CODE` (muted text).
- Brand overview card: Store icon (48px, blue bg), brand name (20px 700), code chip, StatusBadge, settings line (brand_name if set), created date (12px muted), Refresh button.
- Provider list section header: "Providers (N)" + "Enable Provider" button (opens EnableProviderModal).
- Provider rows: Link to `/brand-center/[code]/providers/[providerCode]`. Contains: health dot (6px circle, colored by health_status), ProviderLogoAvatar size="sm", provider display name + code chip + ProviderStatusBadge, config counts ("🔑 N  ⚙ N"), CompletionBar, ChevronRight.
- Health dot colors: HEALTHY=green, DEGRADED=amber, DOWN=red, UNKNOWN=slate.
- CompletionBar: computed using calcCompletion(providerCode, credentialCount, configCount) — see formula below.
- Empty provider list: dashed border EmptyState ("No providers enabled yet. Enable a provider to get started.").
- EnableProviderModal: dropdown of providers from GET /api/games/settings filtered to exclude already-enabled codes. Selects: wallet_type (SEAMLESS/TRANSFER), environment (PRODUCTION/SANDBOX). POST /api/brands/[code]/providers → close + toast + reload.

**Completion calculation (define at top of file):**
```typescript
import { CREDENTIAL_TEMPLATES, CONFIG_TEMPLATES } from '@/components/brand-center/constants';

function calcCompletion(
  providerCode: string,
  credentialCount: number,
  configCount: number,
): number | null {
  const upper = providerCode.toUpperCase();
  const credTemplate = CREDENTIAL_TEMPLATES[upper] ?? [];
  const cfgTemplate = CONFIG_TEMPLATES[upper] ?? [];
  const total = credTemplate.length + cfgTemplate.length;
  if (total === 0) return null;
  const filled = Math.min(credentialCount, credTemplate.length)
               + Math.min(configCount, cfgTemplate.length);
  return Math.round((filled / total) * 100);
}
```

**Types:**
```typescript
type Brand = { id: number; code: string; name: string; is_active: boolean; created_at: string; updated_at: string; };
type BrandSettings = { brand_name?: string; company_name?: string; } | null;
type BrandProvider = {
  id: number; provider_code: string; provider_name: string; provider_display_name: string;
  status: string; wallet_type: string; environment: string; currency: string;
  health_status: string; credential_count: number; config_count: number; updated_at: string;
};
```

**State:** `brand`, `settings`, `providers`, `loading`, `showEnableModal`, `toast`.

**EnableProviderModal internal state:** `catalog` (from /api/games/settings, fetched when modal opens), `selected`, `walletType`, `environment`, `saving`, `error`.

**Step-by-step:**

- [ ] **Step 1: Create `erp/src/app/(dashboard)/brand-center/[code]/page.tsx`**

  Import shared components from `@/components/brand-center/` (StatusBadge, ProviderStatusBadge, HealthBadge, ProviderLogoAvatar, CompletionBar, EmptyState, LoadingState, PermissionDenied, ConfirmDialog, PROVIDER_STATUS, CREDENTIAL_TEMPLATES, CONFIG_TEMPLATES).
  Implement BrandDetailPage with:
  - useEffect to load /api/brands/[code] on mount
  - calcCompletion function
  - Breadcrumb (← Brand Center link)
  - BrandOverviewCard
  - ProviderListSection with ProviderRow list
  - EnableProviderModal
  - Toast

  The page params come from Next.js route: `export default async function Page({ params }...)`. Since it's a client component, use `'use client'` + `useParams()` hook from 'next/navigation' to get `code`.

  ```typescript
  'use client';
  import { useParams, useRouter } from 'next/navigation';
  
  export default function BrandDetailPage() {
    const params = useParams();
    const code = (params.code as string).toUpperCase();
    // ...
  }
  ```

- [ ] **Step 2: Run TypeScript check**

  Run: `cd erp && npx tsc --noEmit 2>&1 | grep -v node_modules | head -30`

- [ ] **Step 3: Run lint**

  Run: `cd erp && npx next lint 2>&1 | tail -10`

- [ ] **Step 4: Run test suite**

  Run: `cd erp && npx vitest run 2>&1 | tail -10`
  Expected: 501 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/hang/Downloads/Test/telegram-member-bot
  git add erp/src/app/\(dashboard\)/brand-center/\[code\]/
  git commit -m "feat(brand-center): Task 2 — Brand Detail page with provider list"
  ```

---

## Task 3: Provider Detail — Shell + General Tab + Credentials Tab

**Files:**
- Create: `erp/src/app/(dashboard)/brand-center/[code]/providers/[providerCode]/page.tsx`

**Context:**
Task 3 of 4. Depends on Task 1 shared components. Builds the Provider Detail page shell: 7-tab bar, header card with overflow menu, General Tab (settings form), and Credentials Tab (add/edit/delete). Config/Health/Logs/Stats/Audit tabs get placeholder EmptyState content for now (replaced in Task 4).

**Tabs definition (7 tabs):**
```typescript
const TABS = [
  { id: 'general',       label: 'General',       icon: Settings2 },
  { id: 'credentials',   label: 'Credentials',   icon: Key },
  { id: 'configuration', label: 'Configuration', icon: SlidersHorizontal },
  { id: 'health',        label: 'Health',        icon: ShieldCheck },
  { id: 'logs',          label: 'Logs',          icon: ScrollText },
  { id: 'statistics',    label: 'Statistics',    icon: BarChart3 },
  { id: 'audit',         label: 'Audit',         icon: ClipboardList },
] as const;
type Tab = typeof TABS[number]['id'];
```

**Provider Header Card:**
- ProviderLogoAvatar size="md" (36px)
- provider_display_name (20px 700)
- Code chip (mono)
- ProviderStatusBadge
- "Brand: [brand_code] — [brand_name]" (12px muted)
- Meta line: wallet_type · environment · currency
- HealthBadge
- CompletionPill: if percent >= 100 → "✓ 100%" green; if percent > 0 → "⚠ NN%" amber; null → nothing
- Refresh button (reloads data)
- OverflowMenu (⋯) button

**OverflowMenu items:**
- Reload — calls load() function
- Disable — PATCH {type:'settings', status:'DISABLED'}, only shown when status=ACTIVE
- Separator
- Remove Provider — opens RemoveProviderModal (danger, red text)
- Export Config — disabled (gray), "(coming soon)" tooltip

**OverflowMenu implementation:**
- Positioned relative to the ⋯ button (absolute dropdown)
- Closed by clicking outside (useEffect with document mousedown listener)
- State: `showOverflow: boolean`

**GeneralTab:**
- 2×2 grid of labeled selects:
  - Status: [ACTIVE, DISABLED, MAINTENANCE, TESTING]
  - Wallet Type: [SEAMLESS, TRANSFER]
  - Environment: [PRODUCTION, SANDBOX]
  - Currency: text input (uppercase, max 3)
- Warning callout shown when selecting DISABLED while current is ACTIVE: "Setting to DISABLED will stop all player traffic."
- Save button: calls PATCH {type:'settings', status, wallet_type, environment, currency}. Disabled while saving.
- Timestamps row: "Created: [date]  Last updated: [date]" (12px muted)

**CredentialsTab:**
- Template bar: for each key in CREDENTIAL_TEMPLATES[providerCode] ?? [], render a chip.
  - If key exists in credentials array → green chip with ✓
  - Otherwise → slate chip with key name (clicking opens AddCredentialModal with key pre-filled)
- Credential list: CredentialRow for each credential
  - Default (view) mode: key name, masked value (●●●●), EncryptedIcon if is_encrypted, "Edit" link, OverflowMenu (→ delete confirm)
  - Edit mode (when editingKey === key): InlineEditForm replaces the row
    - Value input (type="password", autoComplete="new-password"), Encrypt checkbox
    - Cancel (restores row) + Update (PATCH credential)
- AddCredentialModal (Create pattern):
  - Key input (text), Value input (type="password", autoComplete="new-password"), Encrypt checkbox
  - POST via PATCH {type:'credential', key, value, encrypt}
  - On success: close modal + reload + toast
- Delete credential: uses ConfirmDialog (from shared components).
  - PATCH {type:'credential', key, value:''} is NOT the delete — there's no credential delete API. Instead, note that the PATCH credential type is an upsert. For delete, the user should clear/overwrite or we hide the option. 
  - **IMPORTANT**: Looking at the API, there's no DELETE for individual credentials. The PATCH {type:'credential'} is an upsert. So the "Remove" overflow item should instead PATCH the credential with value='[REMOVED]' and show a toast explaining. Or check if a DELETE route exists.
  - **Decision**: Show a "Remove" option in the overflow that opens ConfirmDialog, then does PATCH {type:'credential', key, value: '', encrypt: false}. The credential will remain with empty value. Show toast: "Credential cleared (key retained)." This is the safest approach given no DELETE endpoint.
  - Actually, re-read the plan: CredentialRow overflow → "RemoveCredential (Confirmation Dialog)". Since there's no delete endpoint, implement it as clearing the value via PATCH. If the API in practice rejects empty string, document this limitation.

**RemoveProviderModal:** Uses ConfirmDialog component.
- Title: "Remove Provider"
- Description: "This will permanently remove [PROVIDER_CODE] from [BRAND_CODE]. All credentials and configuration will be deleted. This cannot be undone."
- Confirm button: red/danger variant, "Remove Provider"
- On confirm: DELETE /api/brands/[code]/providers/[providerCode]
  - 409 → show error in dialog: "Cannot remove: provider is ACTIVE. Set status to DISABLED first."
  - 200 → navigate to /brand-center/[code] + show toast

**CompletionPill (defined in Provider Detail page):**
```typescript
function calcCompletion(providerCode: string, creds: CredRow[], cfgs: CfgRow[]) {
  const upper = providerCode.toUpperCase();
  const credTemplate = CREDENTIAL_TEMPLATES[upper] ?? [];
  const cfgTemplate = CONFIG_TEMPLATES[upper] ?? [];
  const total = credTemplate.length + cfgTemplate.length;
  if (total === 0) return null;
  const credKeys = new Set(creds.map(c => c.key));
  const cfgKeys = new Set(cfgs.map(c => c.key));
  const filled = credTemplate.filter(k => credKeys.has(k)).length
               + cfgTemplate.filter(k => cfgKeys.has(k)).length;
  return Math.round((filled / total) * 100);
}
```

**Types:**
```typescript
type BrandProviderDetail = {
  id: number; status: string; wallet_type: string; environment: string; currency: string;
  health_status: string; health_checked_at: string|null; last_success_at: string|null;
  last_failed_at: string|null; created_at: string; updated_at: string;
  provider_code: string; provider_name: string; provider_display_name: string;
  brand_code: string; brand_name: string;
};
type CredRow = { key: string; is_encrypted: boolean; updated_at: string; updated_by_name: string|null; masked_value: string; };
type CfgRow = { key: string; value: string; updated_at: string; updated_by_name: string|null; };
```

**Page-level state:** `bp`, `credentials`, `config`, `loading`, `activeTab`, `showOverflow`, `showRemoveModal`, `toast`.

**Tab-level state (local to tab function components):**
- GeneralTab props: `bp`, `onSave(fields) => Promise<void>`, `onReload(): void`
- CredentialsTab props: `providerCode`, `credentials`, `onReload(): void`

**Step-by-step:**

- [ ] **Step 1: Read existing gaming-platform/page.tsx for credential/config UI patterns**

  Run: `grep -n "credential\|Credential\|is_encrypted\|masked" erp/src/app/\(dashboard\)/gaming-platform/page.tsx | head -40`

- [ ] **Step 2: Create the provider detail page file**

  Create `erp/src/app/(dashboard)/brand-center/[code]/providers/[providerCode]/page.tsx`.

  Use `useParams()` to get `code` and `providerCode`. Both `.toUpperCase()`.

  Implement in this order within the single file:
  1. All type definitions
  2. calcCompletion function
  3. GeneralTab component function
  4. CredentialRow component function (default view + edit modes)
  5. AddCredentialModal component function
  6. CredentialsTab component function
  7. Placeholder tab components (ConfigurationTab, HealthTab, LogsTab, StatisticsTab, AuditTab) — each returns an EmptyState with appropriate message
  8. OverflowMenu component function
  9. RemoveProviderModal component (uses ConfirmDialog)
  10. BrandProviderDetailPage main component

- [ ] **Step 3: Run TypeScript check**

  Run: `cd erp && npx tsc --noEmit 2>&1 | grep -v node_modules | head -30`

- [ ] **Step 4: Run lint**

  Run: `cd erp && npx next lint 2>&1 | tail -10`

- [ ] **Step 5: Run test suite**

  Run: `cd erp && npx vitest run 2>&1 | tail -10`
  Expected: 501 tests pass.

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/hang/Downloads/Test/telegram-member-bot
  git add erp/src/app/\(dashboard\)/brand-center/\[code\]/providers/
  git commit -m "feat(brand-center): Task 3 — Provider Detail shell + General + Credentials tabs"
  ```

---

## Task 4: Configuration Tab + Health Tab + Remaining Tabs + Legacy Badge

**Files:**
- Modify: `erp/src/app/(dashboard)/brand-center/[code]/providers/[providerCode]/page.tsx`
- Modify: `erp/src/app/(dashboard)/gaming-platform/page.tsx`

**Context:**
Task 4 of 4. Final task. Replaces placeholder tab content in the Provider Detail page with real implementations, and adds Legacy badges to the Gaming Platform page.

**ConfigurationTab:**
Mirror of CredentialsTab but for config values (non-secret, plain text).
- Template bar: chips for each key in CONFIG_TEMPLATES[providerCode] ?? []. Green if key set, slate if missing (click to add with key pre-filled).
- ConfigRow (inline): key name, value text (truncate if >40 chars), "Edit" link → inline edit. Overflow → delete (ConfirmDialog).
  - Config delete: same issue as credentials — no DELETE endpoint. PATCH {type:'config', key, value:''} to clear. Toast: "Config value cleared."
- AddConfigModal: key input (text), value input (text — NOT password), no encrypt option.
- InlineEditForm for config: value input only (key is read-only / shown as label). Update button + Cancel.

**HealthTab (replaces EmptyState placeholder):**
- 2×2 stat cards:
  - Health Status: large icon (48px) + text, colored by health_status. Use HealthBadge styles.
  - Last Checked: `bp.health_checked_at ? new Date(bp.health_checked_at).toLocaleString() : '—'`
  - Last Success: `bp.last_success_at ? new Date(bp.last_success_at).toLocaleString() : '—'`
  - Last Failed: `bp.last_failed_at ? new Date(bp.last_failed_at).toLocaleString() : '—'`
- Future banner: amber callout below the cards: "Automated health monitoring will be available after provider integration is complete."

**LogsTab (professional EmptyState — replace placeholder):**
EmptyState with:
- icon: `ScrollText`
- title: "No Log Data"
- description: "Provider activity logs will be available after the provider is integrated and active."

**StatisticsTab (professional EmptyState — replace placeholder):**
EmptyState with:
- icon: `BarChart3`
- title: "No Statistics"
- description: "Traffic statistics will appear once the provider is receiving player activity."

**AuditTab (professional EmptyState — replace placeholder):**
EmptyState with:
- icon: `ClipboardList`
- title: "No Audit Records"
- description: "Configuration change history will be recorded once provider operations begin."

**Legacy Badge in gaming-platform/page.tsx:**

Find the credentials section header and config section header in `gaming-platform/page.tsx`. Add an amber legacy badge NEXT TO (not replacing) each section header. The badge is inline:

```tsx
<span className="ml-2 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2 py-0.5 rounded-full">
  Legacy · 918KISS Production
</span>
```

**CRITICAL**: Only add the badge spans. Do NOT modify any logic, state, or structure of gaming-platform/page.tsx. The 918KISS production flow must continue working identically.

**Step-by-step:**

- [ ] **Step 1: Read Provider Detail page to find placeholder tab implementations**

  Run: `grep -n "EmptyState\|placeholder\|ConfigurationTab\|HealthTab\|LogsTab\|StatisticsTab\|AuditTab" erp/src/app/\(dashboard\)/brand-center/\[code\]/providers/\[providerCode\]/page.tsx`

- [ ] **Step 2: Replace ConfigurationTab placeholder with full implementation**

- [ ] **Step 3: Replace HealthTab placeholder with 2×2 stat cards + future banner**

- [ ] **Step 4: Replace LogsTab, StatisticsTab, AuditTab with professional EmptyStates**

  (These replace EmptyState placeholders with correctly-specified EmptyState calls.)

- [ ] **Step 5: Read gaming-platform/page.tsx to find credentials/config section headers**

  Run: `grep -n "Credentials\|Config\|credentials\|config" erp/src/app/\(dashboard\)/gaming-platform/page.tsx | grep -i "header\|section\|title\|h[234]" | head -20`

- [ ] **Step 6: Add Legacy badges to gaming-platform/page.tsx**

  Two badge spans only. No other changes.

- [ ] **Step 7: Run TypeScript check**

  Run: `cd erp && npx tsc --noEmit 2>&1 | grep -v node_modules | head -30`

- [ ] **Step 8: Run lint**

  Run: `cd erp && npx next lint 2>&1 | tail -10`

- [ ] **Step 9: Run full test suite**

  Run: `cd erp && npx vitest run 2>&1 | tail -10`
  Expected: 501 tests pass.

- [ ] **Step 10: Verify navigation flow (manual check description only)**

  Describe what was manually verified or what smoke tests were run.

- [ ] **Step 11: Commit**

  ```bash
  cd /Users/hang/Downloads/Test/telegram-member-bot
  git add erp/src/app/\(dashboard\)/brand-center/\[code\]/providers/\[providerCode\]/page.tsx
  git add erp/src/app/\(dashboard\)/gaming-platform/page.tsx
  git commit -m "feat(brand-center): Task 4 — Config/Health tabs + professional empty states + Legacy badge"
  ```
