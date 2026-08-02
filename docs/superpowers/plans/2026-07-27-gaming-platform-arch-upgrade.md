# Gaming Platform Architecture Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Create/Delete/Duplicate to Provider Registry and add `name_zh`/`name_en` bilingual name fields to Game Registry, without touching any existing gaming logic.

**Architecture:** The enterprise gaming framework (`gp_providers`, `gp_credentials`, `gp_config`, `gp_games`) is already complete — `/gaming-platform/page.tsx` is a full-featured Provider Registry and `/gaming-platform/games-library/page.tsx` is a full-featured Game Registry. This plan fills the four remaining gaps: (1) no way to *create* a provider from the ERP, (2) no delete endpoint, (3) no duplicate endpoint, (4) no bilingual game name fields.

**Tech Stack:** Next.js 14 App Router, TypeScript, PostgreSQL (`pool.query` pattern — no ORM), Tailwind CSS, Lucide icons.

## Global Constraints

- **NEVER modify:** 918KISS adapter logic, any wallet/deposit/withdraw flows, authentication, registration, receipt upload/viewer, Docker, nginx, or existing API contracts.
- **Backward compatibility:** All existing `GET`/`PATCH` endpoints on `/api/games/settings/[code]` remain unchanged. The `DELETE` is new. The `POST` is added to the existing `route.ts`.
- Permission guard on all new endpoints: `requirePermission('game.manage')` for list/create/delete; `requirePermission('game.manage')` for duplicate.
- Credential values are **never** copied during Duplicate — too sensitive and environment-specific.
- `tsc --noEmit` must pass after each task (run from `erp/` directory).
- No new npm packages.

---

## File Map

| Status | File | Change |
|--------|------|--------|
| Create | `erp/migrations/085_gp_games_i18n_names.sql` | Add `name_zh`, `name_en` columns |
| Modify | `erp/src/lib/providers/types/game.types.ts` | Add `name_zh?`, `name_en?` to `GameRecord` and `GameListItem` |
| Modify | `erp/src/lib/providers/repositories/GameRepository.ts` | `upsertBatch()` handles new columns |
| Modify | `erp/src/app/api/games/library/[id]/route.ts` | Add `name_zh`, `name_en` to `ALLOWED_FIELDS` |
| Modify | `erp/src/app/api/games/settings/route.ts` | Add `POST` handler (create provider) |
| Modify | `erp/src/app/api/games/settings/[code]/route.ts` | Add `DELETE` handler |
| Create | `erp/src/app/api/games/settings/[code]/duplicate/route.ts` | `POST` handler — clone provider + config |
| Modify | `erp/src/app/(dashboard)/gaming-platform/page.tsx` | New Provider modal, delete button, duplicate button |
| Modify | `erp/src/app/(dashboard)/gaming-platform/games-library/page.tsx` | Add `name_zh`/`name_en` to `GameRow` type and `EditGameDialog` |

---

### Task 1: DB Migration — `name_zh` and `name_en` on `gp_games`

**Files:**
- Create: `erp/migrations/085_gp_games_i18n_names.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `gp_games.name_zh VARCHAR(200)` and `gp_games.name_en VARCHAR(200)`, both nullable

- [ ] **Step 1: Write the migration file**

```sql
-- erp/migrations/085_gp_games_i18n_names.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 085: Bilingual Game Names
--
-- Adds name_zh (Chinese) and name_en (English) to gp_games for the ERP
-- Game Registry. Both are optional admin overrides; synced games continue to
-- use the provider's native `name` field until an admin sets these.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE gp_games
  ADD COLUMN IF NOT EXISTS name_zh VARCHAR(200),   -- Chinese display name (admin override)
  ADD COLUMN IF NOT EXISTS name_en VARCHAR(200);   -- English display name (admin override)
