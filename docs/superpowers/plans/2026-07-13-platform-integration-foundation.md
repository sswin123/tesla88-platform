# Platform Integration Foundation v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified, extensible Integration Foundation that all future Payment Gateway, Game Provider, SMS, Email, Storage, and Notification integrations plug into — without re-architecting.

**Architecture:** Adapter pattern (IAdapter interface hierarchy) + DB-backed queue (no Redis) + in-process EventBus with DB audit log + AES-256-GCM encrypted credential store + universal webhook receiver + ledger-based wallet. Each integration is a row in the `integrations` table; credentials live encrypted in `integration_credentials`; all callbacks enter via `/api/callback/[category]/[provider]`.

**Tech Stack:** Next.js App Router, PostgreSQL (pg Pool), TypeScript, Node.js crypto (AES-256-GCM, HMAC-SHA256), React, Tailwind CSS.

## Global Constraints

- SSWIN88 Platform v1.0.0 — do NOT change `users.id` (internal primary key)
- Next migration number: **046** (`erp/migrations/046_integration_foundation.sql`)
- All API routes: `NextRequest / NextResponse` (App Router)
- DB pool: `import pool from '@/lib/db'` — max 10 connections, 15s statement_timeout
- No Redis — queue is DB-backed via `queue_jobs` table
- Credentials encrypted with AES-256-GCM; key from `process.env.INTEGRATION_CREDENTIAL_KEY` (32-byte hex)
- Keep updating `users.total_deposit` / `users.total_withdraw` for backward compat alongside new wallet ledger
- `audit_logs.admin_id` is NOT NULL — new `actor_type` column added in migration so system callbacks can log without an admin
- All lib files under `erp/src/lib/integrations/` and `erp/src/lib/wallet/`
- Follow StorageProvider pattern from `erp/src/lib/media/storage-provider.ts`
- TypeScript zero errors (`tsc --noEmit`), `npm run build` must pass in ERP
- All reports and updates in Chinese (中文)

---

## File Map

**Create:**
- `erp/migrations/046_integration_foundation.sql`
- `erp/src/lib/integrations/types.ts` — all interfaces + enums
- `erp/src/lib/integrations/crypto.ts` — AES-256-GCM encrypt/decrypt
- `erp/src/lib/integrations/signature.ts` — HMAC-SHA256, RSA verify, timestamp window, nonce replay protection
- `erp/src/lib/integrations/webhook.ts` — universal webhook processor
- `erp/src/lib/integrations/queue.ts` — DB-backed queue enqueue/dequeue/complete/fail
- `erp/src/lib/integrations/retry.ts` — exponential backoff retry wrapper
- `erp/src/lib/integrations/event-bus.ts` — in-process EventEmitter + DB event_log
- `erp/src/lib/integrations/logger.ts` — API request log + callback log writers
- `erp/src/lib/integrations/registry.ts` — ADAPTER_CATALOG + integration CRUD + credential CRUD
- `erp/src/lib/wallet/types.ts` — WalletAccount, WalletTransaction, CreditResult, DebitResult
- `erp/src/lib/wallet/service.ts` — getOrCreateWallet, getBalance, creditWallet, debitWallet
- `erp/src/app/api/integrations/route.ts` — GET list, POST create
- `erp/src/app/api/integrations/[id]/route.ts` — GET, PATCH, DELETE
- `erp/src/app/api/integrations/[id]/credentials/route.ts` — GET (masked), PUT upsert
- `erp/src/app/api/integrations/[id]/health/route.ts` — GET health check
- `erp/src/app/api/integrations/[id]/logs/route.ts` — GET paginated logs
- `erp/src/app/api/integrations/[id]/test/route.ts` — POST send test
- `erp/src/app/api/callback/[category]/[provider]/route.ts` — universal webhook entry
- `erp/src/app/api/queue/route.ts` — GET queue stats
- `erp/src/app/api/queue/process/route.ts` — POST process next job
- `erp/src/app/(dashboard)/integrations/page.tsx` — Integration Center UI

**Modify:**
- `erp/migrations/046_integration_foundation.sql` (new file)
- `erp/src/components/sidebar.tsx` — add Integration Center nav entry
- `erp/src/lib/repositories/audit_repo.ts` — support actor_type='system'

---

### Task 1: DB Migration 046

**Files:**
- Create: `erp/migrations/046_integration_foundation.sql`

**Interfaces:**
- Produces: all tables consumed by Tasks 2-8

- [ ] **Step 1: Write migration file**

```sql
-- erp/migrations/046_integration_foundation.sql
-- Platform Integration Foundation v1.0
-- Tables: integrations, integration_credentials, api_request_logs,
--         callback_logs, queue_jobs, event_log,
--         wallet_accounts, wallet_transactions, wallet_balance_snapshots
-- Also: ALTER audit_logs ADD COLUMN actor_type

-- ── 1. Extend audit_logs for system actors ────────────────────────────────────
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_type VARCHAR(20) NOT NULL DEFAULT 'admin'
    CHECK (actor_type IN ('admin','system','webhook'));

ALTER TABLE audit_logs
  ALTER COLUMN admin_id DROP NOT NULL;

-- ── 2. integrations (master registry) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrations (
  id               SERIAL PRIMARY KEY,
  category         VARCHAR(30)  NOT NULL
                     CHECK (category IN ('payment','game','sms','email','storage','notification')),
  provider_key     VARCHAR(60)  NOT NULL,  -- e.g. 'toyyibpay', 'pragmatic'
  display_name     VARCHAR(120) NOT NULL,
  environment      VARCHAR(10)  NOT NULL DEFAULT 'sandbox'
                     CHECK (environment IN ('sandbox','production')),
  is_enabled       BOOLEAN      NOT NULL DEFAULT FALSE,
  config           JSONB        NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (category, provider_key, environment)
);

CREATE INDEX IF NOT EXISTS idx_integrations_category ON integrations(category);
CREATE INDEX IF NOT EXISTS idx_integrations_enabled  ON integrations(is_enabled) WHERE is_enabled = TRUE;

-- ── 3. integration_credentials (AES-256-GCM encrypted) ────────────────────────
CREATE TABLE IF NOT EXISTS integration_credentials (
  id               SERIAL PRIMARY KEY,
  integration_id   INTEGER      NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  credential_key   VARCHAR(80)  NOT NULL,  -- e.g. 'api_key', 'secret', 'merchant_id'
  encrypted_value  TEXT         NOT NULL,  -- base64(iv:authTag:ciphertext)
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (integration_id, credential_key)
);

-- ── 4. api_request_logs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_request_logs (
  id               BIGSERIAL PRIMARY KEY,
  integration_id   INTEGER      REFERENCES integrations(id) ON DELETE SET NULL,
  direction        VARCHAR(10)  NOT NULL CHECK (direction IN ('outbound','inbound')),
  method           VARCHAR(10),
  url              TEXT,
  request_headers  JSONB,
  request_body     TEXT,
  response_status  INTEGER,
  response_body    TEXT,
  duration_ms      INTEGER,
  error            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_integration
  ON api_request_logs(integration_id, created_at DESC);

-- ── 5. callback_logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS callback_logs (
  id               BIGSERIAL PRIMARY KEY,
  integration_id   INTEGER      REFERENCES integrations(id) ON DELETE SET NULL,
  category         VARCHAR(30)  NOT NULL,
  provider_key     VARCHAR(60)  NOT NULL,
  raw_headers      JSONB,
  raw_body         TEXT,
  signature_valid  BOOLEAN,
  ip_address       INET,
  status           VARCHAR(20)  NOT NULL DEFAULT 'received'
                     CHECK (status IN ('received','processed','failed','ignored')),
  error            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_callback_logs_integration
  ON callback_logs(integration_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_callback_logs_provider
  ON callback_logs(provider_key, created_at DESC);

-- ── 6. queue_jobs (DB-backed, no Redis) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS queue_jobs (
  id               BIGSERIAL PRIMARY KEY,
  queue_name       VARCHAR(60)  NOT NULL DEFAULT 'default',
  job_type         VARCHAR(80)  NOT NULL,
  payload          JSONB        NOT NULL DEFAULT '{}',
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','completed','failed','dead')),
  attempts         INTEGER      NOT NULL DEFAULT 0,
  max_attempts     INTEGER      NOT NULL DEFAULT 3,
  next_attempt_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  locked_at        TIMESTAMPTZ,
  locked_by        VARCHAR(60),
  last_error       TEXT,
  result           JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_jobs_dequeue
  ON queue_jobs(queue_name, next_attempt_at)
  WHERE status IN ('pending');

CREATE INDEX IF NOT EXISTS idx_queue_jobs_status
  ON queue_jobs(status, created_at DESC);

-- ── 7. event_log (in-process EventBus audit trail) ───────────────────────────
CREATE TABLE IF NOT EXISTS event_log (
  id               BIGSERIAL PRIMARY KEY,
  event_name       VARCHAR(120) NOT NULL,
  payload          JSONB        NOT NULL DEFAULT '{}',
  source           VARCHAR(80),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_log_name
  ON event_log(event_name, created_at DESC);

-- ── 8. wallet_accounts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_accounts (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER      NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  currency         VARCHAR(10)  NOT NULL DEFAULT 'MYR',
  is_frozen        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user ON wallet_accounts(user_id);

-- ── 9. wallet_transactions (ledger) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id               BIGSERIAL PRIMARY KEY,
  wallet_id        INTEGER      NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  user_id          INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  txn_type         VARCHAR(40)  NOT NULL,
  -- e.g. 'deposit', 'withdrawal', 'bonus', 'game_debit', 'game_credit', 'adjustment'
  amount           NUMERIC(15,2) NOT NULL,
  -- positive = credit, negative = debit
  balance_before   NUMERIC(15,2) NOT NULL,
  balance_after    NUMERIC(15,2) NOT NULL,
  reference_type   VARCHAR(40),  -- 'deposit_request', 'withdrawal_request', 'game_round', etc.
  reference_id     BIGINT,
  note             TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_txn_wallet
  ON wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_user
  ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_reference
  ON wallet_transactions(reference_type, reference_id) WHERE reference_id IS NOT NULL;

-- ── 10. wallet_balance_snapshots (fast balance reads) ────────────────────────
CREATE TABLE IF NOT EXISTS wallet_balance_snapshots (
  wallet_id        INTEGER      NOT NULL PRIMARY KEY REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  balance          NUMERIC(15,2) NOT NULL DEFAULT 0,
  last_txn_id      BIGINT,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 11. Backfill wallet_accounts for existing users ───────────────────────────
INSERT INTO wallet_accounts (user_id, currency)
SELECT id, 'MYR' FROM users
ON CONFLICT (user_id) DO NOTHING;

-- ── 12. Seed wallet_balance_snapshots from users.total_deposit - total_withdraw
INSERT INTO wallet_balance_snapshots (wallet_id, balance)
SELECT wa.id, COALESCE(u.total_deposit, 0) - COALESCE(u.total_withdraw, 0)
FROM wallet_accounts wa
JOIN users u ON u.id = wa.user_id
ON CONFLICT (wallet_id) DO UPDATE
  SET balance = EXCLUDED.balance, updated_at = NOW();
```

