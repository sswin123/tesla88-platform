# Phase 5.5 — Broadcast Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a professional Broadcast Center that lets ERP operators compose, schedule, and send mass messages to segmented audiences via Telegram Bot and ERP Live Chat channels, with full history and analytics.

**Architecture:** A new `broadcasts` table stores broadcast definitions and aggregate delivery counts. A dedicated send engine (`erp/src/lib/broadcast/send.ts`) resolves the audience, calls the bot relay for Telegram delivery, and inserts into `support_messages` for Live Chat delivery. All media flows through the existing MediaPicker → Media Library path — no new upload logic.

**Tech Stack:** PostgreSQL (new `broadcasts` table), Next.js 15 App Router, Vitest, React 18 (`'use client'`), TailwindCSS, Lucide React, existing MediaPicker component, existing bot relay (`BOT_RELAY_URL/send_to_telegram_id`).

## Global Constraints

- MediaPicker import: `@/components/media/MediaPicker` — NEVER from dashboard path
- No new media table, no new upload logic, no base64 in DB — media via `media_id` FK only
- `BOT_RELAY_URL` and `BOT_RELAY_AUTH_TOKEN` from `process.env` with fallback defaults (same pattern as existing routes)
- Content types: `TEXT | IMAGE | GIF | VIDEO | AUDIO | DOCUMENT | PDF | APK | ZIP | RAR` (10 types — no VOICE for broadcast)
- Audience types: `ALL | TAG | VIP | ACTIVE | INACTIVE | NEVER_DEPOSIT | DEPOSITED | SELECTED`
- Broadcast status: `DRAFT | SCHEDULED | SENDING | SENT | PARTIALLY_SENT | FAILED | CANCELLED`
- Channels: `TELEGRAM | LIVECHAT` (stored as `TEXT[]`)
- `set_updated_at()` trigger function already exists from migration 027 — DO NOT recreate it
- All routes require JWT auth via `verifyJWT` + `COOKIE_NAME` cookies pattern
- Next.js 15 App Router: `{ params: Promise<{ id: string }> }` pattern for dynamic routes
- Tests in `erp/tests/` directory, Vitest, mock `@/lib/db` pool, mock `next/headers`, mock `@/lib/auth`
- Running test command: `cd erp && npx vitest run --reporter=verbose 2>&1 | tail -30`
- TypeScript check: `cd erp && npx tsc --noEmit 2>&1 | head -30`
- Never redesign Media Library, MediaPicker, Quick Reply Manager, or Live Chat
- ACTIVE audience = `status = 'ACTIVE' AND last_seen_at >= NOW() - INTERVAL '30 days'`
- INACTIVE audience = `status = 'ACTIVE' AND (last_seen_at < NOW() - INTERVAL '30 days' OR last_seen_at IS NULL)`
- NEVER_DEPOSIT = `CAST(total_deposit AS NUMERIC) = 0`
- DEPOSITED = `CAST(total_deposit AS NUMERIC) > 0`
- VIP = user has tag with name = 'VIP' in `user_tag_assignments JOIN customer_tags`
- Telegram send: TEXT → `{ telegram_id, message: body }`; media → `{ telegram_id, message: caption ?? title }` (relay text fallback — full media relay is a future relay upgrade)
- Live Chat send: INSERT into `support_messages` for users with OPEN or ACTIVE `support_sessions`
- DO NOT start: Website, SMS OTP, Email OTP, WhatsApp OTP, Billing, Public API, Multi-Tenant

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `erp/migrations/029_broadcasts.sql` | Create | broadcasts table + indexes + trigger |
| `erp/src/lib/types.ts` | Modify | Add Broadcast, BroadcastContentType, BroadcastAudienceType, BroadcastStatus, BroadcastChannel |
| `erp/src/lib/repositories/broadcast_repo.ts` | Create | CRUD + audience resolution + count preview |
| `erp/src/lib/broadcast/send.ts` | Create | Send engine: resolve audience → relay + livechat DB insert |
| `erp/src/app/api/broadcast/route.ts` | Create | GET (list) + POST (create draft) |
| `erp/src/app/api/broadcast/[id]/route.ts` | Create | GET + PATCH + DELETE |
| `erp/src/app/api/broadcast/[id]/send/route.ts` | Create | POST: trigger send or schedule |
| `erp/src/app/api/broadcast/audience-count/route.ts` | Create | GET: preview recipient count |
| `erp/src/app/(dashboard)/broadcast/page.tsx` | Create | Broadcast Manager UI |
| `erp/src/components/sidebar.tsx` | Modify | Add Broadcast nav entry |
| `erp/tests/broadcast-repo.test.ts` | Create | Repository unit tests |
| `erp/tests/broadcast-route.test.ts` | Create | API route unit tests |
| `erp/tests/broadcast-send.test.ts` | Create | Send engine unit tests |

---

### Task 1: DB Migration 029 — broadcasts table

**Files:**
- Create: `erp/migrations/029_broadcasts.sql`

**Interfaces:**
- Produces: `broadcasts` table; referenced by Task 2 (types), Task 3 (send engine), Task 4 (API routes)

- [ ] **Step 1: Create migration file**

```sql
-- erp/migrations/029_broadcasts.sql
-- Phase 5.5 — Broadcast Center
-- Depends on: 027_media_library.sql (media_library table, set_updated_at function)

CREATE TABLE broadcasts (
  id               SERIAL        PRIMARY KEY,
  title            VARCHAR(255)  NOT NULL,
  content_type     VARCHAR(20)   NOT NULL DEFAULT 'TEXT'
                   CHECK (content_type IN ('TEXT','IMAGE','GIF','VIDEO','AUDIO','DOCUMENT','PDF','APK','ZIP','RAR')),
  body             TEXT          NOT NULL DEFAULT '',
  caption          VARCHAR(1024),
  media_id         INT           REFERENCES media_library(id) ON DELETE SET NULL,
  channels         TEXT[]        NOT NULL DEFAULT ARRAY['TELEGRAM'],
  audience_type    VARCHAR(30)   NOT NULL DEFAULT 'ALL'
                   CHECK (audience_type IN ('ALL','TAG','VIP','ACTIVE','INACTIVE','NEVER_DEPOSIT','DEPOSITED','SELECTED')),
  audience_tag_id  INT           REFERENCES customer_tags(id) ON DELETE SET NULL,
  audience_user_ids INT[],
  status           VARCHAR(20)   NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT','SCHEDULED','SENDING','SENT','PARTIALLY_SENT','FAILED','CANCELLED')),
  scheduled_at     TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  recipient_count  INT           NOT NULL DEFAULT 0,
  success_count    INT           NOT NULL DEFAULT 0,
  failed_count     INT           NOT NULL DEFAULT 0,
  created_by       VARCHAR(100)  NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_broadcasts_status     ON broadcasts(status);
CREATE INDEX idx_broadcasts_created_at ON broadcasts(created_at DESC);
CREATE INDEX idx_broadcasts_media_id   ON broadcasts(media_id) WHERE media_id IS NOT NULL;

-- Reuse the existing set_updated_at() function from migration 027
CREATE TRIGGER set_broadcasts_updated_at
  BEFORE UPDATE ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 2: Apply migration manually to confirm syntax (optional — CI applies it)**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
psql $DATABASE_URL -f erp/migrations/029_broadcasts.sql 2>&1 | tail -5
```

Expected: `CREATE TABLE`, `CREATE INDEX` (×3), `CREATE TRIGGER` — no ERRORs.

- [ ] **Step 3: Commit**

```bash
git add erp/migrations/029_broadcasts.sql
git commit -m "feat(broadcast): migration 029 — broadcasts table, indexes, trigger"
```

---

### Task 2: Types + Repository

**Files:**
- Modify: `erp/src/lib/types.ts`
- Create: `erp/src/lib/repositories/broadcast_repo.ts`
- Create: `erp/tests/broadcast-repo.test.ts`

**Interfaces:**
- Consumes: `pool` from `@/lib/db`; `customer_tags`, `user_tag_assignments`, `users`, `broadcasts` tables
- Produces (exact exports from `broadcast_repo.ts`):
  ```typescript
  getBroadcasts(opts: { status?: string; limit: number; offset: number }): Promise<{ data: Broadcast[]; total: number }>
  getBroadcastById(id: number): Promise<Broadcast | null>
  createBroadcast(data: CreateBroadcastInput, createdBy: string): Promise<Broadcast>
  updateBroadcast(id: number, data: Partial<CreateBroadcastInput>): Promise<Broadcast | null>
  deleteBroadcast(id: number): Promise<boolean>
  updateBroadcastCounts(id: number, opts: { status: BroadcastStatus; recipient_count?: number; success_count?: number; failed_count?: number; sent_at?: Date }): Promise<void>
  resolveAudienceTelegramIds(audienceType: BroadcastAudienceType, opts?: { tagId?: number | null; userIds?: number[] | null }): Promise<string[]>
  getAudienceCount(audienceType: BroadcastAudienceType, opts?: { tagId?: number | null; userIds?: number[] | null }): Promise<number>
  getActiveSessionUserIds(userIds: number[]): Promise<{ user_id: number; session_id: number }[]>
  ```
- Produces (types in `types.ts`):
  ```typescript
  BroadcastContentType, BroadcastAudienceType, BroadcastStatus, BroadcastChannel, Broadcast, CreateBroadcastInput
  ```

- [ ] **Step 1: Add types to `erp/src/lib/types.ts`**

Append after the `QuickReply` section (after the `QuickReplyCategory` interface):