```

- [ ] **Step 2: Apply the migration**

```bash
cd /path/to/project
docker compose exec migrate psql "$DATABASE_URL" -f /migrations/085_gp_games_i18n_names.sql
```

Or if running migrations locally:
```bash
psql "$DATABASE_URL" -f erp/migrations/085_gp_games_i18n_names.sql
```

Expected output: `ALTER TABLE`

- [ ] **Step 3: Verify columns exist**

```bash
psql "$DATABASE_URL" -c "\d gp_games" | grep -E "name_zh|name_en"
```

Expected: two rows showing `name_zh | character varying(200)` and `name_en | character varying(200)`

- [ ] **Step 4: Commit**

```bash
git add erp/migrations/085_gp_games_i18n_names.sql
git commit -m "feat(db): add name_zh, name_en columns to gp_games"
```

---

### Task 2: Backend Types + Repository + API Allowlist

Add `name_zh` / `name_en` to the `GameRecord` type, the `GameListItem` type, the `GameRepository.upsertBatch()` method, and the library PATCH allowlist.

**Files:**
- Modify: `erp/src/lib/providers/types/game.types.ts`
- Modify: `erp/src/lib/providers/repositories/GameRepository.ts`
- Modify: `erp/src/app/api/games/library/[id]/route.ts`

**Interfaces:**
- Consumes: Migration 085 (columns exist in DB)
- Produces:
  - `GameRecord.name_zh: string | null`
  - `GameRecord.name_en: string | null`
  - `GameListItem.name_zh?: string | null`
  - `GameListItem.name_en?: string | null`
  - `PATCH /api/games/library/[id]` accepts `name_zh` and `name_en`

- [ ] **Step 1: Update `game.types.ts`**

Open `erp/src/lib/providers/types/game.types.ts`. Find the `GameRecord` interface and add two fields after `name`:

```typescript
/** A game record as stored in gp_games. */
export interface GameRecord {
  id: number;
  provider_id: number;
  game_code: string;
  name: string;
  name_zh: string | null;   // ← add
  name_en: string | null;   // ← add
  game_type: GameType;
  sub_type: string | null;
  icon_url: string | null;
  banner_url: string | null;
  is_active: boolean;
  is_hot: boolean;
  is_new: boolean;
  is_maintenance: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  synced_at: string;
  created_at: string;
  updated_at: string;
}
```

Find the `GameListItem` interface and add two optional fields after `name`:

```typescript
/** Minimal game data returned by a provider's game-list API. */
export interface GameListItem {
  game_code: string;
  name: string;
  name_zh?: string | null;   // ← add
  name_en?: string | null;   // ← add
  game_type: GameType;
  sub_type?: string | null;
  icon_url?: string | null;
  banner_url?: string | null;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
}
```

- [ ] **Step 2: Update `GameRepository.upsertBatch()`**

Open `erp/src/lib/providers/repositories/GameRepository.ts`. Replace the `upsertBatch` method with this version that handles the two new columns:

```typescript
async upsertBatch(
  providerId: number,
  games: GameListItem[],
): Promise<{ inserted: number; updated: number }> {
  if (games.length === 0) return { inserted: 0, updated: 0 };

  let inserted = 0;
  let updated = 0;

  for (const game of games) {
    const { rowCount, rows } = await pool.query<{ xmax: string }>(
      `INSERT INTO gp_games
         (provider_id, game_code, name, name_zh, name_en, game_type, sub_type, icon_url, banner_url,
          is_active, metadata, synced_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
       ON CONFLICT (provider_id, game_code) DO UPDATE
       SET name       = EXCLUDED.name,
           name_zh    = COALESCE(EXCLUDED.name_zh, gp_games.name_zh),
           name_en    = COALESCE(EXCLUDED.name_en, gp_games.name_en),
           game_type  = EXCLUDED.game_type,
           sub_type   = EXCLUDED.sub_type,
           icon_url   = EXCLUDED.icon_url,
           banner_url = EXCLUDED.banner_url,
           is_active  = EXCLUDED.is_active,
           metadata   = EXCLUDED.metadata,
           synced_at  = NOW(),
           updated_at = NOW()
       RETURNING (xmax = 0) AS is_insert`,
      [
        providerId,
        game.game_code,
        game.name,
        game.name_zh ?? null,
        game.name_en ?? null,
        game.game_type,
        game.sub_type ?? null,
        game.icon_url ?? null,
        game.banner_url ?? null,
        game.is_active ?? true,
        JSON.stringify(game.metadata ?? {}),
      ],
    );

    if (rowCount && rowCount > 0) {
      if (rows[0]?.xmax === '0') inserted++;
      else updated++;
    }
  }

  return { inserted, updated };
}
```

Note: `COALESCE(EXCLUDED.name_zh, gp_games.name_zh)` means syncs preserve admin-entered Chinese/English names even when the provider API does not supply them.

- [ ] **Step 3: Update `ALLOWED_FIELDS` in `games/library/[id]/route.ts`**

Open `erp/src/app/api/games/library/[id]/route.ts`. Find the `ALLOWED_FIELDS` object (around line 21) and add two entries:

```typescript
const ALLOWED_FIELDS: Record<string, string> = {
  name:             'name',
  name_zh:          'name_zh',     // ← add
  name_en:          'name_en',     // ← add
  display_name:     'display_name',
  description:      'description',
  category:         'category',
  subcategory:      'subcategory',
  launch_mode:      'launch_mode',
  import_mode:      'import_mode',
  icon_url:         'icon_url',
  thumbnail_url:    'thumbnail_url',
  banner_url:       'banner_url',
  visible:          'visible',
  featured:         'featured',
  recommended:      'recommended',
  is_active:        'is_active',
  is_hot:           'is_hot',
  is_new:           'is_new',
  is_maintenance:   'is_maintenance',
  desktop_supported:'desktop_supported',
  mobile_supported: 'mobile_supported',
  sort_order:       'sort_order',
  metadata:         'metadata',
};
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (no errors).