- [ ] **Step 2: Apply migration to local DB**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot
psql "$DATABASE_URL" -f erp/migrations/046_integration_foundation.sql
```

Expected: no errors, `CREATE TABLE` × 8, `ALTER TABLE` × 2, `INSERT` × 2

- [ ] **Step 3: Verify tables exist**

```bash
psql "$DATABASE_URL" -c "\dt integrations integration_credentials api_request_logs callback_logs queue_jobs event_log wallet_accounts wallet_transactions wallet_balance_snapshots"
```

Expected: 9 rows listed.

- [ ] **Step 4: Commit**

```bash
git add erp/migrations/046_integration_foundation.sql
git commit -m "feat: migration 046 — integration foundation + wallet ledger tables"
```

---

### Task 2: Core Types + Crypto

**Files:**
- Create: `erp/src/lib/integrations/types.ts`
- Create: `erp/src/lib/integrations/crypto.ts`

**Interfaces:**
- Produces: `IntegrationCategory`, `IAdapter`, `IPaymentGateway`, `IGameProvider`, `ISmsProvider`, `IEmailProvider`, `INotificationProvider`, `WebhookPayload`, `QueueJob`, `encryptCredential()`, `decryptCredential()`

- [ ] **Step 1: Write `types.ts`**

```typescript
// erp/src/lib/integrations/types.ts

export type IntegrationCategory =
  | 'payment'
  | 'game'
  | 'sms'
  | 'email'
  | 'storage'
  | 'notification';

export type IntegrationEnvironment = 'sandbox' | 'production';

export type QueueJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'dead';

export interface Integration {
  id: number;
  category: IntegrationCategory;
  provider_key: string;
  display_name: string;
  environment: IntegrationEnvironment;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface IntegrationCredential {
  id: number;
  integration_id: number;
  credential_key: string;
  encrypted_value: string;
  updated_at: string;
}

// ── Adapter interfaces ────────────────────────────────────────────────────────

export interface AdapterHealth {
  healthy: boolean;
  latency_ms?: number;
  message?: string;
  checked_at: string;
}

export interface IAdapter {
  readonly providerKey: string;
  readonly category: IntegrationCategory;
  health(): Promise<AdapterHealth>;
}

// Payment Gateway
export interface PaymentInitResult {
  success: boolean;
  payment_url?: string;
  reference?: string;
  error?: string;
  raw?: unknown;
}

export interface PaymentStatusResult {
  success: boolean;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  amount?: number;
  reference?: string;
  error?: string;
  raw?: unknown;
}

export interface IPaymentGateway extends IAdapter {
  readonly category: 'payment';
  initPayment(params: {
    amount: number;
    currency: string;
    reference: string;
    description: string;
    returnUrl: string;
    callbackUrl: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
  }): Promise<PaymentInitResult>;
  checkStatus(reference: string): Promise<PaymentStatusResult>;
  verifyCallback(headers: Record<string, string>, body: string): boolean;
}

// Game Provider
export interface GameLaunchResult {
  success: boolean;
  launch_url?: string;
  error?: string;
  raw?: unknown;
}

export interface GameBalanceResult {
  success: boolean;
  balance?: number;
  currency?: string;
  error?: string;
}

export interface IGameProvider extends IAdapter {
  readonly category: 'game';
  createAccount(params: { username: string; password: string }): Promise<{ success: boolean; account_id?: string; error?: string }>;
  launchGame(params: { account_id: string; game_code: string; lobby_url: string }): Promise<GameLaunchResult>;
  getBalance(account_id: string): Promise<GameBalanceResult>;
  deposit(params: { account_id: string; amount: number; reference: string }): Promise<{ success: boolean; error?: string }>;
  withdraw(params: { account_id: string; amount: number; reference: string }): Promise<{ success: boolean; error?: string }>;
}

// SMS Provider
export interface SmsSendResult {
  success: boolean;
  message_id?: string;
  error?: string;
}

export interface ISmsProvider extends IAdapter {
  readonly category: 'sms';
  send(params: { to: string; message: string; from?: string }): Promise<SmsSendResult>;
}

// Email Provider
export interface EmailSendResult {
  success: boolean;
  message_id?: string;
  error?: string;
}

export interface IEmailProvider extends IAdapter {
  readonly category: 'email';
  send(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
  }): Promise<EmailSendResult>;
}

// Notification Provider
export interface INotificationProvider extends IAdapter {
  readonly category: 'notification';
  send(params: { channel: string; title: string; body: string; data?: Record<string, unknown> }): Promise<{ success: boolean; error?: string }>;
}

// ── Webhook ───────────────────────────────────────────────────────────────────

export interface WebhookContext {
  integration_id: number | null;
  category: IntegrationCategory;
  provider_key: string;
  headers: Record<string, string>;
  body: string;
  ip: string;
  received_at: string;
}