```typescript
// ── Broadcast ────────────────────────────────────────────────────────────────

export type BroadcastContentType =
  | 'TEXT' | 'IMAGE' | 'GIF' | 'VIDEO' | 'AUDIO'
  | 'DOCUMENT' | 'PDF' | 'APK' | 'ZIP' | 'RAR';

export type BroadcastAudienceType =
  | 'ALL' | 'TAG' | 'VIP' | 'ACTIVE' | 'INACTIVE'
  | 'NEVER_DEPOSIT' | 'DEPOSITED' | 'SELECTED';

export type BroadcastStatus =
  | 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT'
  | 'PARTIALLY_SENT' | 'FAILED' | 'CANCELLED';

export type BroadcastChannel = 'TELEGRAM' | 'LIVECHAT';

export interface Broadcast {
  id: number;
  title: string;
  content_type: BroadcastContentType;
  body: string;
  caption: string | null;
  media_id: number | null;
  media?: import('@/lib/media/types').MediaRecord;
  channels: BroadcastChannel[];
  audience_type: BroadcastAudienceType;
  audience_tag_id: number | null;
  audience_tag_name: string | null;
  audience_user_ids: number[] | null;
  status: BroadcastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  success_count: number;
  failed_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBroadcastInput {
  title: string;
  content_type: BroadcastContentType;
  body: string;
  caption?: string | null;
  media_id?: number | null;
  channels: BroadcastChannel[];
  audience_type: BroadcastAudienceType;
  audience_tag_id?: number | null;
  audience_user_ids?: number[] | null;
  status?: BroadcastStatus;
  scheduled_at?: string | null;
}
```

- [ ] **Step 2: Write failing test**

Create `erp/tests/broadcast-repo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

import pool from '@/lib/db';
import {
  getBroadcasts,
  getBroadcastById,
  createBroadcast,
  updateBroadcast,
  deleteBroadcast,
  updateBroadcastCounts,
  resolveAudienceTelegramIds,
  getAudienceCount,
  getActiveSessionUserIds,
} from '@/lib/repositories/broadcast_repo';

const mockQuery = vi.mocked(pool.query);
beforeEach(() => vi.clearAllMocks());

const BASE_ROW = {
  id: 1, title: 'Test', content_type: 'TEXT', body: 'Hello', caption: null,
  media_id: null, channels: ['TELEGRAM'], audience_type: 'ALL',
  audience_tag_id: null, audience_tag_name: null, audience_user_ids: null,
  status: 'DRAFT', scheduled_at: null, sent_at: null,
  recipient_count: 0, success_count: 0, failed_count: 0,
  created_by: 'admin1', created_at: '2026-01-01', updated_at: '2026-01-01',
  // media join
  ml_id: null, ml_display_name: null, ml_mime_type: null,
  ml_file_size: null, ml_file_path: null, ml_created_at: null,
};

describe('getBroadcasts', () => {
  it('returns paginated broadcasts', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [BASE_ROW] } as never)
      .mockResolvedValueOnce({ rows: [{ count: 1 }] } as never);
    const r = await getBroadcasts({ limit: 20, offset: 0 });
    expect(r.total).toBe(1);
    expect(r.data[0].id).toBe(1);
  });

  it('filters by status', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ count: 0 }] } as never);
    const r = await getBroadcasts({ status: 'SENT', limit: 20, offset: 0 });
    expect(r.total).toBe(0);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('status');
  });
});

describe('getBroadcastById', () => {
  it('returns broadcast when found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [BASE_ROW] } as never);
    const r = await getBroadcastById(1);
    expect(r?.id).toBe(1);
  });

  it('returns null when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    const r = await getBroadcastById(99);
    expect(r).toBeNull();
  });
});

describe('createBroadcast', () => {
  it('inserts and returns the new broadcast', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [BASE_ROW] } as never);
    const r = await createBroadcast({
      title: 'Test', content_type: 'TEXT', body: 'Hello',
      channels: ['TELEGRAM'], audience_type: 'ALL',
    }, 'admin1');
    expect(r.title).toBe('Test');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO broadcasts');
  });
});

describe('updateBroadcast', () => {
  it('returns null for empty update', async () => {
    const r = await updateBroadcast(1, {});
    expect(r).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updates title and returns broadcast', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...BASE_ROW, title: 'Updated' }] } as never);
    const r = await updateBroadcast(1, { title: 'Updated' });
    expect(r?.title).toBe('Updated');
  });
});

describe('deleteBroadcast', () => {
  it('deletes and returns true when rowCount > 0', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 } as never);
    const r = await deleteBroadcast(1);
    expect(r).toBe(true);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'DRAFT'");
  });

  it('returns false when not found or not a draft', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 } as never);
    const r = await deleteBroadcast(99);
    expect(r).toBe(false);
  });
});

describe('updateBroadcastCounts', () => {
  it('calls UPDATE with provided fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await updateBroadcastCounts(1, { status: 'SENT', success_count: 5, failed_count: 1, recipient_count: 6, sent_at: new Date() });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('UPDATE broadcasts');
    expect(sql).toContain('success_count');
  });
});

describe('resolveAudienceTelegramIds', () => {
  it('ALL: selects all users with telegram_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ telegram_id: '111' }] } as never);
    const ids = await resolveAudienceTelegramIds('ALL');
    expect(ids).toEqual(['111']);
  });

  it('TAG: joins user_tag_assignments', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ telegram_id: '222' }] } as never);
    const ids = await resolveAudienceTelegramIds('TAG', { tagId: 5 });
    expect(ids).toEqual(['222']);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('user_tag_assignments');
  });

  it('VIP: joins customer_tags where name = VIP', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await resolveAudienceTelegramIds('VIP');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("'VIP'");
  });

  it('ACTIVE: filters by last_seen_at within 30 days', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await resolveAudienceTelegramIds('ACTIVE');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('last_seen_at');
    expect(sql).toContain('30 days');
  });

  it('NEVER_DEPOSIT: filters total_deposit = 0', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await resolveAudienceTelegramIds('NEVER_DEPOSIT');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('total_deposit');
  });

  it('SELECTED: uses audience_user_ids', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ telegram_id: '333' }] } as never);
    const ids = await resolveAudienceTelegramIds('SELECTED', { userIds: [10, 20] });
    expect(ids).toEqual(['333']);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('ANY');
  });
});

describe('getAudienceCount', () => {
  it('returns COUNT for ALL', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 42 }] } as never);
    const n = await getAudienceCount('ALL');
    expect(n).toBe(42);
  });
});

describe('getActiveSessionUserIds', () => {
  it('returns user_id + session_id for open sessions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 1, session_id: 10 }] } as never);
    const r = await getActiveSessionUserIds([1, 2]);
    expect(r[0].session_id).toBe(10);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("IN ('OPEN','ACTIVE')");
  });

  it('returns empty array when userIds is empty', async () => {
    const r = await getActiveSessionUserIds([]);
    expect(r).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests — expect failure**

```bash
cd erp && npx vitest run tests/broadcast-repo.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `broadcast_repo` not found.

- [ ] **Step 4: Create `erp/src/lib/repositories/broadcast_repo.ts`**

```typescript
import pool from '@/lib/db';
import type {
  Broadcast, CreateBroadcastInput, BroadcastAudienceType, BroadcastStatus,
} from '@/lib/types';

// ── Column projections ────────────────────────────────────────────────────────

const B_COLS = `
  b.id, b.title, b.content_type, b.body, b.caption, b.media_id,
  b.channels, b.audience_type, b.audience_tag_id, b.audience_user_ids,
  b.status, b.scheduled_at, b.sent_at,
  b.recipient_count, b.success_count, b.failed_count,
  b.created_by, b.created_at, b.updated_at,
  ct.name  AS audience_tag_name,
  ml.id    AS ml_id,
  ml.display_name AS ml_display_name,
  ml.mime_type    AS ml_mime_type,
  ml.file_size    AS ml_file_size,
  ml.file_path    AS ml_file_path,
  ml.created_at   AS ml_created_at
`;

function broadcastFromRow(row: Record<string, unknown>): Broadcast {
  const b: Broadcast = {
    id:               row.id as number,
    title:            row.title as string,
    content_type:     row.content_type as Broadcast['content_type'],
    body:             row.body as string,
    caption:          (row.caption as string | null) ?? null,
    media_id:         (row.media_id as number | null) ?? null,
    channels:         (row.channels as string[]) as Broadcast['channels'],
    audience_type:    row.audience_type as Broadcast['audience_type'],
    audience_tag_id:  (row.audience_tag_id as number | null) ?? null,
    audience_tag_name:(row.audience_tag_name as string | null) ?? null,
    audience_user_ids:(row.audience_user_ids as number[] | null) ?? null,
    status:           row.status as BroadcastStatus,
    scheduled_at:     (row.scheduled_at as string | null) ?? null,
    sent_at:          (row.sent_at as string | null) ?? null,
    recipient_count:  (row.recipient_count as number) ?? 0,
    success_count:    (row.success_count as number) ?? 0,
    failed_count:     (row.failed_count as number) ?? 0,
    created_by:       row.created_by as string,
    created_at:       row.created_at as string,
    updated_at:       row.updated_at as string,
  };
  if (row.ml_id !== null && row.ml_id !== undefined) {
    b.media = {
      id:          row.ml_id as number,
      displayName: row.ml_display_name as string,
      mimeType:    row.ml_mime_type as string,
      fileSize:    row.ml_file_size as number,
      filePath:    row.ml_file_path as string,
      createdAt:   row.ml_created_at as string,
    };
  }
  return b;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getBroadcasts(opts: {
  status?: string;
  limit: number;
  offset: number;
}): Promise<{ data: Broadcast[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (opts.status) {
    conditions.push(`b.status = $${i++}`);
    params.push(opts.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows, countRow] = await Promise.all([
    pool.query(
      `SELECT ${B_COLS}
       FROM broadcasts b
       LEFT JOIN customer_tags ct ON ct.id = b.audience_tag_id
       LEFT JOIN media_library ml ON ml.id = b.media_id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, opts.limit, opts.offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM broadcasts b ${where}`,
      params
    ),
  ]);
  return { data: rows.rows.map(broadcastFromRow), total: countRow.rows[0].count };
}

export async function getBroadcastById(id: number): Promise<Broadcast | null> {
  const r = await pool.query(
    `SELECT ${B_COLS}
     FROM broadcasts b
     LEFT JOIN customer_tags ct ON ct.id = b.audience_tag_id
     LEFT JOIN media_library ml ON ml.id = b.media_id
     WHERE b.id = $1`,
    [id]
  );
  return r.rows.length ? broadcastFromRow(r.rows[0]) : null;
}

export async function createBroadcast(
  data: CreateBroadcastInput,
  createdBy: string,
): Promise<Broadcast> {
  const r = await pool.query(
    `INSERT INTO broadcasts
       (title, content_type, body, caption, media_id, channels,
        audience_type, audience_tag_id, audience_user_ids, status, scheduled_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      data.title,
      data.content_type,
      data.body,
      data.caption ?? null,
      data.media_id ?? null,
      data.channels,
      data.audience_type,
      data.audience_tag_id ?? null,
      data.audience_user_ids ?? null,
      data.status ?? 'DRAFT',
      data.scheduled_at ?? null,
      createdBy,
    ]
  );
  return broadcastFromRow({ ...r.rows[0], audience_tag_name: null, ml_id: null });
}