- [ ] **Step 5: Commit**

```bash
git add erp/src/lib/providers/types/game.types.ts \
        erp/src/lib/providers/repositories/GameRepository.ts \
        "erp/src/app/api/games/library/[id]/route.ts"
git commit -m "feat(games): add name_zh, name_en to GameRecord, upsertBatch, and library PATCH"
```

---

### Task 3: Provider CRUD APIs — Create, Delete, Duplicate

Add three new API handlers. Create and Delete live in existing route files; Duplicate gets its own file.

**Files:**
- Modify: `erp/src/app/api/games/settings/route.ts` — add `POST` handler
- Modify: `erp/src/app/api/games/settings/[code]/route.ts` — add `DELETE` handler
- Create: `erp/src/app/api/games/settings/[code]/duplicate/route.ts`

**Interfaces:**
- Consumes: existing `gp_providers`, `gp_config`, `gp_credentials`, `requirePermission`
- Produces:
  - `POST /api/games/settings` → `{ ok: true, code: string }`
  - `DELETE /api/games/settings/[code]` → `{ ok: true }` or `{ error: string }` (409 if games exist)
  - `POST /api/games/settings/[code]/duplicate` → `{ ok: true, new_code: string }`

- [ ] **Step 1: Add `POST` to `erp/src/app/api/games/settings/route.ts`**

Open the file. It currently only exports `GET`. Add the `POST` export at the end of the file:

```typescript
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/games/settings
 * Create a new provider record in gp_providers.
 * Body: { code, name, display_name?, wallet_type?, environment?, capabilities?, priority? }
 */
export async function POST(req: NextRequest) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    code?: unknown;
    name?: unknown;
    display_name?: unknown;
    wallet_type?: unknown;
    environment?: unknown;
    capabilities?: unknown;
    priority?: unknown;
  };

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!code || !/^[A-Z0-9_]{2,30}$/.test(code)) {
    return NextResponse.json(
      { error: 'code must be 2-30 uppercase letters, digits, or underscores' },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const walletType = body.wallet_type === 'TRANSFER' ? 'TRANSFER' : 'SEAMLESS';
  const environment = body.environment === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION';
  const capabilities = Array.isArray(body.capabilities) ? body.capabilities as string[] : [];
  const priority = typeof body.priority === 'number' ? body.priority : 100;
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() || name : name;

  // Check uniqueness
  const { rows: existing } = await pool.query(
    `SELECT id FROM gp_providers WHERE code = $1`,
    [code],
  );
  if (existing.length > 0) {
    return NextResponse.json({ error: `Provider code "${code}" already exists` }, { status: 409 });
  }

  const { rows } = await pool.query<{ code: string }>(
    `INSERT INTO gp_providers
       (code, name, display_name, version, priority, status, environment,
        wallet_type, capabilities, metadata)
     VALUES ($1,$2,$3,'1.0.0',$4,'DISABLED',$5,$6,$7,'{}')
     RETURNING code`,
    [code, name, displayName, priority, environment, walletType, JSON.stringify(capabilities)],
  );

  return NextResponse.json({ ok: true, code: rows[0].code }, { status: 201 });
}
```