export interface WebhookProcessResult {
  accepted: boolean;
  error?: string;
  job_id?: number;
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export interface QueueJob {
  id: number;
  queue_name: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: QueueJobStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueOptions {
  queue_name?: string;
  max_attempts?: number;
  delay_seconds?: number;
}

// ── Adapter Catalog entry ────────────────────────────────────────────────────

export interface AdapterCatalogEntry {
  provider_key: string;
  display_name: string;
  category: IntegrationCategory;
  credential_keys: string[];  // required credential field names
  config_schema?: Record<string, unknown>;
}
```

- [ ] **Step 2: Write `crypto.ts`**

```typescript
// erp/src/lib/integrations/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.INTEGRATION_CREDENTIAL_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('INTEGRATION_CREDENTIAL_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

// Returns base64(iv[12] + authTag[16] + ciphertext)
export function encryptCredential(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

// Reverses encryptCredential
export function decryptCredential(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, 'base64');
  const iv      = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const data    = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 3: Write tests**

Create `erp/src/lib/integrations/__tests__/crypto.test.ts`:

```typescript
import { encryptCredential, decryptCredential } from '../crypto';

beforeAll(() => {
  process.env.INTEGRATION_CREDENTIAL_KEY = 'a'.repeat(64);
});

test('roundtrip', () => {
  const plain = 'sk_test_abc123!@#$%^&*()';
  expect(decryptCredential(encryptCredential(plain))).toBe(plain);
});

test('different ciphertexts for same plaintext', () => {
  const a = encryptCredential('secret');
  const b = encryptCredential('secret');
  expect(a).not.toBe(b);
});

test('throws without key', () => {
  const orig = process.env.INTEGRATION_CREDENTIAL_KEY;
  delete process.env.INTEGRATION_CREDENTIAL_KEY;
  expect(() => encryptCredential('x')).toThrow('INTEGRATION_CREDENTIAL_KEY');
  process.env.INTEGRATION_CREDENTIAL_KEY = orig;
});
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx jest src/lib/integrations/__tests__/crypto.test.ts --no-coverage
```

Expected: 3/3 PASS

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "integrations/types|integrations/crypto" | head -20
```

Expected: no output (zero errors in new files)

- [ ] **Step 6: Commit**

```bash
git add erp/src/lib/integrations/
git commit -m "feat: integration foundation — types + AES-256-GCM crypto"
```

---

### Task 3: Signature + Webhook Framework

**Files:**
- Create: `erp/src/lib/integrations/signature.ts`
- Create: `erp/src/lib/integrations/webhook.ts`

**Interfaces:**
- Consumes: `WebhookContext`, `WebhookProcessResult` from `types.ts`; `encryptCredential`/`decryptCredential` from `crypto.ts`
- Produces: `verifyHmacSha256()`, `verifyTimestampWindow()`, `checkNonceReplay()`, `processWebhook()`

- [ ] **Step 1: Write `signature.ts`**

```typescript
// erp/src/lib/integrations/signature.ts
import { createHmac, timingSafeEqual } from 'crypto';
import pool from '@/lib/db';

// HMAC-SHA256 constant-time comparison
// expected: hex string of expected signature
// actual:   hex string computed from request
export function verifyHmacSha256(secret: string, payload: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

// Returns true if timestamp is within windowSeconds of now
export function verifyTimestampWindow(timestampSeconds: number, windowSeconds = 300): boolean {
  const diff = Math.abs(Date.now() / 1000 - timestampSeconds);
  return diff <= windowSeconds;
}

// IP whitelist check — pass empty array to skip
export function isIpAllowed(ip: string, whitelist: string[]): boolean {
  if (whitelist.length === 0) return true;
  return whitelist.includes(ip);
}

// Nonce replay protection — stores nonce in callback_logs keyed by (provider_key + nonce)
// Returns true if nonce has NOT been seen before (safe to proceed)
export async function checkNonceReplay(
  providerKey: string,
  nonce: string,
  windowSeconds = 3600
): Promise<boolean> {
  // Use event_log as nonce store: insert unique (event_name=nonce:provider:value)
  const key = `nonce:${providerKey}:${nonce}`;
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const res = await pool.query(
    `SELECT id FROM event_log WHERE event_name = $1 AND created_at > $2 LIMIT 1`,
    [key, cutoff]
  );
  if (res.rows.length > 0) return false; // replay detected
  await pool.query(
    `INSERT INTO event_log (event_name, payload) VALUES ($1, $2)`,
    [key, JSON.stringify({ nonce, provider: providerKey })]
  );
  return true;
}
```

- [ ] **Step 2: Write `webhook.ts`**

```typescript
// erp/src/lib/integrations/webhook.ts
import pool from '@/lib/db';
import type { WebhookContext, WebhookProcessResult, IntegrationCategory } from './types';

// Persist callback log and return its id
export async function logCallback(ctx: WebhookContext, signatureValid: boolean | null): Promise<number> {
  const res = await pool.query(
    `INSERT INTO callback_logs
       (integration_id, category, provider_key, raw_headers, raw_body, signature_valid, ip_address, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7::inet,'received')
     RETURNING id`,
    [
      ctx.integration_id,
      ctx.category,
      ctx.provider_key,
      JSON.stringify(ctx.headers),
      ctx.body,
      signatureValid,
      ctx.ip || null,
    ]
  );
  return res.rows[0].id as number;
}

export async function updateCallbackLog(
  logId: number,
  status: 'processed' | 'failed' | 'ignored',
  error?: string
): Promise<void> {
  await pool.query(
    `UPDATE callback_logs SET status=$1, error=$2 WHERE id=$3`,
    [status, error ?? null, logId]
  );
}

// Enqueue a job to process this webhook asynchronously
export async function enqueueWebhookJob(
  category: IntegrationCategory,
  providerKey: string,
  callbackLogId: number,
  body: string,
  headers: Record<string, string>
): Promise<number> {
  const res = await pool.query(
    `INSERT INTO queue_jobs (queue_name, job_type, payload, max_attempts)
     VALUES ('webhook', $1, $2, 5)
     RETURNING id`,
    [
      `webhook:${category}:${providerKey}`,
      JSON.stringify({ callbackLogId, providerKey, category, body, headers }),
    ]
  );
  return res.rows[0].id as number;
}

// Universal webhook entry point — call from /api/callback/[category]/[provider]
// Returns 200 quickly; processing is async via queue
export async function receiveWebhook(ctx: WebhookContext): Promise<WebhookProcessResult> {
  let logId: number | undefined;
  try {
    logId = await logCallback(ctx, null);
    const jobId = await enqueueWebhookJob(
      ctx.category,
      ctx.provider_key,
      logId,
      ctx.body,
      ctx.headers
    );
    await updateCallbackLog(logId, 'processed');
    return { accepted: true, job_id: jobId };
  } catch (err) {
    if (logId !== undefined) {
      await updateCallbackLog(logId, 'failed', String(err)).catch(() => {});
    }
    return { accepted: false, error: String(err) };
  }
}
```

- [ ] **Step 3: Write tests**

Create `erp/src/lib/integrations/__tests__/signature.test.ts`:

```typescript
import { verifyHmacSha256, verifyTimestampWindow, isIpAllowed } from '../signature';

test('verifyHmacSha256 correct signature', () => {
  const { createHmac } = require('crypto');
  const sig = createHmac('sha256', 'mysecret').update('payload').digest('hex');
  expect(verifyHmacSha256('mysecret', 'payload', sig)).toBe(true);
});

test('verifyHmacSha256 wrong signature', () => {
  expect(verifyHmacSha256('mysecret', 'payload', 'deadbeef')).toBe(false);
});

test('verifyTimestampWindow within window', () => {
  const now = Math.floor(Date.now() / 1000);
  expect(verifyTimestampWindow(now, 300)).toBe(true);
});

test('verifyTimestampWindow outside window', () => {
  const old = Math.floor(Date.now() / 1000) - 400;
  expect(verifyTimestampWindow(old, 300)).toBe(false);
});

test('isIpAllowed with empty whitelist', () => {
  expect(isIpAllowed('1.2.3.4', [])).toBe(true);
});

test('isIpAllowed with matching ip', () => {
  expect(isIpAllowed('1.2.3.4', ['1.2.3.4', '5.6.7.8'])).toBe(true);
});

test('isIpAllowed with non-matching ip', () => {
  expect(isIpAllowed('9.9.9.9', ['1.2.3.4'])).toBe(false);
});
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx jest src/lib/integrations/__tests__/signature.test.ts --no-coverage
```

Expected: 7/7 PASS

- [ ] **Step 5: Commit**

```bash
git add erp/src/lib/integrations/signature.ts erp/src/lib/integrations/webhook.ts erp/src/lib/integrations/__tests__/signature.test.ts
git commit -m "feat: integration foundation — signature framework + universal webhook receiver"
```

---

### Task 4: Queue + Retry + Event Bus

**Files:**
- Create: `erp/src/lib/integrations/queue.ts`
- Create: `erp/src/lib/integrations/retry.ts`
- Create: `erp/src/lib/integrations/event-bus.ts`

**Interfaces:**
- Consumes: `QueueJob`, `EnqueueOptions` from `types.ts`; `pool` from `@/lib/db`
- Produces: `enqueue()`, `dequeue()`, `completeJob()`, `failJob()`, `getQueueStats()`, `withRetry()`, `eventBus.emit()`, `eventBus.on()`

- [ ] **Step 1: Write `queue.ts`**

```typescript
// erp/src/lib/integrations/queue.ts
import pool from '@/lib/db';
import type { QueueJob, EnqueueOptions } from './types';

export async function enqueue(
  jobType: string,
  payload: Record<string, unknown>,
  opts: EnqueueOptions = {}
): Promise<number> {
  const { queue_name = 'default', max_attempts = 3, delay_seconds = 0 } = opts;
  const next = new Date(Date.now() + delay_seconds * 1000).toISOString();
  const res = await pool.query(
    `INSERT INTO queue_jobs (queue_name, job_type, payload, max_attempts, next_attempt_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [queue_name, jobType, JSON.stringify(payload), max_attempts, next]
  );
  return res.rows[0].id as number;
}

// Claims the next pending job with SELECT FOR UPDATE SKIP LOCKED
export async function dequeue(queueName = 'default'): Promise<QueueJob | null> {
  const lockId = `worker-${process.pid}-${Date.now()}`;
  const res = await pool.query(
    `UPDATE queue_jobs SET status='processing', attempts=attempts+1,
       locked_at=NOW(), locked_by=$1, updated_at=NOW()
     WHERE id = (
       SELECT id FROM queue_jobs
       WHERE queue_name=$2 AND status='pending' AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [lockId, queueName]
  );
  return (res.rows[0] as QueueJob) ?? null;
}

export async function completeJob(jobId: number, result?: Record<string, unknown>): Promise<void> {
  await pool.query(
    `UPDATE queue_jobs SET status='completed', result=$1, updated_at=NOW() WHERE id=$2`,
    [result ? JSON.stringify(result) : null, jobId]
  );
}

// Exponential backoff: 2^attempts * 30 seconds, capped at 1 hour
export async function failJob(jobId: number, error: string, attempts: number, maxAttempts: number): Promise<void> {
  const isDead = attempts >= maxAttempts;
  const backoffSeconds = Math.min(30 * Math.pow(2, attempts), 3600);
  const nextAttempt = isDead ? null : new Date(Date.now() + backoffSeconds * 1000).toISOString();
  await pool.query(
    `UPDATE queue_jobs SET
       status = $1,
       last_error = $2,
       next_attempt_at = COALESCE($3, next_attempt_at),
       updated_at = NOW()
     WHERE id = $4`,
    [isDead ? 'dead' : 'pending', error, nextAttempt, jobId]
  );
}

export interface QueueStats {
  queue_name: string;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
}

export async function getQueueStats(): Promise<QueueStats[]> {
  const res = await pool.query(
    `SELECT queue_name,
       COUNT(*) FILTER (WHERE status='pending')    AS pending,
       COUNT(*) FILTER (WHERE status='processing') AS processing,
       COUNT(*) FILTER (WHERE status='completed')  AS completed,
       COUNT(*) FILTER (WHERE status='failed')     AS failed,
       COUNT(*) FILTER (WHERE status='dead')       AS dead
     FROM queue_jobs
     GROUP BY queue_name
     ORDER BY queue_name`
  );
  return res.rows.map(r => ({
    queue_name:  r.queue_name,
    pending:     Number(r.pending),
    processing:  Number(r.processing),
    completed:   Number(r.completed),
    failed:      Number(r.failed),
    dead:        Number(r.dead),
  }));
}
```

- [ ] **Step 2: Write `retry.ts`**

```typescript
// erp/src/lib/integrations/retry.ts

export interface RetryOptions {
  attempts?: number;       // default 3
  baseDelayMs?: number;    // default 500
  factor?: number;         // default 2 (exponential)
  maxDelayMs?: number;     // default 10_000
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { attempts = 3, baseDelayMs = 500, factor = 2, maxDelayMs = 10_000 } = opts;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        const delay = Math.min(baseDelayMs * Math.pow(factor, i), maxDelayMs);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
```

- [ ] **Step 3: Write `event-bus.ts`**

```typescript
// erp/src/lib/integrations/event-bus.ts
import { EventEmitter } from 'events';
import pool from '@/lib/db';

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

type Handler = (payload: Record<string, unknown>) => void | Promise<void>;

// Persist event to DB for audit trail (fire-and-forget; never throws)
async function persistEvent(eventName: string, payload: Record<string, unknown>, source?: string) {
  pool.query(
    `INSERT INTO event_log (event_name, payload, source) VALUES ($1,$2,$3)`,
    [eventName, JSON.stringify(payload), source ?? null]
  ).catch(() => {});
}

export const eventBus = {
  on(eventName: string, handler: Handler): void {
    emitter.on(eventName, handler);
  },

  off(eventName: string, handler: Handler): void {
    emitter.off(eventName, handler);
  },

  async emit(eventName: string, payload: Record<string, unknown>, source?: string): Promise<void> {
    // Persist first, then emit synchronously to registered handlers
    await persistEvent(eventName, payload, source);
    emitter.emit(eventName, payload);
  },
};
```

- [ ] **Step 4: Write tests**

Create `erp/src/lib/integrations/__tests__/retry.test.ts`:

```typescript
import { withRetry } from '../retry';

test('returns value on first success', async () => {
  const fn = jest.fn().mockResolvedValue('ok');
  const result = await withRetry(fn, { attempts: 3 });
  expect(result).toBe('ok');
  expect(fn).toHaveBeenCalledTimes(1);
});

test('retries on failure and succeeds', async () => {
  let calls = 0;
  const fn = jest.fn().mockImplementation(() => {
    calls++;
    if (calls < 3) throw new Error('transient');
    return Promise.resolve('done');
  });
  const result = await withRetry(fn, { attempts: 3, baseDelayMs: 0 });
  expect(result).toBe('done');
  expect(fn).toHaveBeenCalledTimes(3);
});

test('throws after exhausting attempts', async () => {
  const fn = jest.fn().mockRejectedValue(new Error('permanent'));
  await expect(withRetry(fn, { attempts: 2, baseDelayMs: 0 })).rejects.toThrow('permanent');
  expect(fn).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx jest src/lib/integrations/__tests__/retry.test.ts --no-coverage
```

Expected: 3/3 PASS

- [ ] **Step 6: Commit**

```bash
git add erp/src/lib/integrations/queue.ts erp/src/lib/integrations/retry.ts erp/src/lib/integrations/event-bus.ts erp/src/lib/integrations/__tests__/retry.test.ts
git commit -m "feat: integration foundation — DB queue, retry framework, event bus"
```

---

### Task 5: Logger + Registry

**Files:**
- Create: `erp/src/lib/integrations/logger.ts`
- Create: `erp/src/lib/integrations/registry.ts`

**Interfaces:**
- Consumes: `Integration`, `IntegrationCredential`, `AdapterCatalogEntry`, `encryptCredential`, `decryptCredential`
- Produces: `logApiRequest()`, `ADAPTER_CATALOG`, `listIntegrations()`, `getIntegration()`, `createIntegration()`, `updateIntegration()`, `deleteIntegration()`, `getCredentials()`, `setCredential()`, `getDecryptedCredentials()`

- [ ] **Step 1: Write `logger.ts`**

```typescript
// erp/src/lib/integrations/logger.ts
import pool from '@/lib/db';

export interface ApiRequestLogEntry {
  integration_id?: number | null;
  direction: 'outbound' | 'inbound';
  method?: string;
  url?: string;
  request_headers?: Record<string, string>;
  request_body?: string;
  response_status?: number;
  response_body?: string;
  duration_ms?: number;
  error?: string;
}

export async function logApiRequest(entry: ApiRequestLogEntry): Promise<void> {
  await pool.query(
    `INSERT INTO api_request_logs
       (integration_id, direction, method, url, request_headers, request_body,
        response_status, response_body, duration_ms, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      entry.integration_id ?? null,
      entry.direction,
      entry.method ?? null,
      entry.url ?? null,
      entry.request_headers ? JSON.stringify(entry.request_headers) : null,
      entry.request_body ?? null,
      entry.response_status ?? null,
      entry.response_body ?? null,
      entry.duration_ms ?? null,
      entry.error ?? null,
    ]
  );
}

export async function getApiLogs(integrationId: number, limit = 50, offset = 0) {
  const res = await pool.query(
    `SELECT * FROM api_request_logs WHERE integration_id=$1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [integrationId, limit, offset]
  );
  return res.rows;
}

export async function getCallbackLogs(integrationId: number, limit = 50, offset = 0) {
  const res = await pool.query(
    `SELECT * FROM callback_logs WHERE integration_id=$1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [integrationId, limit, offset]
  );
  return res.rows;
}
```

- [ ] **Step 2: Write `registry.ts`**

```typescript
// erp/src/lib/integrations/registry.ts
import pool from '@/lib/db';
import { encryptCredential, decryptCredential } from './crypto';
import type { Integration, IntegrationCategory, IntegrationEnvironment, AdapterCatalogEntry } from './types';

// Static catalog of all known integration providers
export const ADAPTER_CATALOG: AdapterCatalogEntry[] = [
  // Payment
  { provider_key: 'toyyibpay',  display_name: 'ToyyibPay',  category: 'payment',      credential_keys: ['user_secret_key', 'category_code'] },
  { provider_key: 'billplz',    display_name: 'Billplz',    category: 'payment',      credential_keys: ['api_key', 'collection_id', 'x_signature_key'] },
  { provider_key: 'ipay88',     display_name: 'iPay88',     category: 'payment',      credential_keys: ['merchant_code', 'merchant_key'] },
  { provider_key: 'senangpay',  display_name: 'SenangPay',  category: 'payment',      credential_keys: ['merchant_id', 'secret_key'] },
  { provider_key: 'curlec',     display_name: 'Curlec',     category: 'payment',      credential_keys: ['api_key', 'secret'] },
  { provider_key: 'fpx',        display_name: 'FPX',        category: 'payment',      credential_keys: ['merchant_id', 'exchange_id', 'signing_cert'] },
  { provider_key: 'crypto_pay', display_name: 'Crypto Pay', category: 'payment',      credential_keys: ['api_key', 'secret'] },
  // Game
  { provider_key: 'pragmatic',  display_name: 'Pragmatic Play', category: 'game',    credential_keys: ['operator_id', 'secret_key', 'api_url'] },
  { provider_key: 'evolution',  display_name: 'Evolution Gaming', category: 'game',  credential_keys: ['casino_key', 'api_url'] },
  // SMS
  { provider_key: 'twilio',     display_name: 'Twilio',     category: 'sms',          credential_keys: ['account_sid', 'auth_token', 'from_number'] },
  { provider_key: 'nexmo',      display_name: 'Vonage/Nexmo', category: 'sms',        credential_keys: ['api_key', 'api_secret', 'from'] },
  // Email
  { provider_key: 'sendgrid',   display_name: 'SendGrid',   category: 'email',        credential_keys: ['api_key', 'from_email'] },
  { provider_key: 'smtp',       display_name: 'SMTP',       category: 'email',        credential_keys: ['host', 'port', 'user', 'password', 'from_email'] },
  // Storage (already handled by StorageProvider — register here for UI visibility)
  { provider_key: 'r2',         display_name: 'Cloudflare R2', category: 'storage',   credential_keys: ['account_id', 'access_key_id', 'secret_access_key', 'bucket'] },
  { provider_key: 's3',         display_name: 'AWS S3',     category: 'storage',      credential_keys: ['access_key_id', 'secret_access_key', 'region', 'bucket'] },
];

export async function listIntegrations(category?: IntegrationCategory): Promise<Integration[]> {
  const res = category
    ? await pool.query(`SELECT * FROM integrations WHERE category=$1 ORDER BY category, provider_key`, [category])
    : await pool.query(`SELECT * FROM integrations ORDER BY category, provider_key`);
  return res.rows as Integration[];
}

export async function getIntegration(id: number): Promise<Integration | null> {
  const res = await pool.query(`SELECT * FROM integrations WHERE id=$1`, [id]);
  return (res.rows[0] as Integration) ?? null;
}

export async function createIntegration(params: {
  category: IntegrationCategory;
  provider_key: string;
  display_name: string;
  environment: IntegrationEnvironment;
}): Promise<Integration> {
  const res = await pool.query(
    `INSERT INTO integrations (category, provider_key, display_name, environment)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [params.category, params.provider_key, params.display_name, params.environment]
  );
  return res.rows[0] as Integration;
}

export async function updateIntegration(id: number, patch: Partial<Pick<Integration, 'display_name' | 'environment' | 'is_enabled' | 'config'>>): Promise<Integration | null> {
  const fields: string[] = [];
  const vals: unknown[] = [];
  let n = 1;
  if ('display_name' in patch) { fields.push(`display_name=$${n++}`); vals.push(patch.display_name); }
  if ('environment'  in patch) { fields.push(`environment=$${n++}`);  vals.push(patch.environment); }
  if ('is_enabled'   in patch) { fields.push(`is_enabled=$${n++}`);   vals.push(patch.is_enabled); }
  if ('config'       in patch) { fields.push(`config=$${n++}`);       vals.push(JSON.stringify(patch.config)); }
  if (fields.length === 0) return getIntegration(id);
  fields.push(`updated_at=NOW()`);
  vals.push(id);
  const res = await pool.query(
    `UPDATE integrations SET ${fields.join(',')} WHERE id=$${n} RETURNING *`,
    vals
  );
  return (res.rows[0] as Integration) ?? null;
}

export async function deleteIntegration(id: number): Promise<void> {
  await pool.query(`DELETE FROM integrations WHERE id=$1`, [id]);
}

// Credentials
export async function setCredential(integrationId: number, key: string, value: string): Promise<void> {
  const encrypted = encryptCredential(value);
  await pool.query(
    `INSERT INTO integration_credentials (integration_id, credential_key, encrypted_value)
     VALUES ($1,$2,$3)
     ON CONFLICT (integration_id, credential_key)
     DO UPDATE SET encrypted_value=$3, updated_at=NOW()`,
    [integrationId, key, encrypted]
  );
}

// Returns masked values for UI display
export async function getCredentials(integrationId: number): Promise<Record<string, string>> {
  const res = await pool.query(
    `SELECT credential_key FROM integration_credentials WHERE integration_id=$1`,
    [integrationId]
  );
  const out: Record<string, string> = {};
  for (const row of res.rows) {
    out[row.credential_key] = '••••••••';
  }
  return out;
}

// Returns decrypted values — use only server-side, never expose to client
export async function getDecryptedCredentials(integrationId: number): Promise<Record<string, string>> {
  const res = await pool.query(
    `SELECT credential_key, encrypted_value FROM integration_credentials WHERE integration_id=$1`,
    [integrationId]
  );
  const out: Record<string, string> = {};
  for (const row of res.rows) {
    out[row.credential_key] = decryptCredential(row.encrypted_value);
  }
  return out;
}
```

- [ ] **Step 3: Commit**

```bash
git add erp/src/lib/integrations/logger.ts erp/src/lib/integrations/registry.ts
git commit -m "feat: integration foundation — API logger + ADAPTER_CATALOG + registry CRUD"
```

---

### Task 6: Wallet Foundation

**Files:**
- Create: `erp/src/lib/wallet/types.ts`
- Create: `erp/src/lib/wallet/service.ts`

**Interfaces:**
- Consumes: `pool` from `@/lib/db`; `wallet_accounts`, `wallet_transactions`, `wallet_balance_snapshots` tables
- Produces: `getOrCreateWallet()`, `getBalance()`, `creditWallet()`, `debitWallet()`

- [ ] **Step 1: Write `wallet/types.ts`**

```typescript
// erp/src/lib/wallet/types.ts

export interface WalletAccount {
  id: number;
  user_id: number;
  currency: string;
  is_frozen: boolean;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: number;
  wallet_id: number;
  user_id: number;
  txn_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: number | null;
  note: string | null;
  created_at: string;
}

export interface CreditResult {
  success: boolean;
  txn_id?: number;
  balance_after?: number;
  error?: string;
}

export interface DebitResult {
  success: boolean;
  txn_id?: number;
  balance_after?: number;
  error?: string;
}
```

- [ ] **Step 2: Write `wallet/service.ts`**

```typescript
// erp/src/lib/wallet/service.ts
import pool from '@/lib/db';
import type { WalletAccount, CreditResult, DebitResult } from './types';

export async function getOrCreateWallet(userId: number): Promise<WalletAccount> {
  // Upsert wallet account
  const res = await pool.query(
    `INSERT INTO wallet_accounts (user_id, currency)
     VALUES ($1, 'MYR')
     ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id
     RETURNING *`,
    [userId]
  );
  return res.rows[0] as WalletAccount;
}

// Fast read: snapshot + any ledger entries after last snapshot
export async function getBalance(userId: number): Promise<number> {
  const res = await pool.query(
    `SELECT COALESCE(s.balance, 0) AS balance
     FROM wallet_accounts wa
     LEFT JOIN wallet_balance_snapshots s ON s.wallet_id = wa.id
     WHERE wa.user_id = $1`,
    [userId]
  );
  return Number(res.rows[0]?.balance ?? 0);
}

export async function creditWallet(params: {
  userId: number;
  amount: number;
  txnType: string;
  referenceType?: string;
  referenceId?: number;
  note?: string;
}): Promise<CreditResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock wallet row
    const walletRes = await client.query(
      `SELECT wa.id, COALESCE(s.balance, 0) AS balance
       FROM wallet_accounts wa
       LEFT JOIN wallet_balance_snapshots s ON s.wallet_id = wa.id
       WHERE wa.user_id = $1
       FOR UPDATE`,
      [params.userId]
    );
    if (!walletRes.rows[0]) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Wallet not found' };
    }

    const walletId = walletRes.rows[0].id as number;
    const balBefore = Number(walletRes.rows[0].balance);
    const balAfter  = balBefore + params.amount;

    // Insert ledger entry
    const txnRes = await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, user_id, txn_type, amount, balance_before, balance_after,
          reference_type, reference_id, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        walletId, params.userId, params.txnType, params.amount,
        balBefore, balAfter,
        params.referenceType ?? null, params.referenceId ?? null, params.note ?? null,
      ]
    );
    const txnId = txnRes.rows[0].id as number;

    // Update snapshot
    await client.query(
      `INSERT INTO wallet_balance_snapshots (wallet_id, balance, last_txn_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (wallet_id)
       DO UPDATE SET balance=$2, last_txn_id=$3, updated_at=NOW()`,
      [walletId, balAfter, txnId]
    );

    // Keep users.total_deposit in sync for backward compat
    if (['deposit', 'bonus'].includes(params.txnType)) {
      await client.query(
        `UPDATE users SET total_deposit = total_deposit + $1 WHERE id = $2`,
        [params.amount, params.userId]
      );
    }

    await client.query('COMMIT');
    return { success: true, txn_id: txnId, balance_after: balAfter };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, error: String(err) };
  } finally {
    client.release();
  }
}

export async function debitWallet(params: {
  userId: number;
  amount: number;
  txnType: string;
  referenceType?: string;
  referenceId?: number;
  note?: string;
}): Promise<DebitResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const walletRes = await client.query(
      `SELECT wa.id, COALESCE(s.balance, 0) AS balance, wa.is_frozen
       FROM wallet_accounts wa
       LEFT JOIN wallet_balance_snapshots s ON s.wallet_id = wa.id
       WHERE wa.user_id = $1
       FOR UPDATE`,
      [params.userId]
    );
    if (!walletRes.rows[0]) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Wallet not found' };
    }