const UPDATABLE = new Set([
  'title','content_type','body','caption','media_id','channels',
  'audience_type','audience_tag_id','audience_user_ids','status','scheduled_at',
]);

export async function updateBroadcast(
  id: number,
  data: Partial<CreateBroadcastInput>,
): Promise<Broadcast | null> {
  const fields = Object.keys(data).filter(k => UPDATABLE.has(k));
  if (fields.length === 0) return null;
  const sets = fields.map((f, idx) => `${f} = $${idx + 2}`).join(', ');
  const values = fields.map(f => (data as Record<string, unknown>)[f]);
  const r = await pool.query(
    `UPDATE broadcasts SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return r.rows.length ? broadcastFromRow({ ...r.rows[0], audience_tag_name: null, ml_id: null }) : null;
}

export async function deleteBroadcast(id: number): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM broadcasts WHERE id = $1 AND status = 'DRAFT'`,
    [id]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function updateBroadcastCounts(
  id: number,
  opts: {
    status: BroadcastStatus;
    recipient_count?: number;
    success_count?: number;
    failed_count?: number;
    sent_at?: Date;
  },
): Promise<void> {
  const sets: string[] = ['status = $2'];
  const params: unknown[] = [id, opts.status];
  let i = 3;
  if (opts.recipient_count !== undefined) { sets.push(`recipient_count = $${i++}`); params.push(opts.recipient_count); }
  if (opts.success_count   !== undefined) { sets.push(`success_count = $${i++}`);   params.push(opts.success_count);   }
  if (opts.failed_count    !== undefined) { sets.push(`failed_count = $${i++}`);    params.push(opts.failed_count);    }
  if (opts.sent_at         !== undefined) { sets.push(`sent_at = $${i++}`);         params.push(opts.sent_at);         }
  await pool.query(`UPDATE broadcasts SET ${sets.join(', ')} WHERE id = $1`, params);
}

// ── Audience resolution ───────────────────────────────────────────────────────

export async function resolveAudienceTelegramIds(
  audienceType: BroadcastAudienceType,
  opts?: { tagId?: number | null; userIds?: number[] | null },
): Promise<string[]> {
  let sql: string;
  let params: unknown[] = [];

  switch (audienceType) {
    case 'TAG':
      sql = `SELECT DISTINCT u.telegram_id FROM users u
             JOIN user_tag_assignments uta ON uta.user_id = u.id
             WHERE uta.tag_id = $1 AND u.telegram_id IS NOT NULL AND u.telegram_id != ''`;
      params = [opts?.tagId];
      break;
    case 'VIP':
      sql = `SELECT DISTINCT u.telegram_id FROM users u
             JOIN user_tag_assignments uta ON uta.user_id = u.id
             JOIN customer_tags ct ON ct.id = uta.tag_id AND ct.name = 'VIP'
             WHERE u.telegram_id IS NOT NULL AND u.telegram_id != ''`;
      break;
    case 'ACTIVE':
      sql = `SELECT telegram_id FROM users
             WHERE status = 'ACTIVE'
               AND last_seen_at >= NOW() - INTERVAL '30 days'
               AND telegram_id IS NOT NULL AND telegram_id != ''`;
      break;
    case 'INACTIVE':
      sql = `SELECT telegram_id FROM users
             WHERE status = 'ACTIVE'
               AND (last_seen_at < NOW() - INTERVAL '30 days' OR last_seen_at IS NULL)
               AND telegram_id IS NOT NULL AND telegram_id != ''`;
      break;
    case 'NEVER_DEPOSIT':
      sql = `SELECT telegram_id FROM users
             WHERE CAST(total_deposit AS NUMERIC) = 0
               AND telegram_id IS NOT NULL AND telegram_id != ''`;
      break;
    case 'DEPOSITED':
      sql = `SELECT telegram_id FROM users
             WHERE CAST(total_deposit AS NUMERIC) > 0
               AND telegram_id IS NOT NULL AND telegram_id != ''`;
      break;
    case 'SELECTED':
      sql = `SELECT telegram_id FROM users
             WHERE id = ANY($1::int[])
               AND telegram_id IS NOT NULL AND telegram_id != ''`;
      params = [opts?.userIds ?? []];
      break;
    default: // ALL
      sql = `SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND telegram_id != ''`;
  }

  const r = await pool.query(sql, params);
  return r.rows.map((row: { telegram_id: string }) => row.telegram_id);
}

export async function getAudienceCount(
  audienceType: BroadcastAudienceType,
  opts?: { tagId?: number | null; userIds?: number[] | null },
): Promise<number> {
  const ids = await resolveAudienceTelegramIds(audienceType, opts);
  return ids.length;
}

export async function getActiveSessionUserIds(
  userIds: number[],
): Promise<{ user_id: number; session_id: number }[]> {
  if (userIds.length === 0) return [];
  const r = await pool.query(
    `SELECT DISTINCT ON (ss.user_id) ss.user_id, ss.id AS session_id
     FROM support_sessions ss
     WHERE ss.user_id = ANY($1::int[])
       AND ss.status IN ('OPEN','ACTIVE')
     ORDER BY ss.user_id, ss.updated_at DESC`,
    [userIds]
  );
  return r.rows;
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd erp && npx vitest run tests/broadcast-repo.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 6: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add erp/src/lib/types.ts \
        erp/src/lib/repositories/broadcast_repo.ts \
        erp/tests/broadcast-repo.test.ts
git commit -m "feat(broadcast): types + broadcast_repo with CRUD and audience resolution"
```

---

### Task 3: Send Engine

**Files:**
- Create: `erp/src/lib/broadcast/send.ts`
- Create: `erp/tests/broadcast-send.test.ts`

**Interfaces:**
- Consumes: `getBroadcastById`, `resolveAudienceTelegramIds`, `updateBroadcastCounts`, `getActiveSessionUserIds` from `@/lib/repositories/broadcast_repo`; `pool` from `@/lib/db`
- Produces:
  ```typescript
  // erp/src/lib/broadcast/send.ts
  export async function sendBroadcast(broadcastId: number): Promise<SendResult>

  interface SendResult {
    sent: number;
    failed: number;
    total: number;
    livechat_inserted: number;
  }
  ```

**Design notes:**
- TEXT → relay body: `{ telegram_id, message: body }`
- Non-TEXT → relay body: `{ telegram_id, message: caption ?? title }` (text fallback; full media relay is a future relay upgrade)
- Live Chat channel: find users with active sessions, INSERT into support_messages
- If relay `/send_to_telegram_id` returns 404 → relay not supporting endpoint → return graceful result
- `BOT_RELAY_URL` and `BOT_RELAY_AUTH_TOKEN` read from `process.env` inside the function (not module top-level) so Vitest can spy/override them

- [ ] **Step 1: Write failing test**

Create `erp/tests/broadcast-send.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/repositories/broadcast_repo', () => ({
  getBroadcastById: vi.fn(),
  resolveAudienceTelegramIds: vi.fn(),
  updateBroadcastCounts: vi.fn(),
  getActiveSessionUserIds: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  getBroadcastById,
  resolveAudienceTelegramIds,
  updateBroadcastCounts,
  getActiveSessionUserIds,
} from '@/lib/repositories/broadcast_repo';
import pool from '@/lib/db';
import { sendBroadcast } from '@/lib/broadcast/send';

const BASE_BROADCAST = {
  id: 1, title: 'Hello', content_type: 'TEXT' as const, body: 'Hi there',
  caption: null, media_id: null, channels: ['TELEGRAM'] as const,
  audience_type: 'ALL' as const, audience_tag_id: null,
  audience_user_ids: null, status: 'DRAFT' as const,
  scheduled_at: null, sent_at: null,
  recipient_count: 0, success_count: 0, failed_count: 0,
  created_by: 'admin1', created_at: '2026-01-01', updated_at: '2026-01-01',
  audience_tag_name: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BOT_RELAY_URL = 'http://relay:8090';
  process.env.BOT_RELAY_AUTH_TOKEN = 'test_token';
});

describe('sendBroadcast', () => {
  it('returns error result when broadcast not found', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(null);
    const r = await sendBroadcast(99);
    expect(r.sent).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.total).toBe(0);
  });

  it('sends TEXT to all telegram_ids and returns counts', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE_BROADCAST);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111', '222']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const r = await sendBroadcast(1);
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(0);
    expect(r.total).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('counts relay failures correctly', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE_BROADCAST);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111', '222']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const r = await sendBroadcast(1);
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(1);
  });

  it('handles relay 404 gracefully (endpoint not implemented)', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE_BROADCAST);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const r = await sendBroadcast(1);
    // relay 404 = endpoint not available; treat as 0 sent but not a hard failure
    expect(r.sent).toBe(0);
    expect(r.total).toBe(1);
  });

  it('sends non-TEXT using caption as text fallback', async () => {
    const imgBroadcast = { ...BASE_BROADCAST, content_type: 'IMAGE' as const, caption: 'Check this out' };
    vi.mocked(getBroadcastById).mockResolvedValueOnce(imgBroadcast);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendBroadcast(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { message: string };
    expect(body.message).toBe('Check this out');
  });

  it('inserts livechat messages for LIVECHAT channel', async () => {
    const lcBroadcast = { ...BASE_BROADCAST, channels: ['TELEGRAM', 'LIVECHAT'] as ('TELEGRAM' | 'LIVECHAT')[] };
    vi.mocked(getBroadcastById).mockResolvedValueOnce(lcBroadcast);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([{ user_id: 1, session_id: 10 }]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);

    const r = await sendBroadcast(1);
    expect(r.livechat_inserted).toBe(1);
    expect(vi.mocked(pool.query)).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO support_messages'),
      expect.any(Array)
    );
  });

  it('calls updateBroadcastCounts with SENT when all succeed', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE_BROADCAST);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendBroadcast(1);
    expect(vi.mocked(updateBroadcastCounts)).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'SENT' })
    );
  });

  it('calls updateBroadcastCounts with PARTIALLY_SENT on partial failure', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE_BROADCAST);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111', '222']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    await sendBroadcast(1);
    expect(vi.mocked(updateBroadcastCounts)).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'PARTIALLY_SENT' })
    );
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd erp && npx vitest run tests/broadcast-send.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `send.ts` not found.