The file currently imports `NextResponse` and `pool` at the top (check the existing GET handler's imports). Add `NextRequest` to the import if not already there.

- [ ] **Step 2: Add `DELETE` to `erp/src/app/api/games/settings/[code]/route.ts`**

Open the file (it has GET and PATCH handlers). Add the `DELETE` export at the end of the file:

```typescript
/**
 * DELETE /api/games/settings/[code]
 * Removes a provider. Rejected (409) if any gp_games rows reference this provider.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;

  const provRow = await pool.query<{ id: number }>(
    `SELECT id FROM gp_providers WHERE code = $1`,
    [code],
  );
  if (provRow.rows.length === 0) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  }
  const providerId = provRow.rows[0].id;

  const { rows: gameCount } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM gp_games WHERE provider_id = $1`,
    [providerId],
  );
  if (parseInt(gameCount[0].cnt, 10) > 0) {
    return NextResponse.json(
      { error: `Cannot delete: provider has ${gameCount[0].cnt} game(s). Remove all games first.` },
      { status: 409 },
    );
  }

  // Delete dependent rows first (FK order)
  await pool.query(`DELETE FROM gp_credentials WHERE provider_id = $1`, [providerId]);
  await pool.query(`DELETE FROM gp_config      WHERE provider_id = $1`, [providerId]);
  await pool.query(`DELETE FROM gp_health_checks WHERE provider_id = $1`, [providerId]);
  await pool.query(`DELETE FROM gp_config_audit_log WHERE provider_id = $1`, [providerId]);
  await pool.query(`DELETE FROM gp_config_history WHERE provider_id = $1`, [providerId]);
  await pool.query(`DELETE FROM gp_providers   WHERE id = $1`, [providerId]);

  return NextResponse.json({ ok: true });
}
```

Note: `Params` and `NextRequest` are already imported at the top of `[code]/route.ts`.

- [ ] **Step 3: Create `erp/src/app/api/games/settings/[code]/duplicate/route.ts`**

This is a new file. Create it:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import pool from '@/lib/db';

type Params = { params: Promise<{ code: string }> };

/**
 * POST /api/games/settings/[code]/duplicate
 * Clones a provider record + its gp_config rows under a new code.
 * Credentials are NOT copied (they are environment-specific secrets).
 *
 * Body: { new_code: string, new_name?: string, new_display_name?: string }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const payload = await requirePermission('game.manage');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  const body = await req.json().catch(() => ({})) as {
    new_code?: unknown;
    new_name?: unknown;
    new_display_name?: unknown;
  };

  const newCode = typeof body.new_code === 'string' ? body.new_code.trim().toUpperCase() : '';
  if (!newCode || !/^[A-Z0-9_]{2,30}$/.test(newCode)) {
    return NextResponse.json(
      { error: 'new_code must be 2-30 uppercase letters, digits, or underscores' },
      { status: 400 },
    );
  }

  // Fetch source provider
  const { rows: srcRows } = await pool.query<{
    id: number; name: string; display_name: string; version: string;
    priority: number; environment: string; wallet_type: string;
    capabilities: string; metadata: string;
  }>(
    `SELECT id, name, display_name, version, priority, environment,
            wallet_type, capabilities::text, metadata::text
     FROM gp_providers WHERE code = $1`,
    [code],
  );
  if (srcRows.length === 0) {
    return NextResponse.json({ error: 'Source provider not found' }, { status: 404 });
  }
  const src = srcRows[0];

  // Check new_code uniqueness
  const { rows: existing } = await pool.query(
    `SELECT id FROM gp_providers WHERE code = $1`, [newCode],
  );
  if (existing.length > 0) {
    return NextResponse.json({ error: `Provider code "${newCode}" already exists` }, { status: 409 });
  }

  const newName = typeof body.new_name === 'string' && body.new_name.trim()
    ? body.new_name.trim()
    : `${src.name} (copy)`;
  const newDisplayName = typeof body.new_display_name === 'string' && body.new_display_name.trim()
    ? body.new_display_name.trim()
    : newName;

  // Create new provider (status=DISABLED so it's safe to configure before enabling)
  const { rows: newRows } = await pool.query<{ id: number; code: string }>(
    `INSERT INTO gp_providers
       (code, name, display_name, version, priority, status, environment,
        wallet_type, capabilities, metadata)
     VALUES ($1,$2,$3,$4,$5,'DISABLED',$6,$7,$8,$9)
     RETURNING id, code`,
    [
      newCode, newName, newDisplayName, src.version,
      src.priority, src.environment, src.wallet_type,
      src.capabilities, src.metadata,
    ],
  );
  const newId = newRows[0].id;

  // Copy gp_config rows (non-secret configuration only)
  const { rows: cfgRows } = await pool.query<{ key: string; value: string }>(
    `SELECT key, value FROM gp_config WHERE provider_id = $1`,
    [src.id],
  );
  for (const row of cfgRows) {
    await pool.query(
      `INSERT INTO gp_config (provider_id, key, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (provider_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [newId, row.key, row.value],
    );
  }

  return NextResponse.json({ ok: true, new_code: newRows[0].code }, { status: 201 });
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "erp/src/app/api/games/settings/route.ts" \
        "erp/src/app/api/games/settings/[code]/route.ts" \
        "erp/src/app/api/games/settings/[code]/duplicate/route.ts"