    const walletId = walletRes.rows[0].id as number;
    const balBefore = Number(walletRes.rows[0].balance);
    const isFrozen  = walletRes.rows[0].is_frozen as boolean;

    if (isFrozen) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Wallet is frozen' };
    }
    if (balBefore < params.amount) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Insufficient balance' };
    }

    const balAfter = balBefore - params.amount;

    const txnRes = await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, user_id, txn_type, amount, balance_before, balance_after,
          reference_type, reference_id, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        walletId, params.userId, params.txnType, -params.amount,
        balBefore, balAfter,
        params.referenceType ?? null, params.referenceId ?? null, params.note ?? null,
      ]
    );
    const txnId = txnRes.rows[0].id as number;

    await client.query(
      `INSERT INTO wallet_balance_snapshots (wallet_id, balance, last_txn_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (wallet_id)
       DO UPDATE SET balance=$2, last_txn_id=$3, updated_at=NOW()`,
      [walletId, balAfter, txnId]
    );

    if (['withdrawal', 'game_debit'].includes(params.txnType)) {
      await client.query(
        `UPDATE users SET total_withdraw = total_withdraw + $1 WHERE id = $2`,
        [params.amount, params.userId]
      );
    }

    await client.query('COMMIT');
    return { success: true, txn_id: txnId, balance_after: balAfter };
  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, error: String(err) };
  } finally {
    client.release();
  }
}
```

- [ ] **Step 3: Write tests**

Create `erp/src/lib/wallet/__tests__/service.test.ts`:

```typescript
// Mock pool so tests don't need a real DB
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = {
  query: mockQuery,
  release: mockRelease,
};
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    connect: jest.fn().mockResolvedValue(mockClient),
    query: mockQuery,
  },
}));