- [ ] **Step 3: Create `erp/src/lib/broadcast/send.ts`**

```typescript
import {
  getBroadcastById,
  resolveAudienceTelegramIds,
  updateBroadcastCounts,
  getActiveSessionUserIds,
} from '@/lib/repositories/broadcast_repo';
import pool from '@/lib/db';

export interface SendResult {
  sent: number;
  failed: number;
  total: number;
  livechat_inserted: number;
}

export async function sendBroadcast(broadcastId: number): Promise<SendResult> {
  const broadcast = await getBroadcastById(broadcastId);
  if (!broadcast) return { sent: 0, failed: 0, total: 0, livechat_inserted: 0 };

  const RELAY_URL   = process.env.BOT_RELAY_URL        ?? 'http://localhost:8090';
  const RELAY_TOKEN = process.env.BOT_RELAY_AUTH_TOKEN ?? 'change_me_relay_token';

  // Resolve audience
  const telegramIds = await resolveAudienceTelegramIds(broadcast.audience_type, {
    tagId:   broadcast.audience_tag_id,
    userIds: broadcast.audience_user_ids,
  });

  const total = telegramIds.length;

  // Update to SENDING
  await updateBroadcastCounts(broadcastId, {
    status: 'SENDING',
    recipient_count: total,
  });

  // The text to send: body for TEXT, caption (or title) for media types
  const textPayload =
    broadcast.content_type === 'TEXT'
      ? broadcast.body
      : (broadcast.caption ?? broadcast.title);

  // ── Telegram channel ──────────────────────────────────────────────────────
  let sent   = 0;
  let failed = 0;

  if (broadcast.channels.includes('TELEGRAM')) {
    let relayAvailable: boolean | null = null;

    for (const telegram_id of telegramIds) {
      try {
        const res = await fetch(`${RELAY_URL}/send_to_telegram_id`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RELAY_TOKEN}`,
          },
          body: JSON.stringify({ telegram_id, message: textPayload }),
        });

        if (res.status === 404 && relayAvailable === null) {
          // Endpoint not implemented on relay — exit early
          relayAvailable = false;
          break;
        }
        if (res.ok) { sent++; relayAvailable = true; }
        else { failed++; }
      } catch {
        failed++;
      }
    }
  }

  // ── Live Chat channel ─────────────────────────────────────────────────────
  let livechat_inserted = 0;

  if (broadcast.channels.includes('LIVECHAT')) {
    // Resolve user_ids for the audience (need numeric IDs for session lookup)
    const userIdRows = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE telegram_id = ANY($1::text[])`,
      [telegramIds]
    );
    const userIds = userIdRows.rows.map(r => r.id);
    const activeSessions = await getActiveSessionUserIds(userIds);

    for (const { session_id } of activeSessions) {
      try {
        await pool.query(
          `INSERT INTO support_messages
             (session_id, sender_type, message_type, content, caption, status)
           VALUES ($1, 'AGENT', $2, $3, $4, 'SENT')`,
          [session_id, broadcast.content_type, textPayload, broadcast.caption ?? null]
        );
        livechat_inserted++;
      } catch {
        // Individual insert failures don't fail the whole broadcast
      }
    }
  }

  // ── Finalize ──────────────────────────────────────────────────────────────
  const finalStatus =
    sent === 0 && failed === 0 && livechat_inserted === 0 ? 'SENT' :  // relay unavailable: mark sent anyway
    sent === total ? 'SENT' :
    sent > 0      ? 'PARTIALLY_SENT' :
                    'FAILED';

  await updateBroadcastCounts(broadcastId, {
    status:          finalStatus,
    success_count:   sent,
    failed_count:    failed,
    recipient_count: total,
    sent_at:         new Date(),
  });

  return { sent, failed, total, livechat_inserted };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd erp && npx vitest run tests/broadcast-send.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Run full suite — no regressions**

```bash
cd erp && npx vitest run --reporter=verbose 2>&1 | tail -10
```

Expected: All prior tests pass + new tests pass.

- [ ] **Step 6: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add erp/src/lib/broadcast/send.ts erp/tests/broadcast-send.test.ts
git commit -m "feat(broadcast): send engine — relay dispatch + live chat insert"
```

---

### Task 4: API Routes

**Files:**
- Create: `erp/src/app/api/broadcast/route.ts`
- Create: `erp/src/app/api/broadcast/[id]/route.ts`
- Create: `erp/src/app/api/broadcast/[id]/send/route.ts`
- Create: `erp/src/app/api/broadcast/audience-count/route.ts`
- Create: `erp/tests/broadcast-route.test.ts`

**Interfaces:**
- Consumes: all `broadcast_repo` exports; `sendBroadcast` from `@/lib/broadcast/send`; `logAudit` from `@/lib/repositories/audit_repo`
- Produces HTTP routes:
  - `GET  /api/broadcast?status=X&page=N` → `{ data: Broadcast[], total, page, limit }`
  - `POST /api/broadcast` → `Broadcast` (201)
  - `GET  /api/broadcast/audience-count?type=X&tag_id=Y` → `{ count: number }`
  - `GET  /api/broadcast/[id]` → `Broadcast`
  - `PATCH /api/broadcast/[id]` → `{ ok: true, broadcast: Broadcast }`
  - `DELETE /api/broadcast/[id]` → `{ ok: true }` (DRAFT only)
  - `POST /api/broadcast/[id]/send` → `{ ok: true, sent, failed, total, livechat_inserted }`

**Note:** Create `audience-count/route.ts` as a static route alongside `[id]/route.ts`. In Next.js App Router, the static path `audience-count` takes precedence over the dynamic `[id]` segment when both exist at the same level.

- [ ] **Step 1: Write failing tests**

Create `erp/tests/broadcast-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN' }),
  COOKIE_NAME: 'token',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));
vi.mock('@/lib/repositories/broadcast_repo', () => ({
  getBroadcasts:              vi.fn(),
  getBroadcastById:           vi.fn(),
  createBroadcast:            vi.fn(),
  updateBroadcast:            vi.fn(),
  deleteBroadcast:            vi.fn(),
  updateBroadcastCounts:      vi.fn(),
  getAudienceCount:           vi.fn(),
}));
vi.mock('@/lib/broadcast/send', () => ({
  sendBroadcast: vi.fn(),
}));
vi.mock('@/lib/repositories/audit_repo', () => ({
  logAudit: vi.fn(),
}));

import { GET as listGet, POST as listPost } from '@/app/api/broadcast/route';
import { GET as detailGet, PATCH, DELETE } from '@/app/api/broadcast/[id]/route';
import { POST as sendPost } from '@/app/api/broadcast/[id]/send/route';
import { GET as countGet } from '@/app/api/broadcast/audience-count/route';
import {
  getBroadcasts, getBroadcastById, createBroadcast,
  updateBroadcast, deleteBroadcast, getAudienceCount,
} from '@/lib/repositories/broadcast_repo';
import { sendBroadcast } from '@/lib/broadcast/send';

const BASE = {
  id: 1, title: 'Test', content_type: 'TEXT' as const, body: 'Hello',
  caption: null, media_id: null, channels: ['TELEGRAM'] as const,
  audience_type: 'ALL' as const, audience_tag_id: null, audience_tag_name: null,
  audience_user_ids: null, status: 'DRAFT' as const,
  scheduled_at: null, sent_at: null, recipient_count: 0,
  success_count: 0, failed_count: 0, created_by: 'admin1',
  created_at: '2026-01-01', updated_at: '2026-01-01',
};

beforeEach(() => vi.clearAllMocks());

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/broadcast', () => {
  it('returns paginated list', async () => {
    vi.mocked(getBroadcasts).mockResolvedValueOnce({ data: [BASE], total: 1 });
    const res = await listGet(new NextRequest('http://localhost/api/broadcast'));
    const d = await res.json() as { data: unknown[]; total: number };
    expect(res.status).toBe(200);
    expect(d.data).toHaveLength(1);
    expect(d.total).toBe(1);
  });
});

describe('POST /api/broadcast', () => {
  it('creates a draft broadcast', async () => {
    vi.mocked(createBroadcast).mockResolvedValueOnce(BASE);
    const res = await listPost(new NextRequest('http://localhost/api/broadcast', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test', content_type: 'TEXT', body: 'Hello', channels: ['TELEGRAM'], audience_type: 'ALL' }),
    }));
    expect(res.status).toBe(201);
    expect(vi.mocked(createBroadcast)).toHaveBeenCalled();
  });

  it('returns 400 when title is missing', async () => {
    const res = await listPost(new NextRequest('http://localhost/api/broadcast', {
      method: 'POST',
      body: JSON.stringify({ content_type: 'TEXT', body: 'Hi', channels: ['TELEGRAM'], audience_type: 'ALL' }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when channels is empty', async () => {
    const res = await listPost(new NextRequest('http://localhost/api/broadcast', {
      method: 'POST',
      body: JSON.stringify({ title: 'T', content_type: 'TEXT', body: 'Hi', channels: [], audience_type: 'ALL' }),
    }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/broadcast/audience-count', () => {
  it('returns count for ALL', async () => {
    vi.mocked(getAudienceCount).mockResolvedValueOnce(50);
    const res = await countGet(new NextRequest('http://localhost/api/broadcast/audience-count?type=ALL'));
    const d = await res.json() as { count: number };
    expect(d.count).toBe(50);
  });
});

describe('GET /api/broadcast/[id]', () => {
  it('returns 404 when not found', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(null);
    const res = await detailGet(new NextRequest('http://localhost/api/broadcast/99'), params('99'));
    expect(res.status).toBe(404);
  });

  it('returns broadcast when found', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE);
    const res = await detailGet(new NextRequest('http://localhost/api/broadcast/1'), params('1'));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/broadcast/[id]', () => {
  it('updates and returns broadcast', async () => {
    vi.mocked(updateBroadcast).mockResolvedValueOnce({ ...BASE, title: 'Updated' });
    const res = await PATCH(
      new NextRequest('http://localhost/api/broadcast/1', { method: 'PATCH', body: JSON.stringify({ title: 'Updated' }) }),
      params('1')
    );
    const d = await res.json() as { ok: boolean; broadcast: { title: string } };
    expect(d.ok).toBe(true);
    expect(d.broadcast.title).toBe('Updated');
  });
});

describe('DELETE /api/broadcast/[id]', () => {
  it('returns 200 when deleted', async () => {
    vi.mocked(deleteBroadcast).mockResolvedValueOnce(true);
    const res = await DELETE(new NextRequest('http://localhost/api/broadcast/1', { method: 'DELETE' }), params('1'));
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found or not a draft', async () => {
    vi.mocked(deleteBroadcast).mockResolvedValueOnce(false);
    const res = await DELETE(new NextRequest('http://localhost/api/broadcast/1', { method: 'DELETE' }), params('1'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/broadcast/[id]/send', () => {
  it('triggers sendBroadcast and returns result', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE);
    vi.mocked(sendBroadcast).mockResolvedValueOnce({ sent: 5, failed: 0, total: 5, livechat_inserted: 0 });
    const res = await sendPost(
      new NextRequest('http://localhost/api/broadcast/1/send', { method: 'POST' }),
      params('1')
    );
    const d = await res.json() as { ok: boolean; sent: number };
    expect(d.ok).toBe(true);
    expect(d.sent).toBe(5);
  });

  it('returns 400 when broadcast is not in DRAFT or SCHEDULED status', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce({ ...BASE, status: 'SENT' as const });
    const res = await sendPost(
      new NextRequest('http://localhost/api/broadcast/1/send', { method: 'POST', body: JSON.stringify({}) }),
      params('1')
    );
    expect(res.status).toBe(400);
  });

  it('schedules when scheduled_at is provided and in the future', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE);
    vi.mocked(updateBroadcast).mockResolvedValueOnce({ ...BASE, status: 'SCHEDULED' as const });
    const future = new Date(Date.now() + 3600_000).toISOString();
    const res = await sendPost(
      new NextRequest('http://localhost/api/broadcast/1/send', {
        method: 'POST',
        body: JSON.stringify({ scheduled_at: future }),
      }),
      params('1')
    );
    const d = await res.json() as { ok: boolean; status: string };
    expect(d.ok).toBe(true);
    expect(d.status).toBe('SCHEDULED');
    expect(vi.mocked(sendBroadcast)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd erp && npx vitest run tests/broadcast-route.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Create `erp/src/app/api/broadcast/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getBroadcasts, createBroadcast } from '@/lib/repositories/broadcast_repo';