git commit -m "feat(providers): add create, delete, duplicate API endpoints"
```

---

### Task 4: Provider Registry UI — New Provider Modal + Delete + Duplicate

Update `/gaming-platform/page.tsx` to expose create, delete, and duplicate from the UI.

**Files:**
- Modify: `erp/src/app/(dashboard)/gaming-platform/page.tsx`

**Interfaces:**
- Consumes:
  - `POST /api/games/settings` → `{ ok: true, code: string }`
  - `DELETE /api/games/settings/[code]` → `{ ok: true }`
  - `POST /api/games/settings/[code]/duplicate` → `{ ok: true, new_code: string }`
- Produces: Updated provider registry page with create/delete/duplicate actions

The file is 1594 lines long. Make targeted additions only — do not rewrite the file.

- [ ] **Step 1: Add `NewProviderModal` component**

Find the line `// ══════════════════════════════════════════════════════════════` immediately before `// Provider Dashboard Card (overview)` (around line 1446). Insert the `NewProviderModal` component **before** that section:

```tsx
// ══════════════════════════════════════════════════════════════
// New Provider Modal
// ══════════════════════════════════════════════════════════════

const ALL_CAPABILITIES = [
  'SEAMLESS_WALLET','TRANSFER_WALLET','GAME_SYNC','LOBBY','HISTORY',
  'JACKPOT','BONUS','FREE_SPIN','FUND_FLOAT','NICKNAME_UPDATE','LOGOUT',
] as const;

function NewProviderModal({ onCreated, onClose }: { onCreated: (code: string) => void; onClose: () => void }) {
  const [code,        setCode]        = useState('');
  const [name,        setName]        = useState('');
  const [displayName, setDisplayName] = useState('');
  const [walletType,  setWalletType]  = useState<'SEAMLESS' | 'TRANSFER'>('SEAMLESS');
  const [environment, setEnvironment] = useState<'PRODUCTION' | 'SANDBOX'>('PRODUCTION');
  const [caps,        setCaps]        = useState<string[]>(['SEAMLESS_WALLET', 'LOBBY']);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  function toggleCap(cap: string) {
    setCaps(prev => prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const r = await fetch('/api/games/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          display_name: displayName.trim() || undefined,
          wallet_type: walletType,
          environment,
          capabilities: caps,
        }),
      });
      const d = await r.json() as { ok?: boolean; code?: string; error?: string };
      if (!r.ok || !d.ok) { setError(d.error ?? '创建失败'); return; }
      onCreated(d.code ?? code.toUpperCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">新建 Provider</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <XCircle className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={e => void handleSubmit(e)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Provider Code * <span className="text-slate-400">(如 MEGAH5, JILI)</span></label>
              <input required value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                pattern="[A-Z0-9_]{2,30}" title="2-30 uppercase letters, digits, underscores"
                placeholder="MEGAH5"
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Provider Name *</label>
              <input required value={name} onChange={e => setName(e.target.value)}
                placeholder="Mega888 H5"
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Display Name</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Mega888"
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
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

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Capabilities</label>
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map(cap => (
                <button key={cap} type="button" onClick={() => toggleCap(cap)}
                  className={`px-2 py-1 rounded text-xs font-mono transition-colors
                    ${caps.includes(cap)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                  {cap}
                </button>
              ))}
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
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? '创建中…' : '创建 Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `DuplicateModal` component**