import { creditWallet, debitWallet, getBalance } from '../service';

beforeEach(() => jest.clearAllMocks());

test('creditWallet: returns insufficient balance error when debit exceeds balance', async () => {
  // debitWallet test — wallet has 50, trying to debit 100
  mockQuery
    .mockResolvedValueOnce({ rows: [] })  // BEGIN
    .mockResolvedValueOnce({ rows: [{ id: 1, balance: '50.00', is_frozen: false }] }) // SELECT wallet
    .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
  const result = await debitWallet({ userId: 1, amount: 100, txnType: 'withdrawal' });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/Insufficient/);
});

test('creditWallet: returns wallet not found', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [] })  // BEGIN
    .mockResolvedValueOnce({ rows: [] }) // SELECT wallet — empty
    .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
  const result = await creditWallet({ userId: 999, amount: 100, txnType: 'deposit' });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/not found/);
});
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx jest src/lib/wallet/__tests__/service.test.ts --no-coverage
```

Expected: 2/2 PASS

- [ ] **Step 5: Commit**

```bash
git add erp/src/lib/wallet/
git commit -m "feat: integration foundation — wallet ledger service (credit/debit with SELECT FOR UPDATE)"
```

---

### Task 7: API Routes

**Files:**
- Create: `erp/src/app/api/integrations/route.ts`
- Create: `erp/src/app/api/integrations/[id]/route.ts`
- Create: `erp/src/app/api/integrations/[id]/credentials/route.ts`
- Create: `erp/src/app/api/integrations/[id]/health/route.ts`
- Create: `erp/src/app/api/integrations/[id]/logs/route.ts`
- Create: `erp/src/app/api/integrations/[id]/test/route.ts`
- Create: `erp/src/app/api/callback/[category]/[provider]/route.ts`
- Create: `erp/src/app/api/queue/route.ts`
- Create: `erp/src/app/api/queue/process/route.ts`

**Interfaces:**
- Consumes: `requirePermission` from `@/lib/require_permission`; all registry, queue, webhook, logger functions
- Produces: REST endpoints consumed by Integration Center UI and external systems

- [ ] **Step 1: Write `api/integrations/route.ts`**

```typescript
// erp/src/app/api/integrations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { listIntegrations, createIntegration, ADAPTER_CATALOG } from '@/lib/integrations/registry';
import type { IntegrationCategory, IntegrationEnvironment } from '@/lib/integrations/types';