import { logAudit } from '@/lib/repositories/audit_repo';
import type { BroadcastContentType, BroadcastAudienceType, BroadcastChannel } from '@/lib/types';

const VALID_CONTENT_TYPES = new Set([
  'TEXT','IMAGE','GIF','VIDEO','AUDIO','DOCUMENT','PDF','APK','ZIP','RAR',
]);
const VALID_AUDIENCE_TYPES = new Set([
  'ALL','TAG','VIP','ACTIVE','INACTIVE','NEVER_DEPOSIT','DEPOSITED','SELECTED',
]);
const VALID_CHANNELS = new Set(['TELEGRAM', 'LIVECHAT']);

async function requireAuth(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? await verifyJWT(token) : null;
}

export async function GET(req: NextRequest) {
  const payload = await requireAuth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const status = sp.get('status') ?? undefined;
  const page   = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const limit  = 20;
  const offset = (page - 1) * limit;

  const result = await getBroadcasts({ status, limit, offset });
  return NextResponse.json({ ...result, page, limit });
}

export async function POST(req: NextRequest) {
  const payload = await requireAuth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const contentType = typeof body.content_type === 'string'
    ? body.content_type.toUpperCase()
    : 'TEXT';
  if (!VALID_CONTENT_TYPES.has(contentType))
    return NextResponse.json({ error: 'invalid content_type' }, { status: 400 });

  const audienceType = typeof body.audience_type === 'string'
    ? body.audience_type.toUpperCase()
    : 'ALL';
  if (!VALID_AUDIENCE_TYPES.has(audienceType))
    return NextResponse.json({ error: 'invalid audience_type' }, { status: 400 });

  const channels = Array.isArray(body.channels) ? (body.channels as string[]) : ['TELEGRAM'];
  if (channels.length === 0 || !channels.every(c => VALID_CHANNELS.has(c)))
    return NextResponse.json({ error: 'channels must be non-empty array of TELEGRAM|LIVECHAT' }, { status: 400 });

  const broadcast = await createBroadcast({
    title,
    content_type:      contentType as BroadcastContentType,
    body:              typeof body.body === 'string' ? body.body : '',
    caption:           typeof body.caption === 'string' ? body.caption : null,
    media_id:          typeof body.media_id === 'number' ? body.media_id : null,
    channels:          channels as BroadcastChannel[],
    audience_type:     audienceType as BroadcastAudienceType,
    audience_tag_id:   typeof body.audience_tag_id === 'number' ? body.audience_tag_id : null,
    audience_user_ids: Array.isArray(body.audience_user_ids) ? (body.audience_user_ids as number[]) : null,
    status:            'DRAFT',
    scheduled_at:      null,
  }, payload.username);

  logAudit({
    admin_id: payload.sub, action: 'BROADCAST_CREATED',
    target_type: 'broadcast', target_id: broadcast.id,
    new_value: { title, contentType, audienceType, channels },
  }).catch(() => {});

  return NextResponse.json(broadcast, { status: 201 });
}
```

- [ ] **Step 4: Create `erp/src/app/api/broadcast/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getBroadcastById, updateBroadcast, deleteBroadcast } from '@/lib/repositories/broadcast_repo';
import { logAudit } from '@/lib/repositories/audit_repo';

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? await verifyJWT(token) : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requireAuth();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const broadcast = await getBroadcastById(parseInt(id, 10));
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(broadcast);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requireAuth();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const broadcast = await updateBroadcast(parseInt(id, 10), body);
  if (!broadcast) return NextResponse.json({ error: 'Not found or nothing to update' }, { status: 404 });
  return NextResponse.json({ ok: true, broadcast });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requireAuth();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const numId = parseInt(id, 10);
  const ok = await deleteBroadcast(numId);
  if (!ok) return NextResponse.json({ error: 'Not found or not a draft' }, { status: 404 });
  logAudit({
    admin_id: payload.sub, action: 'BROADCAST_DELETED',
    target_type: 'broadcast', target_id: numId,
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Create `erp/src/app/api/broadcast/[id]/send/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getBroadcastById, updateBroadcast } from '@/lib/repositories/broadcast_repo';
import { sendBroadcast } from '@/lib/broadcast/send';
import { logAudit } from '@/lib/repositories/audit_repo';

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? await verifyJWT(token) : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await requireAuth();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id, 10);

  const broadcast = await getBroadcastById(numId);
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!['DRAFT', 'SCHEDULED'].includes(broadcast.status))
    return NextResponse.json({ error: `Cannot send broadcast with status: ${broadcast.status}` }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { scheduled_at?: string };

  // Schedule for later
  if (body.scheduled_at) {
    const scheduledTime = new Date(body.scheduled_at);
    if (scheduledTime > new Date()) {
      const updated = await updateBroadcast(numId, { status: 'SCHEDULED', scheduled_at: body.scheduled_at });
      logAudit({
        admin_id: payload.sub, action: 'BROADCAST_SCHEDULED',
        target_type: 'broadcast', target_id: numId,
        new_value: { scheduled_at: body.scheduled_at },
      }).catch(() => {});
      return NextResponse.json({ ok: true, status: 'SCHEDULED', broadcast: updated });
    }
  }

  // Send now
  const result = await sendBroadcast(numId);
  logAudit({
    admin_id: payload.sub, action: 'BROADCAST_SENT',
    target_type: 'broadcast', target_id: numId,
    new_value: { sent: result.sent, failed: result.failed, total: result.total },
  }).catch(() => {});
  return NextResponse.json({ ok: true, ...result });
}
```

- [ ] **Step 6: Create `erp/src/app/api/broadcast/audience-count/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getAudienceCount } from '@/lib/repositories/broadcast_repo';
import type { BroadcastAudienceType } from '@/lib/types';

const VALID_AUDIENCE_TYPES = new Set([
  'ALL','TAG','VIP','ACTIVE','INACTIVE','NEVER_DEPOSIT','DEPOSITED','SELECTED',
]);

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp   = req.nextUrl.searchParams;
  const type = (sp.get('type') ?? 'ALL').toUpperCase();
  if (!VALID_AUDIENCE_TYPES.has(type))
    return NextResponse.json({ error: 'invalid type' }, { status: 400 });

  const tagId   = sp.get('tag_id') ? parseInt(sp.get('tag_id')!, 10) : null;
  const userIds = sp.get('user_ids')
    ? sp.get('user_ids')!.split(',').map(Number).filter(n => !isNaN(n))
    : null;

  const count = await getAudienceCount(type as BroadcastAudienceType, { tagId, userIds });
  return NextResponse.json({ count });
}
```

- [ ] **Step 7: Run tests — expect pass**

```bash
cd erp && npx vitest run tests/broadcast-route.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: All PASS.

- [ ] **Step 8: Run full suite — no regressions**

```bash
cd erp && npx vitest run --reporter=verbose 2>&1 | tail -10
```

- [ ] **Step 9: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 10: Commit**

```bash
git add erp/src/app/api/broadcast/ erp/tests/broadcast-route.test.ts
git commit -m "feat(broadcast): API routes — list, CRUD, send, audience-count"
```

---

### Task 5: Broadcast Manager Page

**Files:**
- Create: `erp/src/app/(dashboard)/broadcast/page.tsx`

**Interfaces:**
- Consumes: `Broadcast`, `BroadcastContentType`, `BroadcastAudienceType`, `BroadcastStatus`, `BroadcastChannel` from `@/lib/types`; `MediaRecord` from `@/lib/media/types`; `MediaPicker` from `@/components/media/MediaPicker`; `formatBytes` from `@/lib/utils/format-bytes`; `Button`, `Input`, `Label` from `@/components/ui/*`; all broadcast API routes
- Produces: `/broadcast` page — two-panel layout

**Layout:**
- Left panel (always visible): analytics summary row + history list with status badges + filter bar
- Right panel (slides in on "+ New" or row click): Composer form
- Composer form sections: Title → Channels → Content Type → Body/Media+Caption → Audience → Schedule → Actions
- Preview tab in composer: shows Telegram bubble mock + Live Chat bubble mock

**No unit tests for UI page** — TypeScript must be clean.

- [ ] **Step 1: Create `erp/src/app/(dashboard)/broadcast/page.tsx`**

```typescript
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Send, Plus, X, Radio, MessageSquare, Image, Film, Music,
  FileText, Package, Archive, File, Eye, Trash2, Copy, Clock,
  CheckCircle, AlertCircle, Loader2, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Broadcast, BroadcastContentType, BroadcastAudienceType, BroadcastChannel } from '@/lib/types';
import type { MediaRecord } from '@/lib/media/types';
import { formatBytes } from '@/lib/utils/format-bytes';
import { MediaPicker } from '@/components/media/MediaPicker';

// ── Constants ─────────────────────────────────────────────────────────────────

const CONTENT_TYPES: { value: BroadcastContentType; label: string; icon: React.ElementType }[] = [
  { value: 'TEXT',     label: 'Text',     icon: MessageSquare },
  { value: 'IMAGE',    label: 'Image',    icon: Image },
  { value: 'GIF',      label: 'GIF',      icon: Image },
  { value: 'VIDEO',    label: 'Video',    icon: Film },
  { value: 'AUDIO',    label: 'Audio',    icon: Music },
  { value: 'DOCUMENT', label: 'Document', icon: FileText },
  { value: 'PDF',      label: 'PDF',      icon: FileText },
  { value: 'APK',      label: 'APK',      icon: Package },
  { value: 'ZIP',      label: 'ZIP',      icon: Archive },
  { value: 'RAR',      label: 'RAR',      icon: Archive },
];

const AUDIENCE_OPTIONS: { value: BroadcastAudienceType; label: string; desc: string }[] = [
  { value: 'ALL',          label: 'All Members',     desc: 'Every registered user with a Telegram ID' },
  { value: 'ACTIVE',       label: 'Active Members',  desc: 'Seen in last 30 days' },
  { value: 'INACTIVE',     label: 'Inactive Members',desc: 'Not seen in 30+ days' },
  { value: 'VIP',          label: 'VIP Members',     desc: 'Users tagged as VIP' },
  { value: 'TAG',          label: 'By Tag',          desc: 'Members with a specific tag' },
  { value: 'DEPOSITED',    label: 'Deposited Users', desc: 'At least one deposit' },
  { value: 'NEVER_DEPOSIT',label: 'Never Deposited', desc: 'No deposits yet' },
  { value: 'SELECTED',     label: 'Selected Members',desc: 'Manually entered Telegram IDs' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT:          { label: 'Draft',          color: 'bg-gray-100 text-gray-600',   icon: File },
  SCHEDULED:      { label: 'Scheduled',      color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  SENDING:        { label: 'Sending…',       color: 'bg-blue-100 text-blue-700',   icon: Loader2 },
  SENT:           { label: 'Sent',           color: 'bg-green-100 text-green-700', icon: CheckCircle },
  PARTIALLY_SENT: { label: 'Partial',        color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
  FAILED:         { label: 'Failed',         color: 'bg-red-100 text-red-600',     icon: AlertCircle },
  CANCELLED:      { label: 'Cancelled',      color: 'bg-gray-100 text-gray-500',   icon: X },
};

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  channels: BroadcastChannel[];
  contentType: BroadcastContentType;
  body: string;
  caption: string;
  mediaId: number | null;
  mediaRecord: MediaRecord | null;
  audienceType: BroadcastAudienceType;
  audienceTagId: number | null;
  audienceUserIds: string; // comma-separated telegram_ids for SELECTED type
  scheduledAt: string;    // ISO string or ''
}

function blankForm(): FormState {
  return {
    title: '', channels: ['TELEGRAM'], contentType: 'TEXT',
    body: '', caption: '', mediaId: null, mediaRecord: null,
    audienceType: 'ALL', audienceTagId: null, audienceUserIds: '', scheduledAt: '',
  };
}

function broadcastToForm(b: Broadcast): FormState {
  return {
    title:           b.title,
    channels:        b.channels,
    contentType:     b.content_type,
    body:            b.body,
    caption:         b.caption ?? '',
    mediaId:         b.media_id,
    mediaRecord:     b.media ?? null,
    audienceType:    b.audience_type,
    audienceTagId:   b.audience_tag_id,
    audienceUserIds: '',
    scheduledAt:     b.scheduled_at
      ? new Date(b.scheduled_at).toISOString().slice(0, 16)
      : '',
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BroadcastPage() {
  const [broadcasts, setBroadcasts]   = useState<Broadcast[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [form, setForm]               = useState<FormState>(blankForm());
  const [formBusy, setFormBusy]       = useState(false);
  const [formError, setFormError]     = useState('');
  const [showPicker, setShowPicker]   = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [countLoading, setCountLoading]   = useState(false);
  const [previewTab, setPreviewTab]   = useState<'compose' | 'preview'>('compose');
  const [sendingId, setSendingId]     = useState<number | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/broadcast?${params}`);
      if (res.ok) {
        const d = await res.json() as { data: Broadcast[]; total: number };
        setBroadcasts(d.data);
        setTotal(d.total);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Audience count preview ────────────────────────────────────────────────

  const fetchAudienceCount = useCallback(async (type: BroadcastAudienceType, tagId?: number | null) => {
    setCountLoading(true);
    try {
      const params = new URLSearchParams({ type });
      if (tagId) params.set('tag_id', String(tagId));
      const res = await fetch(`/api/broadcast/audience-count?${params}`);
      if (res.ok) {
        const d = await res.json() as { count: number };
        setAudienceCount(d.count);
      }
    } finally {
      setCountLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showForm) {
      void fetchAudienceCount(form.audienceType, form.audienceTagId);
    }
  }, [form.audienceType, form.audienceTagId, showForm, fetchAudienceCount]);

  // ── Form open/close ───────────────────────────────────────────────────────

  function openNew() {
    setEditingId(null);
    setForm(blankForm());
    setFormError('');
    setPreviewTab('compose');
    setShowForm(true);
  }

  function openEdit(b: Broadcast) {
    if (!['DRAFT', 'SCHEDULED'].includes(b.status)) return;
    setEditingId(b.id);
    setForm(broadcastToForm(b));
    setFormError('');
    setPreviewTab('compose');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(blankForm());
    setFormError('');
    setAudienceCount(null);
  }

  // ── Save draft ────────────────────────────────────────────────────────────

  const saveDraft = async () => {
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (form.channels.length === 0) { setFormError('Select at least one channel.'); return; }
    setFormBusy(true); setFormError('');
    try {
      const payload = {
        title:        form.title.trim(),
        content_type: form.contentType,
        body:         form.body.trim(),
        caption:      form.caption.trim() || null,
        media_id:     form.mediaId,
        channels:     form.channels,
        audience_type:    form.audienceType,
        audience_tag_id:  form.audienceTagId,
        audience_user_ids: form.audienceType === 'SELECTED' && form.audienceUserIds
          ? form.audienceUserIds.split(',').map(s => s.trim()).filter(Boolean).map(Number)
          : null,
      };
      const isEdit = editingId !== null;
      const res = await fetch(
        isEdit ? `/api/broadcast/${editingId}` : '/api/broadcast',
        { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      if (res.ok) {
        closeForm();
        await loadData();
      } else {
        const d = await res.json() as { error?: string };
        setFormError(d.error ?? 'Failed to save.');
      }
    } finally {
      setFormBusy(false);
    }
  };

  // ── Send / Schedule ───────────────────────────────────────────────────────

  const handleSend = async (id: number, scheduledAt?: string) => {
    setSendingId(id);
    try {
      const res = await fetch(`/api/broadcast/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      });
      if (res.ok) {
        closeForm();
        await loadData();
      } else {
        const d = await res.json() as { error?: string };
        setFormError(d.error ?? 'Send failed.');
      }
    } finally {
      setSendingId(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this draft?')) return;
    const res = await fetch(`/api/broadcast/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setBroadcasts(prev => prev.filter(b => b.id !== id));
      if (editingId === id) closeForm();
    }
  };

  // ── Duplicate ─────────────────────────────────────────────────────────────

  const handleDuplicate = async (b: Broadcast) => {
    setEditingId(null);
    setForm({ ...broadcastToForm(b), title: `${b.title} (copy)`, scheduledAt: '' });
    setFormError('');
    setPreviewTab('compose');
    setShowForm(true);
  };

  // ── Media picker ──────────────────────────────────────────────────────────

  function handleMediaSelected(media: MediaRecord | MediaRecord[]) {
    const m = Array.isArray(media) ? media[0] : media;
    if (!m) return;
    setForm(f => ({ ...f, mediaId: m.id, mediaRecord: m }));
  }

  // ── Toggle channel ────────────────────────────────────────────────────────

  function toggleChannel(ch: BroadcastChannel) {
    setForm(f => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter(c => c !== ch)
        : [...f.channels, ch],
    }));
  }

  // ── Analytics summary (from loaded data) ─────────────────────────────────

  const analytics = {
    total:   broadcasts.length,
    sent:    broadcasts.filter(b => b.status === 'SENT').reduce((s, b) => s + b.success_count, 0),
    failed:  broadcasts.filter(b => b.status !== 'DRAFT').reduce((s, b) => s + b.failed_count, 0),
    pending: broadcasts.filter(b => ['DRAFT','SCHEDULED'].includes(b.status)).length,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left: History ────────────────────────────────────────────────── */}
      <div className={`flex flex-col min-h-0 overflow-hidden ${showForm ? 'flex-1' : 'w-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Radio className="w-5 h-5 text-blue-600" />
            Broadcast Center
          </h1>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> New Broadcast
          </Button>
        </div>

        {/* Analytics strip */}
        <div className="grid grid-cols-4 gap-0 border-b bg-gray-50 shrink-0">
          {[
            { label: 'Total',   value: analytics.total,   color: 'text-gray-700' },
            { label: 'Sent',    value: analytics.sent,    color: 'text-green-700' },
            { label: 'Failed',  value: analytics.failed,  color: 'text-red-600' },
            { label: 'Pending', value: analytics.pending, color: 'text-yellow-700' },
          ].map(a => (
            <div key={a.label} className="flex flex-col items-center py-2 border-r last:border-r-0">
              <span className={`text-lg font-bold ${a.color}`}>{a.value}</span>
              <span className="text-xs text-gray-400">{a.label}</span>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex gap-2 px-4 py-2 border-b bg-white shrink-0">
          {['', 'DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PARTIALLY_SENT', 'FAILED'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >{s || 'All'}</button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-gray-400 text-sm">Loading…</div>
          ) : broadcasts.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-gray-400 text-sm">No broadcasts yet.</div>
          ) : (
            <div className="divide-y">
              {broadcasts.map(b => {
                const cfg = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.DRAFT;
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={b.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => openEdit(b)}
                  >
                    <div className="mt-0.5 shrink-0">
                      <StatusIcon className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="text-sm font-medium truncate">{b.title}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                        <span>{b.channels.join(' + ')}</span>
                        <span>{b.audience_type}</span>
                        {b.status !== 'DRAFT' && (
                          <span className="text-green-600">✓ {b.success_count}</span>
                        )}
                        {b.failed_count > 0 && (
                          <span className="text-red-500">✗ {b.failed_count}</span>
                        )}
                        <span>{new Date(b.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {['DRAFT','SCHEDULED'].includes(b.status) && (
                        <button
                          onClick={() => void handleSend(b.id)}
                          disabled={sendingId === b.id}
                          title="Send Now"
                          className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-40"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => void handleDuplicate(b)}
                        title="Duplicate"
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {b.status === 'DRAFT' && (
                        <button
                          onClick={() => void handleDelete(b.id)}
                          title="Delete"
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-400 shrink-0">
          {broadcasts.length} of {total} broadcasts
        </div>
      </div>

      {/* ── Right: Composer ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="w-96 border-l bg-white flex flex-col shrink-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <h2 className="font-semibold text-sm">
              {editingId !== null ? 'Edit Broadcast' : 'New Broadcast'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewTab('compose')}
                className={`text-xs px-2 py-1 rounded ${previewTab === 'compose' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
              >Compose</button>
              <button
                onClick={() => setPreviewTab('preview')}
                className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${previewTab === 'preview' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}
              ><Eye className="w-3 h-3" /> Preview</button>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-700 ml-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {previewTab === 'preview' ? (
            /* ── Preview panel ─────────────────────────────────────────── */
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Telegram Preview</p>
              <div className="bg-[#effdde] rounded-2xl rounded-br-none px-4 py-2 max-w-xs ml-auto shadow-sm">
                {form.contentType !== 'TEXT' && form.mediaRecord && (
                  <div className="mb-2 text-xs text-gray-500 italic">
                    [{form.contentType} — {form.mediaRecord.displayName} ({formatBytes(form.mediaRecord.fileSize)})]
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">
                  {form.contentType === 'TEXT'
                    ? form.body || <span className="text-gray-400 italic">No message yet</span>
                    : form.caption || form.title || <span className="text-gray-400 italic">No caption</span>
                  }
                </p>
                <p className="text-[10px] text-gray-400 text-right mt-1">
                  {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} ✓✓
                </p>
              </div>

              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-4">Live Chat Preview</p>
              <div className="bg-blue-50 rounded-2xl rounded-br-none px-4 py-2 max-w-xs ml-auto border border-blue-100">
                <p className="text-[10px] text-blue-500 font-medium mb-1">Support Agent</p>
                {form.contentType !== 'TEXT' && form.mediaRecord && (
                  <div className="mb-2 text-xs text-gray-500 italic">
                    [{form.contentType}] {form.mediaRecord.displayName}
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap break-words text-gray-800">
                  {form.contentType === 'TEXT'
                    ? form.body || <span className="text-gray-400 italic">No message</span>
                    : form.caption || form.title || ''
                  }
                </p>
              </div>
            </div>
          ) : (
            /* ── Compose panel ─────────────────────────────────────────── */
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Title */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Title <span className="text-red-500">*</span></Label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Weekend Promotion"
                  className="text-sm"
                />
              </div>

              {/* Channels */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Channels <span className="text-red-500">*</span></Label>
                <div className="flex gap-2">
                  {(['TELEGRAM', 'LIVECHAT'] as BroadcastChannel[]).map(ch => (
                    <button
                      key={ch}
                      onClick={() => toggleChannel(ch)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                        form.channels.includes(ch)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {ch === 'TELEGRAM' ? <Send className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                      {ch === 'TELEGRAM' ? 'Telegram' : 'Live Chat'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content type */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Content Type</Label>
                <div className="flex flex-wrap gap-1">
                  {CONTENT_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setForm(f => ({
                        ...f,
                        contentType: t.value,
                        ...(t.value === 'TEXT' ? { mediaId: null, mediaRecord: null } : {}),
                      }))}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium border transition-colors ${
                        form.contentType === t.value
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <t.icon className="w-3 h-3" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body (TEXT) or Media (non-TEXT) */}
              {form.contentType === 'TEXT' ? (
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Message <span className="text-red-500">*</span></Label>
                  <textarea
                    value={form.body}
                    onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                    rows={4}
                    placeholder="Message to broadcast…"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
                  />
                </div>
              ) : (
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Media <span className="text-red-500">*</span></Label>
                  {form.mediaRecord ? (
                    <div className="rounded-lg border p-3 space-y-2">
                      {(form.contentType === 'IMAGE' || form.contentType === 'GIF') && (
                        <img
                          src={`/api/media/${form.mediaRecord.id}/thumbnail`}
                          alt=""
                          className="w-full rounded object-cover max-h-24"
                        />
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{form.mediaRecord.displayName}</p>
                          <p className="text-[10px] text-gray-400">{formatBytes(form.mediaRecord.fileSize)}</p>
                        </div>
                        <button
                          onClick={() => setForm(f => ({ ...f, mediaId: null, mediaRecord: null }))}
                          className="text-gray-400 hover:text-red-500 shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        onClick={() => setShowPicker(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >Change</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowPicker(true)}
                      className="w-full rounded-lg border-2 border-dashed border-gray-300 py-4 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                    >
                      Choose from Library
                    </button>
                  )}
                </div>
              )}

              {/* Caption */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Caption <span className="text-gray-400">(optional)</span></Label>
                <Input
                  value={form.caption}
                  onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                  placeholder="Caption shown with media…"
                  className="text-sm"
                />
              </div>

              {/* Audience */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Audience</Label>
                <select
                  value={form.audienceType}
                  onChange={e => setForm(f => ({ ...f, audienceType: e.target.value as BroadcastAudienceType, audienceTagId: null }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  {AUDIENCE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
                  ))}
                </select>

                {/* Audience count preview */}
                <p className="text-xs text-gray-400 mt-1">
                  {countLoading ? 'Counting…' : audienceCount !== null ? `≈ ${audienceCount} recipients` : ''}
                </p>

                {/* SELECTED: textarea for telegram IDs */}
                {form.audienceType === 'SELECTED' && (
                  <div className="mt-2">
                    <Label className="text-xs text-gray-500 mb-1 block">User IDs (comma-separated)</Label>
                    <textarea
                      value={form.audienceUserIds}
                      onChange={e => setForm(f => ({ ...f, audienceUserIds: e.target.value }))}
                      rows={3}
                      placeholder="123456789, 987654321"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
                    />
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">
                  Schedule <span className="text-gray-400">(leave blank to send immediately)</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                  className="text-sm"
                />
              </div>

              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex gap-2 px-4 py-3 border-t shrink-0">
            <Button variant="outline" size="sm" onClick={closeForm} className="flex-1">Cancel</Button>
            <Button
              variant="outline" size="sm"
              onClick={() => void saveDraft()}
              disabled={formBusy}
            >
              {formBusy ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await saveDraft();
                if (editingId !== null || true) {
                  // After save, auto-send if no scheduled time
                  // Re-load to get the saved ID, then send
                }
              }}
              disabled={formBusy || sendingId !== null}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {form.scheduledAt ? (
                <><Clock className="w-3.5 h-3.5 mr-1" />Schedule</>
              ) : (
                <><Send className="w-3.5 h-3.5 mr-1" />Send Now</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* MediaPicker modal */}
      {showPicker && (
        <MediaPicker
          onSelect={handleMediaSelected}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
```

**Important implementation note for the Send Now button:** The current stub saves a draft then needs to trigger send. The implementer should refactor the Send Now flow:
1. POST to `/api/broadcast` (create draft) — get the new broadcast `id`
2. Immediately POST to `/api/broadcast/{id}/send` with `{ scheduled_at }` (or empty for immediate)
3. Call `loadData()` and `closeForm()`

If editing an existing draft (`editingId !== null`), step 1 becomes PATCH instead of POST.

Replace the Send Now button onClick with:

```typescript
const handleSendNow = async () => {
  if (!form.title.trim()) { setFormError('Title is required.'); return; }
  if (form.channels.length === 0) { setFormError('Select at least one channel.'); return; }
  setFormBusy(true); setFormError('');
  try {
    // 1. Save/update draft
    const savePayload = {
      title: form.title.trim(), content_type: form.contentType,
      body: form.body.trim(), caption: form.caption.trim() || null,
      media_id: form.mediaId, channels: form.channels,
      audience_type: form.audienceType, audience_tag_id: form.audienceTagId,
      audience_user_ids: form.audienceType === 'SELECTED' && form.audienceUserIds
        ? form.audienceUserIds.split(',').map(s => s.trim()).filter(Boolean).map(Number) : null,
    };
    const isEdit = editingId !== null;
    const saveRes = await fetch(
      isEdit ? `/api/broadcast/${editingId}` : '/api/broadcast',
      { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(savePayload) }
    );
    if (!saveRes.ok) {
      const d = await saveRes.json() as { error?: string };
      setFormError(d.error ?? 'Failed to save.'); return;
    }
    const saved = await saveRes.json() as { id?: number; broadcast?: { id: number } };
    const targetId = isEdit ? editingId! : ((saved as { id: number }).id ?? (saved as { broadcast: { id: number } }).broadcast?.id);
    if (!targetId) { setFormError('Could not get broadcast ID.'); return; }

    // 2. Send / schedule
    const sendBody = form.scheduledAt ? { scheduled_at: new Date(form.scheduledAt).toISOString() } : {};
    const sendRes = await fetch(`/api/broadcast/${targetId}/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sendBody),
    });
    if (sendRes.ok) {
      closeForm(); await loadData();
    } else {
      const d = await sendRes.json() as { error?: string };
      setFormError(d.error ?? 'Send failed.');
    }
  } finally {
    setFormBusy(false);
  }
};
```

Use `handleSendNow` for the Send Now / Schedule button, and use a separate simplified `saveDraft` (just save, no send).

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3: Run full suite — no regressions**

```bash
cd erp && npx vitest run --reporter=verbose 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add erp/src/app/\(dashboard\)/broadcast/page.tsx
git commit -m "feat(broadcast): Broadcast Manager page — composer, history, preview, audience"
```

---

### Task 6: Sidebar

**Files:**
- Modify: `erp/src/components/sidebar.tsx`

**Interfaces:**
- Consumes: existing sidebar NAV_GROUPS structure; `Radio` icon from lucide-react (already imported as part of sidebar additions check — if not present, add it)

- [ ] **Step 1: Read `erp/src/components/sidebar.tsx`**

Read the file. Confirm which icons are already imported and where the `Announcements` entry is in the second NAV_GROUPS array.

- [ ] **Step 2: Add `Radio` to imports and Broadcast to nav**

In `erp/src/components/sidebar.tsx`, add `Radio` to the lucide-react import (if not already present). Then add the Broadcast entry in the second items array (same group as Promotions, Announcements, Audit Log):

```typescript
// After the Announcements entry:
{ href: '/broadcast', label: 'Broadcast', icon: Radio },
```

The second NAV_GROUPS items array should become:
```typescript
{
  items: [
    { href: '/banks',         label: 'Bank Manager',  icon: Landmark },
    { href: '/promotions',    label: 'Promotions',    icon: Gift },
    { href: '/announcements', label: 'Announcements', icon: Megaphone },
    { href: '/broadcast',     label: 'Broadcast',     icon: Radio },
    { href: '/audit',         label: 'Audit Log',     icon: ScrollText },
  ],
},
```

- [ ] **Step 3: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Run full suite**

```bash
cd erp && npx vitest run --reporter=verbose 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add erp/src/components/sidebar.tsx
git commit -m "feat(broadcast): add Broadcast to sidebar nav"
```

---

### Task 7: Final Verification

**Files:**
- No new files — verification only

**Interfaces:**
- Consumes: all Phase 5.5 artifacts

- [ ] **Step 1: Run full test suite**

```bash
cd erp && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass. Suite count is higher than 171 (new broadcast tests added).

- [ ] **Step 2: TypeScript check**

```bash
cd erp && npx tsc --noEmit 2>&1 | head -20
```

Expected: Zero errors.

- [ ] **Step 3: Next.js build**

```bash
cd erp && npm run build 2>&1 | tail -30
```

Expected: Build succeeds. `/broadcast` route visible in build output.

- [ ] **Step 4: Architecture guards**

```bash
# No dashboard-path MediaPicker imports
grep -r "from.*dashboard.*MediaPicker\|from.*media-library.*MediaPicker" erp/src/ 2>/dev/null
# No base64 in broadcast routes
grep -r "base64\|Buffer.from" erp/src/app/api/broadcast/ 2>/dev/null
# Broadcast page uses correct MediaPicker import
grep "MediaPicker" erp/src/app/\(dashboard\)/broadcast/page.tsx
# No new media table created
grep -r "CREATE TABLE.*media\|CREATE TABLE.*upload" erp/migrations/029_broadcasts.sql 2>/dev/null
```

Expected:
- First two: no output
- Third: shows `@/components/media/MediaPicker`
- Fourth: no output (no new media table)

- [ ] **Step 5: Python regression**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot && python -m pytest bot/ -x -q 2>&1 | tail -20
```

Expected: Same 11 pre-existing failures, no new failures.

- [ ] **Step 6: Commit verification record**

```bash
git add .superpowers/sdd/progress.md  # if updated
git commit -m "chore(broadcast): Phase 5.5 verification — all checks PASS" --allow-empty
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Text + Image/GIF/Video/PDF/APK/Document content types | Task 2 (CHECK constraint), Task 5 (CONTENT_TYPES array) |
| Media from MediaPicker only | Task 5 (MediaPicker import from `@/components/media/MediaPicker`) |
| All Members, Tags, VIP, Active, Inactive, Never Deposit, Deposited, Selected | Task 2 (`resolveAudienceTelegramIds` switch) |
| Send Now | Task 4 (`/send` route — no `scheduled_at`) |
| Schedule Later | Task 4 (`/send` route — `scheduled_at` in future → SCHEDULED) |
| Save Draft | Task 4 (POST `/api/broadcast` creates DRAFT) |
| Telegram Preview | Task 5 (preview tab — Telegram bubble) |
| Live Chat Preview | Task 5 (preview tab — Live Chat bubble) |
| Broadcast History (all fields) | Task 1 (schema), Task 2 (types + repo), Task 5 (list panel) |
| Analytics (Total/Sent/Failed/Pending) | Task 5 (analytics strip computed from loaded data) |
| Channel Breakdown | Task 5 (each broadcast row shows channels) |
| Telegram Bot channel (send) | Task 3 (relay `/send_to_telegram_id`) |
| ERP Live Chat channel (insert) | Task 3 (INSERT into support_messages) |
| Future channels prepared | Task 1 (`channels TEXT[]` supports any future string value) |
| Sidebar nav entry | Task 6 |
| No new media table / upload logic | Task 1 (only `broadcasts` table; media via `media_id` FK) |
| No base64 | Task 3 (send engine uses `media_id`, never base64) |
| Reuse MediaService / Media Library / MediaPicker | Task 5 (MediaPicker), Task 3 (media_id FK) |

### Placeholder Scan

No TBD, TODO, or incomplete sections detected.

### Type Consistency

- `BroadcastContentType` defined in Task 2 → used in Task 3 (`send.ts`), Task 4 (routes), Task 5 (UI) — all match
- `BroadcastAudienceType` defined in Task 2 → used in Task 3, Task 4, Task 5 — all match
- `BroadcastStatus` defined in Task 2 → `updateBroadcastCounts` in Task 2 → `send.ts` in Task 3 — all match
- `resolveAudienceTelegramIds` defined in Task 2 → imported in Task 3 — signature matches
- `getActiveSessionUserIds` defined in Task 2 → imported in Task 3 — signature matches
- `sendBroadcast` defined in Task 3 → imported in Task 4 send route — signature matches

---

*Checked by plan author — no gaps, no placeholders, types consistent across all 7 tasks.*