Insert this component immediately after `NewProviderModal` (still before `ProviderCard`):

```tsx
// ══════════════════════════════════════════════════════════════
// Duplicate Provider Modal
// ══════════════════════════════════════════════════════════════

function DuplicateModal({ sourceCode, onDuplicated, onClose }: {
  sourceCode: string;
  onDuplicated: (newCode: string) => void;
  onClose: () => void;
}) {
  const [newCode,    setNewCode]    = useState('');
  const [newName,    setNewName]    = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const r = await fetch(`/api/games/settings/${sourceCode}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_code: newCode.toUpperCase(), new_name: newName.trim() || undefined }),
      });
      const d = await r.json() as { ok?: boolean; new_code?: string; error?: string };
      if (!r.ok || !d.ok) { setError(d.error ?? '复制失败'); return; }
      onDuplicated(d.new_code ?? newCode.toUpperCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            复制 Provider — <span className="font-mono text-blue-600">{sourceCode}</span>
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <XCircle className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={e => void handleSubmit(e)} className="p-6 space-y-4">
          <p className="text-xs text-slate-500">
            复制 Provider 的基本信息和配置（gp_config）到新 code。凭证不会复制，需要手动填写。
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">新 Provider Code *</label>
            <input required value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())}
              pattern="[A-Z0-9_]{2,30}" title="2-30 uppercase letters, digits, underscores"
              placeholder="MEGAH5_STAGING"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">新 Provider Name（留空则自动加 "(copy)"）</label>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Mega888 H5 Staging"
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
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? '复制中…' : '确认复制'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add state variables and handlers to `GamingPlatformPage`**

In `GamingPlatformPage` (starts at line 1491), find the existing state declarations and add:

```typescript
const [showNewModal,  setShowNewModal]  = useState(false);
const [duplicating,   setDuplicating]   = useState<string | null>(null);  // provider code being duplicated
const [deletingCode,  setDeletingCode]  = useState<string | null>(null);  // provider code confirm-pending delete
const [deletingBusy,  setDeletingBusy]  = useState(false);
```

Add a `handleDelete` function inside `GamingPlatformPage` (after `loadProviders`):

```typescript
async function handleDelete(code: string) {
  setDeletingBusy(true);
  try {
    const r = await fetch(`/api/games/settings/${code}`, { method: 'DELETE' });
    const d = await r.json() as { ok?: boolean; error?: string };
    if (!r.ok || !d.ok) { showToast(d.error ?? '删除失败', false); return; }
    showToast(`已删除 ${code}`, true);
    setDeletingCode(null);
    if (selected === code) setSelected(null);
    void loadProviders();
  } catch (e) {
    showToast(e instanceof Error ? e.message : '网络错误', false);
  } finally {
    setDeletingBusy(false);
  }
}
```

- [ ] **Step 4: Add "New Provider" button to the page header**

Find the page header section (around line 1528):

```tsx
<div>
  <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Gaming Platform</h1>
  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
    统一管理所有游戏提供商配置、凭证、回调日志与运行状态
  </p>
</div>
<button onClick={loadProviders} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700">
  <RefreshCw className="w-4 h-4 text-slate-500" />
</button>
```

Replace that `<div className="flex items-center justify-between">` block with:

```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Gaming Platform</h1>
    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
      统一管理所有游戏提供商配置、凭证、回调日志与运行状态
    </p>
  </div>
  <div className="flex items-center gap-2">
    <button
      onClick={() => setShowNewModal(true)}
      className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
    >
      <Plus className="w-4 h-4" />
      新建 Provider
    </button>
    <button onClick={loadProviders} className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700">
      <RefreshCw className="w-4 h-4 text-slate-500" />
    </button>
  </div>
</div>
```