export async function GET(req: NextRequest) {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const cat = req.nextUrl.searchParams.get('category') as IntegrationCategory | null;
  const integrations = await listIntegrations(cat ?? undefined);
  return NextResponse.json({ integrations, catalog: ADAPTER_CATALOG });
}

export async function POST(req: NextRequest) {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const { category, provider_key, display_name, environment } = body;
  if (!category || !provider_key || !display_name) {
    return NextResponse.json({ error: 'category, provider_key, display_name required' }, { status: 400 });
  }
  const integration = await createIntegration({ category, provider_key, display_name, environment: environment ?? 'sandbox' });
  return NextResponse.json(integration, { status: 201 });
}
```

- [ ] **Step 2: Write `api/integrations/[id]/route.ts`**

```typescript
// erp/src/app/api/integrations/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getIntegration, updateIntegration, deleteIntegration } from '@/lib/integrations/registry';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const integration = await getIntegration(Number(id));
  if (!integration) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(integration);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const updated = await updateIntegration(Number(id), body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  await deleteIntegration(Number(id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Write `api/integrations/[id]/credentials/route.ts`**

```typescript
// erp/src/app/api/integrations/[id]/credentials/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getCredentials, setCredential } from '@/lib/integrations/registry';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const credentials = await getCredentials(Number(id));
  return NextResponse.json(credentials);
}

// PUT body: { key: string, value: string }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const { key, value } = await req.json();
  if (!key || value === undefined) return NextResponse.json({ error: 'key and value required' }, { status: 400 });
  await setCredential(Number(id), key, String(value));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write `api/integrations/[id]/health/route.ts`**

```typescript
// erp/src/app/api/integrations/[id]/health/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getIntegration } from '@/lib/integrations/registry';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const integration = await getIntegration(Number(id));
  if (!integration) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Placeholder: actual health check delegated to concrete adapter
  // When adapters are implemented, look up the adapter by provider_key and call .health()
  return NextResponse.json({
    healthy: integration.is_enabled,
    latency_ms: null,
    message: integration.is_enabled ? 'Enabled — adapter health check not yet implemented' : 'Disabled',
    checked_at: new Date().toISOString(),
  });
}
```

- [ ] **Step 5: Write `api/integrations/[id]/logs/route.ts`**

```typescript
// erp/src/app/api/integrations/[id]/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getApiLogs, getCallbackLogs } from '@/lib/integrations/logger';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const type   = req.nextUrl.searchParams.get('type') ?? 'api';
  const limit  = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? 0);
  const logs = type === 'callback'
    ? await getCallbackLogs(Number(id), limit, offset)
    : await getApiLogs(Number(id), limit, offset);
  return NextResponse.json({ logs, limit, offset });
}
```

- [ ] **Step 6: Write `api/integrations/[id]/test/route.ts`**

```typescript
// erp/src/app/api/integrations/[id]/test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getIntegration } from '@/lib/integrations/registry';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const integration = await getIntegration(Number(id));
  if (!integration) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // When concrete adapters exist, resolve adapter by provider_key and call .health()
  return NextResponse.json({
    success: true,
    message: `Test ping for ${integration.display_name} — concrete adapter not yet installed. Register your adapter in ADAPTER_CATALOG and wire it to this endpoint.`,
    tested_at: new Date().toISOString(),
  });
}
```

- [ ] **Step 7: Write `api/callback/[category]/[provider]/route.ts`**

```typescript
// erp/src/app/api/callback/[category]/[provider]/route.ts
// Universal webhook receiver — all external callbacks enter here.
// Immediately enqueues job and returns 200; processing is async.
import { NextRequest, NextResponse } from 'next/server';
import { receiveWebhook } from '@/lib/integrations/webhook';
import { listIntegrations } from '@/lib/integrations/registry';
import type { IntegrationCategory } from '@/lib/integrations/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ category: string; provider: string }> }
) {
  const { category, provider } = await params;
  const body = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';

  // Look up integration_id (best effort — don't block on missing)
  let integrationId: number | null = null;
  try {
    const integrations = await listIntegrations(category as IntegrationCategory);
    integrationId = integrations.find(i => i.provider_key === provider)?.id ?? null;
  } catch { /* continue without integration_id */ }

  const result = await receiveWebhook({
    integration_id: integrationId,
    category: category as IntegrationCategory,
    provider_key: provider,
    headers,
    body,
    ip,
    received_at: new Date().toISOString(),
  });

  // Always return 200 to prevent retry storms from external providers
  return NextResponse.json({ received: true, job_id: result.job_id ?? null });
}