Add `Plus` to the lucide-react import at the top of the file (it already imports many icons — add `Plus` to the list).

- [ ] **Step 5: Add delete + duplicate buttons to the provider list**

Find the `ProviderCard` render inside the provider list. The list currently renders:

```tsx
{providers.map(p => listExpanded ? (
  <ProviderCard key={p.code} p={p} isSelected={selected === p.code} onClick={() => setSelected(p.code)} />
) : (
```

Replace with a version that wraps each card in a relative container and adds action buttons:

```tsx
{providers.map(p => listExpanded ? (
  <div key={p.code} className="relative group">
    <ProviderCard p={p} isSelected={selected === p.code} onClick={() => setSelected(p.code)} />
    {/* Action buttons — appear on hover */}
    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={e => { e.stopPropagation(); setDuplicating(p.code); }}
        title="复制 Provider"
        className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-blue-600 shadow-sm"
      >
        <Copy className="w-3 h-3" />
      </button>
      <button
        onClick={e => { e.stopPropagation(); setDeletingCode(p.code); }}
        title="删除 Provider"
        className="p-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 shadow-sm"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  </div>
) : (
```

Add `Copy` and `Trash2` to the lucide-react import at the top of the file.

- [ ] **Step 6: Add modals and delete confirmation to the JSX return**

Find the line `{toast && <Toast msg={toast.msg} ok={toast.ok} />}` at the very end of the JSX (just before the closing `</div>`). Add before it:

```tsx
{/* New Provider Modal */}
{showNewModal && (
  <NewProviderModal
    onCreated={(code) => {
      setShowNewModal(false);
      showToast(`Provider "${code}" 已创建，状态 DISABLED`, true);
      void loadProviders();
      setSelected(code);
    }}
    onClose={() => setShowNewModal(false)}
  />
)}

{/* Duplicate Modal */}
{duplicating && (
  <DuplicateModal
    sourceCode={duplicating}
    onDuplicated={(newCode) => {
      setDuplicating(null);
      showToast(`已复制为 "${newCode}"（配置已复制，凭证需手动填写）`, true);
      void loadProviders();
      setSelected(newCode);
    }}
    onClose={() => setDuplicating(null)}
  />
)}

{/* Delete Confirmation */}
{deletingCode && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">确认删除</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        将永久删除 Provider <span className="font-mono font-bold">{deletingCode}</span> 及其所有配置。
        此操作不可撤销。
      </p>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        如果该 Provider 仍有关联游戏，删除将被拒绝。
      </p>
      <div className="flex justify-end gap-2">
        <button onClick={() => setDeletingCode(null)} disabled={deletingBusy}
          className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50">
          取消
        </button>
        <button onClick={() => void handleDelete(deletingCode)} disabled={deletingBusy}
          className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
          {deletingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {deletingBusy ? '删除中…' : '确认删除'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Verify TypeScript**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add "erp/src/app/(dashboard)/gaming-platform/page.tsx"
git commit -m "feat(providers): New Provider modal, delete, duplicate in Provider Registry UI"
```

---

### Task 5: Games Library UI — `name_zh` / `name_en` Edit Fields

Update the `GameRow` type and `EditGameDialog` in the Games Library page to support Chinese and English game names.

**Files:**
- Modify: `erp/src/app/(dashboard)/gaming-platform/games-library/page.tsx`

**Interfaces:**
- Consumes:
  - `GameRow.name_zh: string | null` (new DB column from Task 1)
  - `GameRow.name_en: string | null` (new DB column from Task 1)
  - `PATCH /api/games/library/[id]` accepts `name_zh`, `name_en` (added in Task 2)
- Produces: `EditGameDialog` sends `name_zh` and `name_en` in the PATCH body

- [ ] **Step 1: Add `name_zh` and `name_en` to the `GameRow` interface**

Find the `GameRow` interface (starts around line 14). Add two fields after `original_name`:

```typescript
interface GameRow {
  id: number;
  provider_id: number;
  provider_code: string;
  provider_display_name: string;
  game_code: string;
  display_name: string;
  original_name: string;
  name_zh: string | null;   // ← add
  name_en: string | null;   // ← add
  description: string | null;
  // ... rest of existing fields unchanged ...
}
```

- [ ] **Step 2: Add state and form fields to `EditGameDialog`**

Inside `EditGameDialog`, find the existing state declarations (around line 115). After the `displayName` state, add:

```typescript
const [nameZh, setNameZh] = useState(game?.name_zh ?? '');
const [nameEn, setNameEn] = useState(game?.name_en ?? '');
```

- [ ] **Step 3: Include new fields in `handleSubmit`**

Inside `handleSubmit`, find the `data` object being built (around line 142). Add `name_zh` and `name_en`:

```typescript
const data: Record<string, unknown> = {
  name, display_name: displayName || null, description: description || null,
  name_zh: nameZh.trim() || null,   // ← add
  name_en: nameEn.trim() || null,   // ← add
  category, launch_mode: launchMode,
  icon_url: iconUrl || null, thumbnail_url: thumbnailUrl || null,
  visible, is_active: isActive, is_hot: isHot, is_new: isNew2,
  featured, recommended, is_maintenance: isMaint,
  desktop_supported: desktop, mobile_supported: mobile,
  sort_order: parseInt(sortOrder, 10) || 0,
};
```

- [ ] **Step 4: Add the two input fields to the form JSX**

In the `EditGameDialog` form JSX, find where `displayName` input is rendered (it uses `setDisplayName`). Add the Chinese and English name inputs immediately after the `displayName` block and before the `description` block:

```tsx
{/* Chinese Name */}
<div>
  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">中文名称 (name_zh)</label>
  <input
    value={nameZh}
    onChange={e => setNameZh(e.target.value)}
    placeholder="幸运神"
    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
</div>
{/* English Name */}
<div>
  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">English Name (name_en)</label>
  <input
    value={nameEn}
    onChange={e => setNameEn(e.target.value)}
    placeholder="Lucky God"
    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
</div>
```

- [ ] **Step 5: Show `name_zh` in the game card list view**

In the game list rendering, find where each game's name is shown (around line 688 and 785). These show `g.display_name`. No change needed — `name_zh`/`name_en` are edit-only fields, not displayed in the card. (If the user wants to display them later, that's a separate request.)

- [ ] **Step 6: Verify TypeScript**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add "erp/src/app/(dashboard)/gaming-platform/games-library/page.tsx"
git commit -m "feat(games): name_zh and name_en fields in Games Library edit dialog"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Covered By |
|---|---|
| Add Provider | Task 3 (POST API) + Task 4 (New Provider Modal) |
| Edit Provider (status, website, config, credentials) | Already exists — not in scope of this plan |
| Enable / Disable Provider | Already exists (status change) |
| Delete Provider | Task 3 (DELETE API) + Task 4 (delete confirmation modal) |
| Duplicate Provider | Task 3 (duplicate API) + Task 4 (Duplicate Modal) |
| View Details | Already exists |
| Search / Filter / Pagination / Sorting | Already exists |
| Test Connection | Already exists |
| Health Check display | Already exists |
| Game Registry `name_zh` | Task 1 (migration) + Task 2 (types) + Task 5 (UI) |
| Game Registry `name_en` | Task 1 (migration) + Task 2 (types) + Task 5 (UI) |
| Sync Games framework | Already exists (`GameSyncService`, `/sync` endpoint) |
| Backward compatibility | Maintained — only new endpoints added, GET/PATCH unchanged |

### Placeholder Scan

Clean — every step has complete code.

### Type Consistency

- `GameRecord.name_zh: string | null` → matches `GameListItem.name_zh?: string | null` ✓
- `upsertBatch` uses `$4 = game.name_zh ?? null` (11 params total) ✓
- `ALLOWED_FIELDS['name_zh'] = 'name_zh'` → DB column matches ✓
- `NewProviderModal.onCreated(code: string)` → `GamingPlatformPage` receives and uses `code` ✓
- `DuplicateModal.onDuplicated(newCode: string)` → matches API response `{ new_code: string }` ✓