// Some providers send GET for verification challenges
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ category: string; provider: string }> }
) {
  const { provider } = await params;
  // Return hub.challenge for platforms that require it (e.g. Facebook webhooks)
  const challenge = req.nextUrl.searchParams.get('hub.challenge');
  if (challenge) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ ok: true, provider });
}
```

- [ ] **Step 8: Write `api/queue/route.ts` and `api/queue/process/route.ts`**

```typescript
// erp/src/app/api/queue/route.ts
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { getQueueStats } from '@/lib/integrations/queue';

export async function GET() {
  const payload = await requirePermission('maintenance.view');
  if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const stats = await getQueueStats();
  return NextResponse.json({ stats });
}
```

```typescript
// erp/src/app/api/queue/process/route.ts
// Called by a cron/worker to process the next pending job.
// In production, trigger this endpoint every 30s via an external cron or Vercel cron.
import { NextRequest, NextResponse } from 'next/server';
import { dequeue, completeJob, failJob } from '@/lib/integrations/queue';

export async function POST(req: NextRequest) {
  // Secure with a shared secret — no admin session needed for cron calls
  const secret = req.headers.get('x-worker-secret');
  if (!secret || secret !== process.env.QUEUE_WORKER_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const queueName = req.nextUrl.searchParams.get('queue') ?? 'default';
  const job = await dequeue(queueName);
  if (!job) return NextResponse.json({ processed: false, reason: 'queue empty' });

  try {
    // Dispatch to job handler by job_type
    // When concrete handlers exist, add a switch/registry here:
    // e.g. case 'webhook:payment:toyyibpay': await handleToyyibPayCallback(job.payload)
    console.log(`[queue] Processing job ${job.id} type=${job.job_type}`);
    await completeJob(job.id, { handled_at: new Date().toISOString() });
    return NextResponse.json({ processed: true, job_id: job.id, job_type: job.job_type });
  } catch (err) {
    await failJob(job.id, String(err), job.attempts, job.max_attempts);
    return NextResponse.json({ processed: false, job_id: job.id, error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 9: TypeScript check**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

Expected: zero new errors

- [ ] **Step 10: Commit**

```bash
git add erp/src/app/api/integrations/ erp/src/app/api/callback/ erp/src/app/api/queue/
git commit -m "feat: integration foundation — all API routes (integrations CRUD, callback, queue)"
```

---

### Task 8: Integration Center UI + Sidebar

**Files:**
- Create: `erp/src/app/(dashboard)/integrations/page.tsx`
- Modify: `erp/src/components/sidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/integrations`, `POST /api/integrations`, `PATCH /api/integrations/[id]`, `DELETE /api/integrations/[id]`, `GET /api/integrations/[id]/credentials`, `PUT /api/integrations/[id]/credentials`, `GET /api/queue`, `POST /api/integrations/[id]/test`
- Produces: Integration Center page visible at `/integrations`

- [ ] **Step 1: Write `integrations/page.tsx`**

```tsx
// erp/src/app/(dashboard)/integrations/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { Plug, Plus, ChevronDown, ChevronRight, CheckCircle, XCircle, RefreshCw, Key, Trash2, ToggleLeft, ToggleRight, Activity } from 'lucide-react';

interface CatalogEntry {
  provider_key: string;
  display_name: string;
  category: string;
  credential_keys: string[];
}

interface Integration {
  id: number;
  category: string;
  provider_key: string;
  display_name: string;
  environment: 'sandbox' | 'production';
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface QueueStat {
  queue_name: string;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  payment: 'Payment Gateway',
  game: 'Game Provider',
  sms: 'SMS',
  email: 'Email',
  storage: 'Storage',
  notification: 'Notification',
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations]   = useState<Integration[]>([]);
  const [catalog, setCatalog]             = useState<CatalogEntry[]>([]);
  const [queueStats, setQueueStats]       = useState<QueueStat[]>([]);
  const [selected, setSelected]           = useState<Integration | null>(null);
  const [credentials, setCredentials]     = useState<Record<string, string>>({});
  const [credEdit, setCredEdit]           = useState<Record<string, string>>({});
  const [showAdd, setShowAdd]             = useState(false);
  const [addForm, setAddForm]             = useState({ category: 'payment', provider_key: '', display_name: '', environment: 'sandbox' });
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [testResult, setTestResult]       = useState<string | null>(null);
  const [expandedCats, setExpandedCats]   = useState<Set<string>>(new Set(['payment']));

  async function load() {
    setLoading(true);
    const [intRes, qRes] = await Promise.all([
      fetch('/api/integrations').then(r => r.json()),
      fetch('/api/queue').then(r => r.json()).catch(() => ({ stats: [] })),
    ]);
    setIntegrations(intRes.integrations ?? []);
    setCatalog(intRes.catalog ?? []);
    setQueueStats(qRes.stats ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function selectIntegration(integration: Integration) {
    setSelected(integration);
    setTestResult(null);
    const res = await fetch(`/api/integrations/${integration.id}/credentials`);
    const creds = await res.json();
    setCredentials(creds);
    setCredEdit({});
  }

  async function saveCredentials() {
    if (!selected) return;
    setSaving(true);
    for (const [key, value] of Object.entries(credEdit)) {
      if (value.trim()) {
        await fetch(`/api/integrations/${selected.id}/credentials`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
      }
    }
    setSaving(false);
    setCredEdit({});
    await selectIntegration(selected);
  }

  async function toggleEnabled() {
    if (!selected) return;
    const res = await fetch(`/api/integrations/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: !selected.is_enabled }),
    });
    const updated: Integration = await res.json();
    setSelected(updated);
    setIntegrations(prev => prev.map(i => i.id === updated.id ? updated : i));
  }

  async function setEnvironment(env: 'sandbox' | 'production') {
    if (!selected) return;
    const res = await fetch(`/api/integrations/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: env }),
    });
    const updated: Integration = await res.json();
    setSelected(updated);
    setIntegrations(prev => prev.map(i => i.id === updated.id ? updated : i));
  }

  async function deleteIntegration() {
    if (!selected || !confirm(`确认删除 ${selected.display_name}？`)) return;
    await fetch(`/api/integrations/${selected.id}`, { method: 'DELETE' });
    setSelected(null);
    await load();
  }

  async function addIntegration() {
    if (!addForm.provider_key || !addForm.display_name) return;
    await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    setShowAdd(false);
    setAddForm({ category: 'payment', provider_key: '', display_name: '', environment: 'sandbox' });
    await load();
  }

  async function testConnection() {
    if (!selected) return;
    setTestResult(null);
    const res = await fetch(`/api/integrations/${selected.id}/test`, { method: 'POST' });
    const data = await res.json();
    setTestResult(data.message ?? (data.success ? '连接成功' : '连接失败'));
  }

  function toggleCat(cat: string) {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  const byCategory = integrations.reduce<Record<string, Integration[]>>((acc, i) => {
    (acc[i.category] ??= []).push(i);
    return acc;
  }, {});

  const catalogEntry = catalog.find(c => c.provider_key === selected?.provider_key);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">载入中…</div>;

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Left panel */}
      <div className="w-72 border-r flex flex-col bg-muted/30">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Plug className="h-4 w-4" />
            Integration Center
          </div>
          <button onClick={() => setShowAdd(true)} className="text-xs bg-primary text-primary-foreground rounded px-2 py-1 flex items-center gap-1">
            <Plus className="h-3 w-3" /> 添加
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
            <div key={cat}>
              <button
                onClick={() => toggleCat(cat)}
                className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-muted-foreground uppercase hover:text-foreground"
              >
                {label}
                {expandedCats.has(cat) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              {expandedCats.has(cat) && (byCategory[cat] ?? []).map(i => (
                <button
                  key={i.id}
                  onClick={() => selectIntegration(i)}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${selected?.id === i.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
                >
                  {i.is_enabled
                    ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                    : <XCircle className="h-3 w-3 text-muted-foreground shrink-0" />}
                  <span className="truncate">{i.display_name}</span>
                  <span className={`ml-auto text-[10px] px-1 rounded ${i.environment === 'production' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {i.environment === 'production' ? 'PROD' : 'SBX'}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Queue stats */}
        {queueStats.length > 0 && (
          <div className="border-t p-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
              <Activity className="h-3 w-3" /> 队列状态
            </div>
            {queueStats.map(s => (
              <div key={s.queue_name} className="text-xs flex justify-between py-0.5">
                <span className="text-muted-foreground">{s.queue_name}</span>
                <span className="space-x-1">
                  <span className="text-yellow-600">{s.pending}P</span>
                  <span className="text-blue-600">{s.processing}R</span>
                  <span className="text-red-600">{s.dead}D</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="text-center text-muted-foreground mt-20">
            <Plug className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">从左侧选择一个 Integration，或点击「添加」创建新的</p>
            <p className="text-xs mt-2">所有 Payment Gateway、Game Provider、SMS、Email、Storage 集成都在这里统一管理</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold">{selected.display_name}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {CATEGORY_LABELS[selected.category]} · {selected.provider_key}
                </p>
              </div>
              <button onClick={deleteIntegration} className="text-destructive hover:opacity-70 p-1">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* Status row */}
            <div className="flex items-center gap-4">
              <button onClick={toggleEnabled} className="flex items-center gap-2 text-sm">
                {selected.is_enabled
                  ? <ToggleRight className="h-5 w-5 text-green-500" />
                  : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                {selected.is_enabled ? '已启用' : '已禁用'}
              </button>
              <div className="flex gap-2 text-xs">
                {(['sandbox', 'production'] as const).map(env => (
                  <button
                    key={env}
                    onClick={() => setEnvironment(env)}
                    className={`px-2 py-1 rounded border text-xs ${selected.environment === env ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
                  >
                    {env === 'production' ? 'Production' : 'Sandbox'}
                  </button>
                ))}
              </div>
              <button onClick={testConnection} className="ml-auto flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-accent">
                <RefreshCw className="h-3 w-3" /> 测试连接
              </button>
            </div>

            {testResult && (
              <div className="text-xs bg-muted p-3 rounded border">{testResult}</div>
            )}

            {/* Webhook URL */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Webhook Callback URL</label>
              <code className="text-xs bg-muted px-3 py-2 rounded block">
                {typeof window !== 'undefined' ? window.location.origin : ''}/api/callback/{selected.category}/{selected.provider_key}
              </code>
              <p className="text-xs text-muted-foreground mt-1">将此 URL 填入 {selected.display_name} 后台的 Webhook/Callback 设置</p>
            </div>

            {/* Credentials */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Key className="h-4 w-4" />
                <span className="text-sm font-semibold">API 凭证</span>
              </div>
              {catalogEntry?.credential_keys.map(k => (
                <div key={k} className="mb-3">
                  <label className="text-xs font-mono text-muted-foreground block mb-1">{k}</label>
                  <input
                    type="password"
                    placeholder={credentials[k] ? '••••••••' : '(未设置)'}
                    value={credEdit[k] ?? ''}
                    onChange={e => setCredEdit(prev => ({ ...prev, [k]: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm bg-background font-mono"
                  />
                </div>
              ))}
              {!catalogEntry && (
                <p className="text-xs text-muted-foreground">此 provider 未在 ADAPTER_CATALOG 中注册，无法显示凭证字段。</p>
              )}
              {Object.keys(credEdit).some(k => credEdit[k].trim()) && (
                <button
                  onClick={saveCredentials}
                  disabled={saving}
                  className="bg-primary text-primary-foreground text-sm px-4 py-2 rounded hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? '保存中…' : '保存凭证'}
                </button>
              )}
            </div>

            {/* Info */}
            <div className="text-xs text-muted-foreground border-t pt-4 space-y-1">
              <p>创建时间: {new Date(selected.created_at).toLocaleString('zh-MY')}</p>
              <p>更新时间: {new Date(selected.updated_at).toLocaleString('zh-MY')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-96 space-y-4 shadow-xl">
            <h3 className="font-semibold">添加 Integration</h3>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">类别</label>
              <select value={addForm.category} onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm bg-background">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Provider Key</label>
              <select
                value={addForm.provider_key}
                onChange={e => {
                  const entry = catalog.find(c => c.provider_key === e.target.value);
                  setAddForm(p => ({ ...p, provider_key: e.target.value, display_name: entry?.display_name ?? p.display_name }));
                }}
                className="w-full border rounded px-3 py-2 text-sm bg-background"
              >
                <option value="">-- 从目录选择 --</option>
                {catalog.filter(c => c.category === addForm.category).map(c => (
                  <option key={c.provider_key} value={c.provider_key}>{c.display_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">显示名称</label>
              <input value={addForm.display_name} onChange={e => setAddForm(p => ({ ...p, display_name: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="e.g. ToyyibPay Production" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">环境</label>
              <select value={addForm.environment} onChange={e => setAddForm(p => ({ ...p, environment: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm bg-background">
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={addIntegration} className="flex-1 bg-primary text-primary-foreground text-sm py-2 rounded hover:opacity-90">添加</button>
              <button onClick={() => setShowAdd(false)} className="flex-1 border text-sm py-2 rounded hover:bg-accent">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add sidebar entry**

In `erp/src/components/sidebar.tsx`, find the `System` group (around line 104-109):

```typescript
  {
    title: 'System',
    items: [
      { href: '/system/health',  label: '健康监控', icon: Activity,  permission: 'maintenance.view' },
      { href: '/system/backups', label: '备份管理', icon: HardDrive, permission: 'maintenance.view' },
    ],
  },
```

Change to:

```typescript
  {
    title: 'System',
    items: [
      { href: '/integrations',   label: 'Integration Center', icon: Plug,      permission: 'maintenance.view' },
      { href: '/system/health',  label: '健康监控',            icon: Activity,  permission: 'maintenance.view' },
      { href: '/system/backups', label: '备份管理',            icon: HardDrive, permission: 'maintenance.view' },
    ],
  },
```

Also add `Plug` to the imports at the top of `sidebar.tsx`:

```typescript
import { ..., Plug } from 'lucide-react';
```

- [ ] **Step 3: TypeScript + build check**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx tsc --noEmit 2>&1 | grep -v node_modules | head -30
npm run build 2>&1 | tail -20
```

Expected: zero TypeScript errors, build success.

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/hang/Downloads/Test/telegram-member-bot/erp
npx jest --no-coverage 2>&1 | tail -10
```

Expected: all prior tests still pass + new tests pass.

- [ ] **Step 5: Commit**

```bash
git add erp/src/app/\(dashboard\)/integrations/ erp/src/components/sidebar.tsx
git commit -m "feat: Integration Center UI — two-panel layout, credential manager, queue stats, webhook URL display"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Integration Center ERP UI — Task 8
- ✅ Adapter Pattern (IPaymentGateway, IGameProvider, ISmsProvider, IEmailProvider, IStorageProvider ref, INotificationProvider) — Task 2 types.ts
- ✅ Webhook Framework (receive→log→queue→process) — Task 3 webhook.ts + Task 7 callback route
- ✅ Signature Framework (HMAC-SHA256, timestamp window, nonce replay) — Task 3 signature.ts
- ✅ API Registry (DB-backed integrations table) — Task 1 + Task 5 registry.ts
- ✅ Credential encryption (AES-256-GCM) — Task 2 crypto.ts + Task 5 registry.ts
- ✅ Wallet Foundation (wallet_accounts + wallet_transactions + wallet_balance_snapshots) — Task 1 + Task 6
- ✅ Transaction Ledger (SELECT FOR UPDATE, credit/debit) — Task 6 service.ts
- ✅ Event Bus (EventEmitter + event_log) — Task 4 event-bus.ts
- ✅ Queue System + Worker — Task 4 queue.ts + Task 7 queue/process route
- ✅ Dead Letter Queue (status='dead') — Task 4 queue.ts failJob()
- ✅ Retry Framework (withRetry exponential backoff) — Task 4 retry.ts
- ✅ API Logs + Callback Logs — Task 1 tables + Task 5 logger.ts + Task 7 logs route
- ✅ Health Monitoring — Task 7 health route
- ✅ Sandbox/Production toggle — integrations.environment field + UI
- ✅ White Label (per-integration config, each client different gateway) — integrations table UNIQUE(category, provider_key, environment)
- ✅ No re-architecting to plug in future APIs — ADAPTER_CATALOG + IAdapter interface hierarchy
- ✅ audit_logs.admin_id NOT NULL issue resolved — actor_type column added in migration 046

**Type consistency verified:**
- `IntegrationCategory`, `Integration`, `QueueJob`, `IAdapter` used consistently across tasks 2-8
- `WebhookContext` defined in types.ts, consumed in webhook.ts and callback route
- `encryptCredential`/`decryptCredential` defined in crypto.ts, used only in registry.ts (server-side)
