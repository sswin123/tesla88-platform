# MegaH5 Provider Adapter — Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the MegaH5Adapter so players can launch Mega888H5 games from the website, establishing the reference pattern for all future provider integrations.

**Architecture:** The MegaH5Adapter is registered in AdapterFactory and loaded on-demand by BrandProviderManager (which reads credentials from `brand_provider_credentials`). The `/api/games/launch` route is updated to route non-918KISS providers through BrandProviderManager. The 918KISS legacy path is untouched.

**Tech Stack:** TypeScript, Node.js crypto (createHash/createCipheriv), Next.js App Router, PostgreSQL via `@/lib/db`, Vitest.

## Global Constraints

- NEVER modify: 918KISS adapter, Kiss918Adapter.ts, Kiss918ApiClient.ts, Kiss918AuthService.ts, Kiss918CallbackParser.ts, Kiss918CallbackFormatter.ts, gaming.ts (918KISS singleton), gp_credentials table reads, gp_config table reads, MasterWalletEngine, TransactionEngine, IdempotencyEngine, BrandProviderManager, ProviderManager, BaseProviderAdapter
- NEVER touch: Website source code, Brand Center UI, existing migration files
- New providers use `brand_provider_credentials` / `brand_provider_config` — never `gp_credentials` / `gp_config`
- All provider code strings must be uppercase (`MEGAH5`)
- Credential key names (as stored in `brand_provider_credentials`): `api_token`, `operator_token`, `secret_key`, `encrypt_key`, `md5_key`
- Config key names (as stored in `brand_provider_config`): `api_base_url`, `h5_api_domain`, `h5_lobby_domain`, `h5_game_domain`, `postfix_id`, `currency`, `timeout_ms`, `datafeed_url`
- Run tests with: `cd erp && npx vitest run` — must stay at 0 failures after each task
- Run type check with: `cd erp && npx tsc --noEmit` — must stay at 0 new errors
- Commit after every task (not every step)
- The launch route must keep 918KISS on its existing `getKiss918Adapter()` path — only new providers use BrandProviderManager
- All adapters MUST extend `BaseProviderAdapter` from `@/lib/providers/adapters/base/BaseProviderAdapter`
- MEGAH5 uses the same signing algorithm as 918KISS (DES-CBC + MD5) — implement fresh in MegaH5Crypto, no cross-adapter imports
- Error codes in callbacks follow the same convention as 918KISS (OPERATOR_ERROR constants)

---

## File Structure

```
erp/src/lib/providers/adapters/megah5/
  constants.ts              CREATE — MEGAH5_CODE, API paths, OPERATOR_ERROR codes, language codes
  types.ts                  CREATE — MegaH5Credentials, MegaH5Config interfaces
  MegaH5Crypto.ts           CREATE — DES-CBC encrypt, MD5 sign, request signature builder
  MegaH5ApiClient.ts        CREATE — HTTP client: createPlayer, getLoginToken, getGameList, healthCheck
  MegaH5CallbackParser.ts   CREATE — parse inbound callbacks → normalized wallet types
  MegaH5CallbackFormatter.ts CREATE — format wallet responses → MEGAH5 JSON shapes
  MegaH5Adapter.ts          CREATE — full IGameProvider implementation

erp/src/app/api/games/megah5/
  callback/[action]/route.ts  CREATE — POST /api/games/megah5/callback/:action

erp/src/lib/providers/adapters/AdapterFactory.ts   MODIFY — add MEGAH5 case
erp/src/app/api/games/launch/route.ts              MODIFY — remove hardcoded 918KISS check; add brand-aware routing
erp/src/lib/providers/index.ts                     MODIFY — export MegaH5Adapter + types

erp/tests/
  megah5-crypto.test.ts         CREATE
  megah5-parser.test.ts         CREATE
  megah5-formatter.test.ts      CREATE
  megah5-adapter-factory.test.ts CREATE
  megah5-launch-route.test.ts   CREATE
  megah5-callback-route.test.ts CREATE
```

---

### Task 1: Constants + Credential/Config Types

**Files:**
- Create: `erp/src/lib/providers/adapters/megah5/constants.ts`
- Create: `erp/src/lib/providers/adapters/megah5/types.ts`
- Test: `erp/tests/megah5-crypto.test.ts` (type-safety smoke test only in this task)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `MEGAH5_CODE = 'MEGAH5'`
  - `MEGAH5_NAME = 'Mega888H5'`
  - `H5_PATH.LOGIN`, `H5_PATH.GAME_LIST`
  - `API_PATH.CREATE_PLAYER`, `API_PATH.CHECK_PLAYER`, `API_PATH.HEALTH`
  - `OPERATOR_ERROR` — same numeric codes as 918KISS (0=OK, 1=UNKNOWN, 2=NOT_FOUND, 3=INSUFFICIENT_BALANCE, 4=AUTH_FAILED, 6=DUPLICATE, 8=MAINTENANCE, 9=SYSTEM_ERROR)
  - `MegaH5Credentials` interface
  - `MegaH5Config` interface

- [ ] **Step 1: Write constants.ts**

```typescript
// erp/src/lib/providers/adapters/megah5/constants.ts

export const MEGAH5_CODE = 'MEGAH5';
export const MEGAH5_NAME = 'Mega888H5';

/** H5 API endpoints (on h5_api_domain). */
export const H5_PATH = {
  LOGIN:      '/api/Acc/Login',
  GAME_LIST:  '/api/Game/GameList',
  LOGOUT:     '/api/Acc/Logout',
} as const;

/** Operations API endpoints (on api_base_url). */
export const API_PATH = {
  CREATE_PLAYER:  '/operator/v2/CreatePlayer',
  CHECK_PLAYER:   '/operator/v2/CheckPlayer',
  HEALTH:         '/operator/v2/HealthCheck',
} as const;

/**
 * Error codes returned by OPERATOR to MEGAH5 in Seamless Wallet callbacks.
 * Mirror of Kiss918 OPERATOR_ERROR — same numeric convention.
 */
export const OPERATOR_ERROR = {
  OK:                   0,
  UNKNOWN:              1,
  PLAYER_NOT_FOUND:     2,
  INSUFFICIENT_BALANCE: 3,
  AUTH_FAILED:          4,
  DUPLICATE:            6,
  MAINTENANCE:          8,
  SYSTEM_ERROR:         9,
} as const;

export type OperatorErrorCode = typeof OPERATOR_ERROR[keyof typeof OPERATOR_ERROR];

/** Language codes understood by MEGAH5. */
export const MEGAH5_LANGUAGE = { EN: 1, ZH: 2, TH: 3, ID: 5, VI: 7 } as const;
```

- [ ] **Step 2: Write types.ts**

```typescript
// erp/src/lib/providers/adapters/megah5/types.ts

/** Credentials loaded from brand_provider_credentials. */
export interface MegaH5Credentials {
  /** Outbound API access token (sent by us in API calls). key = 'api_token' */
  api_token: string;
  /** Inbound operator token (sent by MEGAH5 in callback headers). key = 'operator_token' */
  operator_token: string;
  /** SecretKey used in H5 Login MD5 signature. key = 'secret_key' */
  secret_key: string;
  /** DES-CBC EncryptKey (8 bytes) for H5 Login QS encryption. key = 'encrypt_key' */
  encrypt_key: string;
  /** Md5EncryptKey used in H5 Login MD5 signature. key = 'md5_key' */
  md5_key: string;
}

/** Configuration loaded from brand_provider_config. */
export interface MegaH5Config {
  /** Operations API base URL. key = 'api_base_url' */
  api_base_url: string;
  /** H5 API domain for /api/Acc/Login and /api/Game/GameList. key = 'h5_api_domain' */
  h5_api_domain: string;
  /** H5 Lobby launch domain. key = 'h5_lobby_domain' */
  h5_lobby_domain: string;
  /** H5 Game launch domain. key = 'h5_game_domain' */
  h5_game_domain: string;
  /** PostfixID appended to player accountIDs. key = 'postfix_id' */
  postfix_id: string;
  /** Default currency. key = 'currency'. Default: 'MYR' */
  currency: string;
  /** HTTP request timeout in ms. key = 'timeout_ms'. Default: 10_000 */
  timeout_ms: number;
  /** DataFeed API base URL (optional). key = 'datafeed_url' */
  datafeed_url?: string;
  /** Enable verbose debug logging. Derived from env ENABLE_PROVIDER_DEBUG. */
  debug: boolean;
}
```

- [ ] **Step 3: Write the smoke test for type exports**

```typescript
// erp/tests/megah5-crypto.test.ts
import { describe, it, expect } from 'vitest';
import { MEGAH5_CODE, MEGAH5_NAME, OPERATOR_ERROR, H5_PATH, API_PATH } from '@/lib/providers/adapters/megah5/constants';

describe('megah5/constants', () => {
  it('exports correct provider code', () => {
    expect(MEGAH5_CODE).toBe('MEGAH5');
    expect(MEGAH5_NAME).toBe('Mega888H5');
  });

  it('OPERATOR_ERROR.OK is 0', () => {
    expect(OPERATOR_ERROR.OK).toBe(0);
    expect(OPERATOR_ERROR.PLAYER_NOT_FOUND).toBe(2);
    expect(OPERATOR_ERROR.DUPLICATE).toBe(6);
  });

  it('H5_PATH.LOGIN is defined', () => {
    expect(H5_PATH.LOGIN).toBe('/api/Acc/Login');
  });

  it('API_PATH.CREATE_PLAYER is defined', () => {
    expect(API_PATH.CREATE_PLAYER).toBe('/operator/v2/CreatePlayer');
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd erp && npx vitest run tests/megah5-crypto.test.ts
```
Expected: 4/4 PASS

- [ ] **Step 5: Type check**

```bash
cd erp && npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0 errors"
```
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add erp/src/lib/providers/adapters/megah5/constants.ts \
        erp/src/lib/providers/adapters/megah5/types.ts \
        erp/tests/megah5-crypto.test.ts
git commit -m "feat(megah5): add MEGAH5 constants and credential/config types"
```

---

### Task 2: Crypto Layer — MegaH5Crypto

Implements the DES-CBC + MD5 signing used for H5 Login. Identical algorithm to 918KISS but fully independent.

**Files:**
- Create: `erp/src/lib/providers/adapters/megah5/MegaH5Crypto.ts`
- Modify: `erp/tests/megah5-crypto.test.ts` (add crypto tests)

**Interfaces:**
- Consumes: `MegaH5Credentials`, `MegaH5Config` (from Task 1)
- Produces:
  - `MegaH5Crypto.md5Hex(input: string): string`
  - `MegaH5Crypto.desEncrypt(plaintext: string, key: string): string` — base64 output
  - `MegaH5Crypto.buildLoginPayload(params: LoginPayloadParams): { q: string; s: string }` — returns encoded QS ciphertext + MD5 sign

- [ ] **Step 1: Write the failing tests first**

```typescript
// Append to erp/tests/megah5-crypto.test.ts
import { MegaH5Crypto } from '@/lib/providers/adapters/megah5/MegaH5Crypto';

describe('MegaH5Crypto', () => {
  const crypto = new MegaH5Crypto();

  it('md5Hex returns lowercase 32-char hex', () => {
    const result = crypto.md5Hex('hello');
    expect(result).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(result).toHaveLength(32);
    expect(result).toBe(result.toLowerCase());
  });

  it('desEncrypt returns non-empty base64 string', () => {
    const key = '12345678'; // 8-byte DES key
    const result = crypto.desEncrypt('hello world', key);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Must be valid base64
    expect(() => Buffer.from(result, 'base64')).not.toThrow();
  });

  it('desEncrypt is deterministic for same key+plaintext', () => {
    const key = 'testkey1';
    const out1 = crypto.desEncrypt('test payload', key);
    const out2 = crypto.desEncrypt('test payload', key);
    expect(out1).toBe(out2);
  });

  it('buildLoginPayload returns q and s fields', () => {
    const result = crypto.buildLoginPayload({
      accountId:   'u1@testpostfix',
      currency:    'MYR',
      nickname:    'Player1',
      language:    2,
      secretKey:   'secret123',
      encryptKey:  'enckey12',
      md5Key:      'md5keyxx',
      accessToken: 'acc_token',
    });
    expect(result).toHaveProperty('q');
    expect(result).toHaveProperty('s');
    expect(typeof result.q).toBe('string');
    expect(typeof result.s).toBe('string');
    expect(result.s).toHaveLength(32); // MD5 is always 32 hex chars
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd erp && npx vitest run tests/megah5-crypto.test.ts
```
Expected: FAIL — "Cannot find module '@/lib/providers/adapters/megah5/MegaH5Crypto'"

- [ ] **Step 3: Implement MegaH5Crypto.ts**

```typescript
// erp/src/lib/providers/adapters/megah5/MegaH5Crypto.ts
import { createCipheriv, createHash } from 'crypto';

export interface LoginPayloadParams {
  accountId:   string;
  currency:    string;
  nickname:    string;
  language:    number;
  secretKey:   string;
  encryptKey:  string;
  md5Key:      string;
  accessToken: string;
}

export interface LoginPayload {
  q: string;  // URL-encoded DES-CBC encrypted QS
  s: string;  // MD5 hex signature
}

/**
 * MegaH5Crypto — DES-CBC encryption + MD5 signing for H5 Login.
 *
 * Per MEGAH5 H5 API (same algorithm as 918KISS API v1.11 page 45-48):
 *   QS = "key={secretKey}|time={currTime}|userName={accountId}|password={accountId}|currency={currency}|nickName={nickname}"
 *   q  = URLEncode(DES-CBC-encrypt(QS, encryptKey))   — key = IV = first 8 bytes
 *   s  = MD5(QS + md5Key + currTime + secretKey)      — lowercase hex
 *
 * Delimiter between fields is "|" (pipe). Verify against actual MEGAH5 API docs
 * if integration fails — 918KISS uses configurable delimiter, MEGAH5 may use pipe.
 */
export class MegaH5Crypto {
  /** MD5 of input string, returned as lowercase hex. */
  md5Hex(input: string): string {
    return createHash('md5').update(input, 'utf8').digest('hex');
  }

  /**
   * DES-CBC encrypt plaintext.
   * Key and IV both = first 8 bytes of key (padded/truncated).
   * Returns base64-encoded ciphertext.
   */
  desEncrypt(plaintext: string, key: string): string {
    const keyBuf = Buffer.from(key.padEnd(8, '\0').slice(0, 8), 'utf8');
    const cipher = createCipheriv('des-cbc', keyBuf, keyBuf);
    cipher.setAutoPadding(true);
    return Buffer.concat([
      cipher.update(Buffer.from(plaintext, 'utf8')),
      cipher.final(),
    ]).toString('base64');
  }

  private formatUtcDateTime(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      String(d.getUTCFullYear()) +
      p(d.getUTCMonth() + 1) +
      p(d.getUTCDate()) +
      p(d.getUTCHours()) +
      p(d.getUTCMinutes()) +
      p(d.getUTCSeconds())
    );
  }

  /**
   * Build the q (encrypted QS) and s (MD5 sign) for H5 Login POST body.
   * Uses "|" as the field delimiter — adjust if MEGAH5 API requires different separator.
   */
  buildLoginPayload(params: LoginPayloadParams): LoginPayload {
    const currTime = this.formatUtcDateTime(new Date());
    const d = '|'; // field delimiter — verify with actual MEGAH5 API spec

    const QS = [
      `key=${params.secretKey}`,
      `time=${currTime}`,
      `userName=${params.accountId}`,
      `password=${params.accountId}`,
      `currency=${params.currency}`,
      `nickName=${params.nickname}`,
    ].join(d);

    const q = encodeURIComponent(this.desEncrypt(QS, params.encryptKey));
    const s = this.md5Hex(QS + params.md5Key + currTime + params.secretKey);

    return { q, s };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd erp && npx vitest run tests/megah5-crypto.test.ts
```
Expected: all PASS

- [ ] **Step 5: Type check**

```bash
cd erp && npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0 errors"
```

- [ ] **Step 6: Commit**

```bash
git add erp/src/lib/providers/adapters/megah5/MegaH5Crypto.ts \
        erp/tests/megah5-crypto.test.ts
git commit -m "feat(megah5): add crypto layer (DES-CBC + MD5 signing)"
```

---

### Task 3: HTTP Client — MegaH5ApiClient

All outbound HTTP calls to MEGAH5 API. No business logic — only HTTP, retry, JSON parsing, error handling.

**Files:**
- Create: `erp/src/lib/providers/adapters/megah5/MegaH5ApiClient.ts`
- Test: inline in adapter tests (no dedicated file needed — HTTP client is tested via adapter tests with mocked fetch)

**Interfaces:**
- Consumes: `MegaH5Crypto`, `MegaH5Credentials`, `MegaH5Config`, `H5_PATH`, `API_PATH` (Tasks 1-2)
- Produces:
  - `MegaH5ApiClient.h5Login(params): Promise<{ actk: string; latencyMs: number }>`
  - `MegaH5ApiClient.createPlayer(accountID, nickName, currency): Promise<{ playerID: number }>`
  - `MegaH5ApiClient.checkPlayer(accountID): Promise<{ playerID: number }>`
  - `MegaH5ApiClient.getGameList(): Promise<GameListItem[]>`
  - `MegaH5ApiClient.healthCheck(): Promise<{ latencyMs: number }>`

- [ ] **Step 1: Implement MegaH5ApiClient.ts**

```typescript
// erp/src/lib/providers/adapters/megah5/MegaH5ApiClient.ts
import { MegaH5Crypto } from './MegaH5Crypto';
import { H5_PATH, API_PATH, MEGAH5_LANGUAGE } from './constants';
import type { MegaH5Credentials, MegaH5Config } from './types';
import type { GameListItem } from '../../types/game.types';
import { GAME_TYPE } from '../../types/game.types';

interface BaseResponse {
  statusCode: number;
  errMsg: string;
}
interface CreatePlayerRes extends BaseResponse { playerID: number }
interface CheckPlayerRes  extends BaseResponse { playerID: number }
interface GameListRes extends BaseResponse {
  gameList: Array<{ gameID: number; gameName: string; gameType: number; status: number }>;
}
interface H5LoginRes {
  actk?: string | null;
  status?: number | string | null;
  description?: string | null;
}

/**
 * MegaH5ApiClient — all outbound HTTP calls to MEGAH5 Operations and H5 APIs.
 *
 * Responsibilities: Retry on network errors, timeout enforcement, JSON parsing,
 *   HTTP error handling. No wallet / player / game business logic.
 *
 * NOTE: API endpoint paths and request body shapes are based on the MEGAH5 API
 *   spec. If the provider sends a different format, update the request building
 *   logic in this file only — no other file needs to change.
 */
export class MegaH5ApiClient {
  private readonly crypto = new MegaH5Crypto();

  constructor(
    private readonly creds: MegaH5Credentials,
    private readonly cfg:   MegaH5Config,
  ) {}

  /** H5 Login — returns the actk (access token) for URL construction. */
  async h5Login(params: {
    accountId:  string;
    currency:   string;
    nickname:   string;
    language:   number;
    lobbyUrl:   string;
  }): Promise<{ actk: string; latencyMs: number }> {
    const { q, s } = this.crypto.buildLoginPayload({
      accountId:   params.accountId,
      currency:    params.currency,
      nickname:    params.nickname,
      language:    params.language,
      secretKey:   this.creds.secret_key,
      encryptKey:  this.creds.encrypt_key,
      md5Key:      this.creds.md5_key,
      accessToken: this.creds.api_token,
    });

    const body = JSON.stringify({ q, s, accessToken: this.creds.api_token });
    const url  = `${this.cfg.h5_api_domain.replace(/\/$/, '')}${H5_PATH.LOGIN}`;

    if (this.cfg.debug) {
      console.debug('[MegaH5ApiClient] h5Login →', url);
    }

    const { data: raw, latencyMs } = await this.post<H5LoginRes>(url, body);

    if (!raw.actk) {
      throw new Error(
        `MEGAH5 H5 Login failed: status=${raw.status} description="${raw.description}"`,
      );
    }

    return { actk: raw.actk, latencyMs };
  }

  /** Register a new player on MEGAH5 provider side. */
  async createPlayer(
    accountID: string,
    nickName:  string,
    currency:  string,
  ): Promise<{ playerID: number }> {
    const url = `${this.cfg.api_base_url.replace(/\/$/, '')}${API_PATH.CREATE_PLAYER}`;
    const body = JSON.stringify({
      accessToken: this.creds.api_token,
      accountID,
      nickName,
      currency,
      language: MEGAH5_LANGUAGE.ZH,
    });
    const res = await this.post<CreatePlayerRes>(url, body);
    if (res.data.statusCode !== 0) {
      throw new Error(`MEGAH5 CreatePlayer error ${res.data.statusCode}: ${res.data.errMsg}`);
    }
    return { playerID: res.data.playerID };
  }

  /** Retrieve the provider playerID for an existing account. */
  async checkPlayer(accountID: string): Promise<{ playerID: number }> {
    const url = `${this.cfg.api_base_url.replace(/\/$/, '')}${API_PATH.CHECK_PLAYER}`;
    const body = JSON.stringify({ accessToken: this.creds.api_token, accountID });
    const res = await this.post<CheckPlayerRes>(url, body);
    if (res.data.statusCode !== 0) {
      throw new Error(`MEGAH5 CheckPlayer error ${res.data.statusCode}: ${res.data.errMsg}`);
    }
    return { playerID: res.data.playerID };
  }

  /** Fetch the full game list from MEGAH5. */
  async getGameList(): Promise<GameListItem[]> {
    const url = `${this.cfg.h5_api_domain.replace(/\/$/, '')}${H5_PATH.GAME_LIST}`;
    const body = JSON.stringify({ accessToken: this.creds.api_token });
    const res = await this.post<GameListRes>(url, body);
    if (res.data.statusCode !== 0) {
      throw new Error(`MEGAH5 GameList error ${res.data.statusCode}: ${res.data.errMsg}`);
    }
    return (res.data.gameList ?? []).map(g => ({
      game_code: String(g.gameID),
      name:      g.gameName,
      game_type: this.mapGameType(g.gameType),
      is_active: g.status === 1,
    }));
  }

  /** Lightweight ping to verify API connectivity. Throws on failure. */
  async healthCheck(): Promise<{ latencyMs: number }> {
    const url = `${this.cfg.api_base_url.replace(/\/$/, '')}${API_PATH.HEALTH}`;
    const body = JSON.stringify({ accessToken: this.creds.api_token });
    const { latencyMs } = await this.post<BaseResponse>(url, body);
    return { latencyMs };
  }

  private mapGameType(t: number): typeof GAME_TYPE[keyof typeof GAME_TYPE] {
    switch (t) {
      case 1: return GAME_TYPE.SLOT;
      case 2: return GAME_TYPE.ARCADE;
      case 3: return GAME_TYPE.TABLE;
      case 4: return GAME_TYPE.FISHING;
      case 5: return GAME_TYPE.LIVE_CASINO;
      default: return GAME_TYPE.OTHER;
    }
  }

  private async post<T>(
    url: string,
    jsonBody: string,
  ): Promise<{ data: T; latencyMs: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeout_ms);
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${this.creds.api_token}`,
        },
        body:   jsonBody,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`MEGAH5 API request to ${url} failed: ${msg} (${latencyMs}ms)`);
    }
    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MEGAH5 API HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as T;
    return { data, latencyMs };
  }
}
```

- [ ] **Step 2: Type check**

```bash
cd erp && npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0 errors"
```
Expected: 0 errors

- [ ] **Step 3: Run full test suite to ensure no regressions**

```bash
cd erp && npx vitest run
```
Expected: all existing tests + new megah5-crypto tests pass

- [ ] **Step 4: Commit**

```bash
git add erp/src/lib/providers/adapters/megah5/MegaH5ApiClient.ts
git commit -m "feat(megah5): add HTTP client (createPlayer, h5Login, getGameList, healthCheck)"
```

---

### Task 4: Callback Parser + Formatter

Parse inbound MEGAH5 callback requests into normalized wallet types, and format wallet responses back to MEGAH5 JSON.

**Files:**
- Create: `erp/src/lib/providers/adapters/megah5/MegaH5CallbackParser.ts`
- Create: `erp/src/lib/providers/adapters/megah5/MegaH5CallbackFormatter.ts`
- Create: `erp/tests/megah5-parser.test.ts`
- Create: `erp/tests/megah5-formatter.test.ts`

**Interfaces:**
- Consumes: wallet types from `@/lib/providers/types/wallet.types`, `MEGAH5_CODE` (Task 1)
- Produces:
  - `MegaH5CallbackParser.parseAuthenticateRequest(body)`
  - `MegaH5CallbackParser.parseGetBalanceRequest(body)`
  - `MegaH5CallbackParser.parseBetRequest(body)`
  - `MegaH5CallbackParser.parseBetResultRequest(body)`
  - `MegaH5CallbackParser.parseRefundRequest(body)`
  - `MegaH5CallbackParser.parseJackpotWinRequest(body)`
  - `MegaH5CallbackParser.parseFundRequestRequest(body)`
  - `MegaH5CallbackParser.parseFundReturnRequest(body)`
  - `MegaH5CallbackParser.parseFundBetResultRequest(body)`
  - `MegaH5CallbackFormatter.formatAuthenticate(res)` → `{ error, playerID, balance }`
  - `MegaH5CallbackFormatter.formatGetBalance(res)` → `{ error, balance }`
  - `MegaH5CallbackFormatter.formatBet(res)` → `{ error, balance, referenceID }`
  - `MegaH5CallbackFormatter.formatBetResult(res)` → `{ error, balance, referenceID }`
  - `MegaH5CallbackFormatter.formatRefund(res)` → `{ error, balance, referenceID }`
  - `MegaH5CallbackFormatter.formatJackpotWin(res)` → `{ error, balance, referenceID }`
  - `MegaH5CallbackFormatter.formatFundRequest(res)` → `{ error, balance, referenceID }`
  - `MegaH5CallbackFormatter.formatFundReturn(res)` → `{ error, balance, referenceID }`
  - `MegaH5CallbackFormatter.formatFundBetResult(_res)` → `{ error: 0 }`

**MEGAH5 callback body field conventions** (same as 918KISS — verify with actual API docs):
- `playerID` → provider_player_id (resolved via `__resolved_user_id` injection)
- `referenceID` → reference_id
- `roundID` → round_id
- `gameID` → game_id
- `betAmount` → bet_amount
- `winAmount` → win_amount
- `betReferenceID` → bet_reference_id
- `currency` → currency
- `userName` → username (authenticate only)
- `password` → password (authenticate only)

- [ ] **Step 1: Write failing parser tests**

```typescript
// erp/tests/megah5-parser.test.ts
import { describe, it, expect } from 'vitest';
import { MegaH5CallbackParser } from '@/lib/providers/adapters/megah5/MegaH5CallbackParser';

const parser = new MegaH5CallbackParser();

describe('MegaH5CallbackParser', () => {
  it('parseAuthenticateRequest extracts resolved userId', () => {
    const body = {
      playerID: 999,
      userName: 'u5@test',
      password: 'u5@test',
      referenceID: 'ref123',
      __resolved_user_id: '5',
    };
    const req = parser.parseAuthenticateRequest(body);
    expect(req.provider).toBe('MEGAH5');
    expect(req.provider_player_id).toBe('5');
    expect(req.username).toBe('u5@test');
    expect(req.reference_id).toBe('ref123');
  });

  it('parseGetBalanceRequest maps currency', () => {
    const body = { playerID: 1, referenceID: 'ref456', currency: 'MYR', __resolved_user_id: '7' };
    const req = parser.parseGetBalanceRequest(body);
    expect(req.currency).toBe('MYR');
    expect(req.provider_player_id).toBe('7');
  });

  it('parseBetRequest maps betAmount', () => {
    const body = {
      playerID: 1, referenceID: 'bet1', roundID: 'rnd1',
      gameID: 'g1', betAmount: 10.5, currency: 'MYR',
      roundDetails: 'spin', __resolved_user_id: '3',
    };
    const req = parser.parseBetRequest(body);
    expect(req.bet_amount).toBe(10.5);
    expect(req.game_id).toBe('g1');
    expect(req.round_id).toBe('rnd1');
  });

  it('parseBetResultRequest maps winAmount', () => {
    const body = {
      playerID: 1, referenceID: 'res1', roundID: 'rnd1',
      gameID: 'g1', winAmount: 20, currency: 'MYR',
      betReferenceID: 'bet1', roundDetails: 'win', __resolved_user_id: '3',
    };
    const req = parser.parseBetResultRequest(body);
    expect(req.win_amount).toBe(20);
    expect(req.bet_reference_id).toBe('bet1');
  });

  it('parseRefundRequest maps betReferenceID', () => {
    const body = {
      playerID: 1, referenceID: 'ref1', betReferenceID: 'bet1',
      betAmount: 5, currency: 'MYR', roundDetails: 'refund',
      __resolved_user_id: '3',
    };
    const req = parser.parseRefundRequest(body);
    expect(req.refund_amount).toBe(5);
    expect(req.bet_reference_id).toBe('bet1');
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd erp && npx vitest run tests/megah5-parser.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement MegaH5CallbackParser.ts**

```typescript
// erp/src/lib/providers/adapters/megah5/MegaH5CallbackParser.ts
import { MEGAH5_CODE } from './constants';
import type {
  AuthenticateRequest, GetBalanceRequest, BetRequest, BetResultRequest,
  RefundRequest, JackpotWinRequest, FundRequestRequest, FundReturnRequest,
  FundBetResultRequest,
} from '../../types/wallet.types';

/**
 * MegaH5CallbackParser — translates raw MEGAH5 inbound callback bodies into
 * the normalized wallet callback shapes consumed by MasterWalletEngine.
 *
 * Expects `body.__resolved_user_id` to be pre-injected by the adapter's
 * async callback handlers (same pattern as Kiss918Adapter).
 *
 * Field mapping (MEGAH5 → our types):
 *   playerID       → provider_player_id (resolved via __resolved_user_id)
 *   referenceID    → reference_id
 *   roundID        → round_id
 *   gameID         → game_id
 *   betAmount      → bet_amount
 *   winAmount      → win_amount
 *   betReferenceID → bet_reference_id
 *   requestAmount  → request_amount (FundRequest)
 *   returnAmount   → return_amount (FundReturn)
 */
export class MegaH5CallbackParser {
  private resolvedId(body: Record<string, unknown>): string {
    if (body.__resolved_user_id != null) return String(body.__resolved_user_id);
    return String(body.playerID ?? '');
  }

  private raw(body: Record<string, unknown>): Record<string, unknown> {
    const { __resolved_user_id: _, ...rest } = body;
    return rest;
  }

  parseAuthenticateRequest(body: Record<string, unknown>): AuthenticateRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? `auth_${Date.now()}`),
      round_id:           null,
      username:           String(body.userName ?? ''),
      password:           String(body.password ?? ''),
      raw_payload:        this.raw(body),
    };
  }

  parseGetBalanceRequest(body: Record<string, unknown>): GetBalanceRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? `bal_${Date.now()}`),
      round_id:           null,
      currency:           String(body.currency ?? 'MYR'),
      raw_payload:        this.raw(body),
    };
  }

  parseBetRequest(body: Record<string, unknown>): BetRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      game_id:            String(body.gameID ?? ''),
      game_code:          body.gameCode != null ? String(body.gameCode) : null,
      bet_amount:         Number(body.betAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      round_details:      String(body.roundDetails ?? 'bet'),
      session_id:         null,
      platform:           null,
      raw_payload:        this.raw(body),
    };
  }

  parseBetResultRequest(body: Record<string, unknown>): BetResultRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      game_id:            String(body.gameID ?? ''),
      game_code:          body.gameCode != null ? String(body.gameCode) : null,
      win_amount:         Number(body.winAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      round_details:      String(body.roundDetails ?? 'result'),
      bet_reference_id:   body.betReferenceID != null ? String(body.betReferenceID) : null,
      result_url:         null,
      session_id:         null,
      jackpot_contribution: null,
      raw_payload:        this.raw(body),
    };
  }

  parseRefundRequest(body: Record<string, unknown>): RefundRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      game_id:            String(body.gameID ?? ''),
      refund_amount:      Number(body.betAmount ?? body.refundAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      bet_reference_id:   String(body.betReferenceID ?? ''),
      raw_payload:        this.raw(body),
    };
  }

  parseJackpotWinRequest(body: Record<string, unknown>): JackpotWinRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? `jp_${Date.now()}`),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      game_id:            String(body.gameID ?? ''),
      win_amount:         Number(body.winAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      jackpot_module:     String(body.jackpotModule ?? 'JACKPOT'),
      raw_payload:        this.raw(body),
    };
  }

  parseFundRequestRequest(body: Record<string, unknown>): FundRequestRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           null,
      request_amount:     Number(body.requestAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      raw_payload:        this.raw(body),
    };
  }

  parseFundReturnRequest(body: Record<string, unknown>): FundReturnRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           null,
      return_amount:      Number(body.returnAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      fund_request_reference_id: body.fundRequestReferenceID != null
        ? String(body.fundRequestReferenceID) : null,
      raw_payload:        this.raw(body),
    };
  }

  parseFundBetResultRequest(body: Record<string, unknown>): FundBetResultRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      net_amount:         Number(body.netAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      raw_payload:        this.raw(body),
    };
  }
}
```

- [ ] **Step 4: Run parser test**

```bash
cd erp && npx vitest run tests/megah5-parser.test.ts
```
Expected: all PASS

- [ ] **Step 5: Write failing formatter tests**

```typescript
// erp/tests/megah5-formatter.test.ts
import { describe, it, expect } from 'vitest';
import { MegaH5CallbackFormatter } from '@/lib/providers/adapters/megah5/MegaH5CallbackFormatter';
import { OPERATOR_ERROR } from '@/lib/providers/adapters/megah5/constants';

const fmt = new MegaH5CallbackFormatter();

describe('MegaH5CallbackFormatter', () => {
  it('formatAuthenticate success returns playerID and balance', () => {
    const res = fmt.formatAuthenticate({ player_id: '42', balance: 100.5, currency: 'MYR', error_code: OPERATOR_ERROR.OK });
    expect(res.error).toBe(0);
    expect(res.playerID).toBe(42);
    expect(res.balance).toBe(100.5);
  });

  it('formatAuthenticate error returns 0 playerID', () => {
    const res = fmt.formatAuthenticate({ player_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.AUTH_FAILED });
    expect(res.error).toBe(4);
    expect(res.playerID).toBe(0);
  });

  it('formatGetBalance returns error and balance', () => {
    const res = fmt.formatGetBalance({ balance: 55.55, currency: 'MYR', error_code: 0 });
    expect(res.error).toBe(0);
    expect(res.balance).toBe(55.55);
  });

  it('formatBet includes referenceID', () => {
    const res = fmt.formatBet({ transaction_id: 'txn123', balance: 90, currency: 'MYR', error_code: 0 });
    expect(res.referenceID).toBe('txn123');
    expect(res.balance).toBe(90);
  });

  it('formatFundBetResult always returns error 0', () => {
    const res = fmt.formatFundBetResult({ transaction_id: '', balance: 0, currency: 'MYR', error_code: 0 });
    expect(res.error).toBe(0);
    expect(res.balance).toBeUndefined();
  });

  it('rounds balance to 2 decimal places', () => {
    const res = fmt.formatGetBalance({ balance: 10.123456, currency: 'MYR', error_code: 0 });
    expect(res.balance).toBe(10.12);
  });
});
```

- [ ] **Step 6: Run failing formatter test**

```bash
cd erp && npx vitest run tests/megah5-formatter.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 7: Implement MegaH5CallbackFormatter.ts**

```typescript
// erp/src/lib/providers/adapters/megah5/MegaH5CallbackFormatter.ts
import { OPERATOR_ERROR } from './constants';
import type {
  AuthenticateResponse, GetBalanceResponse, BetResponse, BetResultResponse,
  RefundResponse, JackpotWinResponse, FundRequestResponse, FundReturnResponse,
  FundBetResultResponse,
} from '../../types/wallet.types';

/**
 * MegaH5CallbackFormatter — serializes normalized wallet responses back into
 * the JSON shapes that MEGAH5 expects from the OPERATOR.
 *
 * Response field conventions (same as 918KISS):
 *   error       — integer error code (0 = success)
 *   balance     — current player balance (2 decimal places)
 *   playerID    — only in Authenticate response
 *   referenceID — only in Bet/BetResult/Refund/JackpotWin/FundRequest/FundReturn
 */
export class MegaH5CallbackFormatter {
  formatAuthenticate(res: AuthenticateResponse): Record<string, unknown> {
    return {
      error:    res.error_code,
      playerID: res.error_code === OPERATOR_ERROR.OK ? Number(res.player_id) : 0,
      balance:  this.round(res.balance),
    };
  }

  formatGetBalance(res: GetBalanceResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance) };
  }

  formatBet(res: BetResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  formatBetResult(res: BetResultResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  formatRefund(res: RefundResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  formatJackpotWin(res: JackpotWinResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  formatFundRequest(res: FundRequestResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  formatFundReturn(res: FundReturnResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  /** FundBetResult is informational — OPERATOR must NOT modify wallet. */
  formatFundBetResult(_res: FundBetResultResponse): Record<string, unknown> {
    return { error: OPERATOR_ERROR.OK };
  }

  private round(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
```

- [ ] **Step 8: Run formatter test**

```bash
cd erp && npx vitest run tests/megah5-formatter.test.ts
```
Expected: all PASS

- [ ] **Step 9: Run full suite**

```bash
cd erp && npx vitest run
```
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add erp/src/lib/providers/adapters/megah5/MegaH5CallbackParser.ts \
        erp/src/lib/providers/adapters/megah5/MegaH5CallbackFormatter.ts \
        erp/tests/megah5-parser.test.ts \
        erp/tests/megah5-formatter.test.ts
git commit -m "feat(megah5): add callback parser and formatter"
```

---

### Task 5: Core Adapter + AdapterFactory + Launch Route Fix

This task wires everything together. After this task, the website error "Adapter for MEGAH5 not yet implemented" goes away and players can launch games.

**Files:**
- Create: `erp/src/lib/providers/adapters/megah5/MegaH5Adapter.ts`
- Modify: `erp/src/lib/providers/adapters/AdapterFactory.ts` — add MEGAH5 case
- Modify: `erp/src/app/api/games/launch/route.ts` — add brand-aware routing for MEGAH5
- Modify: `erp/src/lib/providers/index.ts` — export MegaH5Adapter + types
- Create: `erp/tests/megah5-adapter-factory.test.ts`
- Create: `erp/tests/megah5-launch-route.test.ts`

**Interfaces:**
- Consumes: all Tasks 1-4, `BaseProviderAdapter`, `IGameProvider`, `MasterWalletEngine`, `EventLogger`, `IProviderRepository`, `createGamingPlatform` from `@/lib/providers`
- Produces: `MegaH5Adapter` registered in `AdapterFactory` + launch route uses `BrandProviderManager`

- [ ] **Step 1: Write failing adapter factory test**

```typescript
// erp/tests/megah5-adapter-factory.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('@/lib/providers/core/MasterWalletEngine', () => ({
  MasterWalletEngine: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@/lib/providers/core/EventLogger', () => ({
  EventLogger: vi.fn().mockImplementation(() => ({})),
}));

import { createAdapter } from '@/lib/providers/adapters/AdapterFactory';

const mockDeps = {
  wallet: {} as never,
  eventLogger: {} as never,
  providerRepo: {} as never,
};

const MEGAH5_CREDS = {
  api_token: 'tok', operator_token: 'optok',
  secret_key: 'sec', encrypt_key: 'enc12345', md5_key: 'md5k',
};
const MEGAH5_CFG = {
  api_base_url: 'https://api.test', h5_api_domain: 'https://h5.test',
  h5_lobby_domain: 'https://lobby.test', h5_game_domain: 'https://game.test',
  postfix_id: 'tst', currency: 'MYR', timeout_ms: '10000',
};

describe('AdapterFactory — MEGAH5', () => {
  it('creates MegaH5Adapter for MEGAH5 code', () => {
    const adapter = createAdapter('MEGAH5', MEGAH5_CREDS, MEGAH5_CFG, mockDeps);
    expect(adapter.code).toBe('MEGAH5');
    expect(adapter.walletType).toBe('SEAMLESS');
  });

  it('creates MegaH5Adapter for megah5 (lowercase)', () => {
    const adapter = createAdapter('megah5', MEGAH5_CREDS, MEGAH5_CFG, mockDeps);
    expect(adapter.code).toBe('MEGAH5');
  });

  it('throws for unknown provider', () => {
    expect(() => createAdapter('UNKNOWN_XYZ', {}, {}, mockDeps)).toThrow(
      /no adapter implementation for provider code "UNKNOWN_XYZ"/i,
    );
  });

  it('MEGAH5 adapter declares SEAMLESS_WALLET capability', () => {
    const adapter = createAdapter('MEGAH5', MEGAH5_CREDS, MEGAH5_CFG, mockDeps);
    const caps = adapter.getCapabilities();
    expect(caps).toContain('SEAMLESS_WALLET');
  });

  it('MEGAH5 adapter declares LOBBY capability', () => {
    const adapter = createAdapter('MEGAH5', MEGAH5_CREDS, MEGAH5_CFG, mockDeps);
    expect(adapter.getCapabilities()).toContain('LOBBY');
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd erp && npx vitest run tests/megah5-adapter-factory.test.ts
```
Expected: FAIL — adapter throws "no adapter implementation for MEGAH5"

- [ ] **Step 3: Implement MegaH5Adapter.ts**

```typescript
// erp/src/lib/providers/adapters/megah5/MegaH5Adapter.ts
import { BaseProviderAdapter, ProviderError } from '../base/BaseProviderAdapter';
import { PROVIDER_CAPABILITY } from '../../types/capability.types';
import { MEGAH5_CODE, MEGAH5_NAME, MEGAH5_LANGUAGE, OPERATOR_ERROR } from './constants';
import { MegaH5ApiClient } from './MegaH5ApiClient';
import { MegaH5CallbackParser } from './MegaH5CallbackParser';
import { MegaH5CallbackFormatter } from './MegaH5CallbackFormatter';
import type { MegaH5Credentials, MegaH5Config } from './types';
import type { IProviderRepository } from '../../interfaces/IProviderRepository';
import type { MasterWalletEngine } from '../../core/MasterWalletEngine';
import type { EventLogger } from '../../core/EventLogger';
import type { ProviderCapability } from '../../types/capability.types';
import type { GameListResult, GameSyncResult, LaunchParams, LaunchResult } from '../../types/game.types';
import type { HealthCheckResult } from '../../types/health.types';
import type {
  AuthenticateRequest, AuthenticateResponse, BetRequest, BetResponse,
  BetResultRequest, BetResultResponse, FundBetResultRequest, FundBetResultResponse,
  FundRequestRequest, FundRequestResponse, FundReturnRequest, FundReturnResponse,
  GetBalanceRequest, GetBalanceResponse, JackpotWinRequest, JackpotWinResponse,
  RefundRequest, RefundResponse,
} from '../../types/wallet.types';
import type {
  CreatePlayerParams, CreatePlayerResult, UpdatePlayerParams,
  LoginTokenParams, GameListParams,
} from '../../interfaces/IGameProvider';

export class MegaH5Adapter extends BaseProviderAdapter {
  readonly code       = MEGAH5_CODE;
  readonly name       = MEGAH5_NAME;
  readonly walletType = 'SEAMLESS' as const;

  private readonly api:       MegaH5ApiClient;
  private readonly parser:    MegaH5CallbackParser;
  private readonly formatter: MegaH5CallbackFormatter;
  private readonly currency:  string;

  private providerId: number | null = null;

  constructor(
    private readonly creds:        MegaH5Credentials,
    private readonly cfg:          MegaH5Config,
    private readonly wallet:       MasterWalletEngine,
    private readonly eventLogger:  EventLogger,
    private readonly providerRepo: IProviderRepository,
  ) {
    super();
    this.currency  = cfg.currency ?? 'MYR';
    this.api       = new MegaH5ApiClient(creds, cfg);
    this.parser    = new MegaH5CallbackParser();
    this.formatter = new MegaH5CallbackFormatter();
  }

  // ── Capabilities ─────────────────────────────────────────────────────────────

  getCapabilities(): ProviderCapability[] {
    return [
      PROVIDER_CAPABILITY.SEAMLESS_WALLET,
      PROVIDER_CAPABILITY.LOBBY,
      PROVIDER_CAPABILITY.GAME_SYNC,
    ];
  }

  // ── Player Lifecycle ─────────────────────────────────────────────────────────

  async createPlayer(params: CreatePlayerParams): Promise<CreatePlayerResult> {
    const res = await this.api.createPlayer(
      params.account_id,
      params.nickname,
      params.currency ?? this.currency,
    );
    return { provider_player_id: String(res.playerID), account_id: params.account_id };
  }

  async updatePlayer(_params: UpdatePlayerParams): Promise<void> {
    // MEGAH5 does not expose a separate update-player API; no-op.
  }

  async getPlayerID(accountID: string): Promise<string> {
    const res = await this.api.checkPlayer(accountID);
    return String(res.playerID);
  }

  async logout(_providerPlayerID: string, _currency: string): Promise<void> {
    // MEGAH5 sessions expire automatically; no explicit logout API required.
  }

  // ── Game Launch ──────────────────────────────────────────────────────────────

  async getLoginToken(params: LoginTokenParams): Promise<string> {
    const { actk } = await this.api.h5Login({
      accountId: params.account_id,
      currency:  params.currency ?? this.currency,
      nickname:  params.nickname ?? params.account_id,
      language:  MEGAH5_LANGUAGE.ZH,
      lobbyUrl:  '',
    });
    return actk;
  }

  getLobbyURL(token: string, language: number, lobbyReturnUrl: string): string {
    const base = this.cfg.h5_lobby_domain.replace(/\/$/, '');
    const qs   = new URLSearchParams({
      token:    token,
      language: String(language),
      returnUrl: lobbyReturnUrl,
    }).toString();
    return `${base}/lobby?${qs}`;
  }

  getGameURL(token: string, gameCode: string, language: number, lobbyReturnUrl: string): string {
    const base = this.cfg.h5_game_domain.replace(/\/$/, '');
    const qs   = new URLSearchParams({
      token:    token,
      gameCode,
      language: String(language),
      returnUrl: lobbyReturnUrl,
    }).toString();
    return `${base}/game?${qs}`;
  }

  async launch(params: LaunchParams): Promise<LaunchResult> {
    const playerRecord = await this.providerRepo.findPlayer(params.provider_id, params.user_id);
    if (!playerRecord) {
      throw new ProviderError(this.code, OPERATOR_ERROR.PLAYER_NOT_FOUND, 'Player not registered.');
    }

    const { actk } = await this.api.h5Login({
      accountId: playerRecord.provider_account_id,
      currency:  playerRecord.currency ?? this.currency,
      nickname:  playerRecord.provider_account_id,
      language:  params.language ?? MEGAH5_LANGUAGE.ZH,
      lobbyUrl:  params.lobby_return_url,
    });

    const launchUrl = params.game_code
      ? this.getGameURL(actk, params.game_code, params.language ?? MEGAH5_LANGUAGE.ZH, params.lobby_return_url)
      : this.getLobbyURL(actk, params.language ?? MEGAH5_LANGUAGE.ZH, params.lobby_return_url);

    return { launch_url: launchUrl, session_token: actk, session_id: 0 };
  }

  // ── Game Catalog ─────────────────────────────────────────────────────────────

  async getGameList(_params?: GameListParams): Promise<GameListResult> {
    const games = await this.api.getGameList();
    return { games, total: games.length };
  }

  async syncGames(): Promise<GameSyncResult> {
    await this.api.getGameList();
    return {
      provider_code: this.code,
      inserted: 0, updated: 0, deactivated: 0,
      errors: [],
      synced_at: new Date().toISOString(),
    };
  }

  // ── Health Check ─────────────────────────────────────────────────────────────

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const { latencyMs } = await this.api.healthCheck();
      return this.healthOk(latencyMs);
    } catch (err) {
      return this.healthDown(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Callback Token Validation ─────────────────────────────────────────────────

  validateCallbackToken(token: string): boolean {
    return token === this.creds.operator_token;
  }

  // ── Async Callback Handlers ───────────────────────────────────────────────────

  async handleAuthenticateCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = this.extractUserIdFromAccountId(String(rawBody.userName ?? ''));
      const req = this.parser.parseAuthenticateRequest({
        ...rawBody,
        __resolved_user_id: userId != null ? String(userId) : undefined,
      });
      const res = await this.wallet.handleAuthenticate(req);
      return this.formatter.formatAuthenticate(res);
    } catch {
      return this.formatter.formatAuthenticate(this.systemErrorAuth());
    }
  }

  async handleGetBalanceCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseGetBalanceRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleGetBalance(req);
      return this.formatter.formatGetBalance(res);
    } catch {
      return this.formatter.formatGetBalance({ balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleBetCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseBetRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleBet(req);
      return this.formatter.formatBet(res);
    } catch {
      return this.formatter.formatBet({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleBetResultCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseBetResultRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleBetResult(req);
      return this.formatter.formatBetResult(res);
    } catch {
      return this.formatter.formatBetResult({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleRefundCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseRefundRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleRefund(req);
      return this.formatter.formatRefund(res);
    } catch {
      return this.formatter.formatRefund({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleJackpotWinCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseJackpotWinRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleJackpotWin(req);
      return this.formatter.formatJackpotWin(res);
    } catch {
      return this.formatter.formatJackpotWin({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleFundRequestCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseFundRequestRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleFundRequest(req);
      return this.formatter.formatFundRequest(res);
    } catch {
      return this.formatter.formatFundRequest({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleFundReturnCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    try {
      const userId = await this.resolveUserId(rawBody);
      const req = this.parser.parseFundReturnRequest({ ...rawBody, __resolved_user_id: userId });
      const res = await this.wallet.handleFundReturn(req);
      return this.formatter.formatFundReturn(res);
    } catch {
      return this.formatter.formatFundReturn({ transaction_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR });
    }
  }

  async handleFundBetResultCallback(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    _ip: string | null,
  ): Promise<Record<string, unknown>> {
    const tokenErr = this.checkToken(headers);
    if (tokenErr) return tokenErr;

    const res = this.formatter.formatFundBetResult({
      transaction_id: '', balance: 0, currency: 'MYR', error_code: 0,
    });
    return res;
  }

  // ── IGameProvider parse/format stubs (required by interface) ─────────────────

  parseAuthenticateRequest(body: Record<string, unknown>): AuthenticateRequest {
    return this.parser.parseAuthenticateRequest(body);
  }
  parseGetBalanceRequest(body: Record<string, unknown>): GetBalanceRequest {
    return this.parser.parseGetBalanceRequest(body);
  }
  parseBetRequest(body: Record<string, unknown>): BetRequest {
    return this.parser.parseBetRequest(body);
  }
  parseBetResultRequest(body: Record<string, unknown>): BetResultRequest {
    return this.parser.parseBetResultRequest(body);
  }
  parseRefundRequest(body: Record<string, unknown>): RefundRequest {
    return this.parser.parseRefundRequest(body);
  }
  parseJackpotWinRequest(body: Record<string, unknown>): JackpotWinRequest {
    return this.parser.parseJackpotWinRequest(body);
  }
  parseFundRequestRequest(body: Record<string, unknown>): FundRequestRequest {
    return this.parser.parseFundRequestRequest(body);
  }
  parseFundReturnRequest(body: Record<string, unknown>): FundReturnRequest {
    return this.parser.parseFundReturnRequest(body);
  }
  parseFundBetResultRequest(body: Record<string, unknown>): FundBetResultRequest {
    return this.parser.parseFundBetResultRequest(body);
  }

  formatAuthenticateResponse(res: AuthenticateResponse): Record<string, unknown> {
    return this.formatter.formatAuthenticate(res);
  }
  formatGetBalanceResponse(res: GetBalanceResponse): Record<string, unknown> {
    return this.formatter.formatGetBalance(res);
  }
  formatBetResponse(res: BetResponse): Record<string, unknown> {
    return this.formatter.formatBet(res);
  }
  formatBetResultResponse(res: BetResultResponse): Record<string, unknown> {
    return this.formatter.formatBetResult(res);
  }
  formatRefundResponse(res: RefundResponse): Record<string, unknown> {
    return this.formatter.formatRefund(res);
  }
  formatJackpotWinResponse(res: JackpotWinResponse): Record<string, unknown> {
    return this.formatter.formatJackpotWin(res);
  }
  formatFundRequestResponse(res: FundRequestResponse): Record<string, unknown> {
    return this.formatter.formatFundRequest(res);
  }
  formatFundReturnResponse(res: FundReturnResponse): Record<string, unknown> {
    return this.formatter.formatFundReturn(res);
  }
  formatFundBetResultResponse(res: FundBetResultResponse): Record<string, unknown> {
    return this.formatter.formatFundBetResult(res);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private checkToken(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, unknown> | null {
    const authHeader = headers['authorization'] ?? headers['x-operator-token'] ?? '';
    const token = typeof authHeader === 'string'
      ? authHeader.replace(/^Bearer\s+/i, '')
      : '';
    if (token !== this.creds.operator_token) {
      return { error: OPERATOR_ERROR.AUTH_FAILED };
    }
    return null;
  }

  private extractUserIdFromAccountId(accountId: string): number | null {
    // accountId format: "u{userId}@{postfix}" → extract userId
    const match = /^u(\d+)(?:@|$)/.exec(accountId);
    return match ? Number(match[1]) : null;
  }

  private async resolveUserId(body: Record<string, unknown>): Promise<string | undefined> {
    const accountId = String(body.userName ?? body.playerID ?? '');
    const userId = this.extractUserIdFromAccountId(accountId);
    if (userId != null) return String(userId);

    // Fallback: look up by provider_player_id
    const pid = body.playerID;
    if (pid != null) {
      const provId = await this.getProviderId();
      const { default: pool } = await import('@/lib/db');
      const { rows } = await pool.query<{ user_id: number }>(
        `SELECT user_id FROM gp_players WHERE provider_id=$1 AND provider_player_id=$2 LIMIT 1`,
        [provId, String(pid)],
      );
      if (rows[0]) return String(rows[0].user_id);
    }
    return undefined;
  }

  private async getProviderId(): Promise<number> {
    if (this.providerId) return this.providerId;
    const { default: pool } = await import('@/lib/db');
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM gp_providers WHERE code=$1 LIMIT 1`,
      [this.code],
    );
    this.providerId = rows[0]?.id ?? null;
    if (!this.providerId) throw new Error(`gp_providers row not found for code=${this.code}`);
    return this.providerId;
  }

  private systemErrorAuth(): AuthenticateResponse {
    return { player_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.SYSTEM_ERROR };
  }
}
```

- [ ] **Step 4: Add MEGAH5 case to AdapterFactory.ts**

In `erp/src/lib/providers/adapters/AdapterFactory.ts`, add after the KISS918 case and before the `default`:

```typescript
import { MegaH5Adapter } from './megah5/MegaH5Adapter';
import type { MegaH5Credentials, MegaH5Config } from './megah5/types';

// ... (in the switch statement, add after KISS918 case):

    case 'MEGAH5': {
      const creds: MegaH5Credentials = {
        api_token:      credentials['api_token']      ?? '',
        operator_token: credentials['operator_token'] ?? '',
        secret_key:     credentials['secret_key']     ?? '',
        encrypt_key:    credentials['encrypt_key']    ?? '',
        md5_key:        credentials['md5_key']        ?? '',
      };
      const cfg: MegaH5Config = {
        api_base_url:    config['api_base_url']    ?? '',
        h5_api_domain:   config['h5_api_domain']   ?? '',
        h5_lobby_domain: config['h5_lobby_domain'] ?? '',
        h5_game_domain:  config['h5_game_domain']  ?? '',
        postfix_id:      config['postfix_id']       ?? '',
        currency:        config['currency']         ?? 'MYR',
        timeout_ms:      parseIntSafe(config['timeout_ms'], 10_000),
        datafeed_url:    config['datafeed_url']     || undefined,
        debug:
          config['debug'] === 'true' ||
          process.env.ENABLE_PROVIDER_DEBUG === 'true',
      };
      return new MegaH5Adapter(
        creds, cfg, deps.wallet, deps.eventLogger, deps.providerRepo,
      );
    }
```

- [ ] **Step 5: Update launch route to support MEGAH5 via BrandProviderManager**

In `erp/src/app/api/games/launch/route.ts`, replace the hardcoded 918KISS check block (lines 70-81 approximately):

```typescript
// Old (lines ~70-82):
  if (upperCode !== '918KISS') {
    return NextResponse.json({ error: `Adapter for "${upperCode}" not yet implemented` }, { status: 422 });
  }

  const adapter = await getKiss918Adapter();
  if (!adapter) {
    return NextResponse.json(
      { error: 'Gaming adapter not initialized. Check provider status and credentials.' },
      { status: 503 },
    );
  }
```

Replace with:

```typescript
  // ── 3. Get adapter (brand-aware for non-918KISS providers) ───────────────────
  let adapter: import('@/lib/providers').IGameProvider;

  if (upperCode === '918KISS') {
    // 918KISS: legacy singleton — reads from gp_credentials (unchanged)
    const { getKiss918Adapter } = await import('@/lib/gaming');
    const k918 = await getKiss918Adapter();
    if (!k918) {
      return NextResponse.json(
        { error: 'Gaming adapter not initialized. Check provider status and credentials.' },
        { status: 503 },
      );
    }
    adapter = k918;
  } else {
    // All other providers: brand-aware, reads from brand_provider_credentials
    const { createGamingPlatform } = await import('@/lib/providers');

    // Find which brand has this provider enabled
    const { rows: bpRows } = await pool.query<{ brand_code: string }>(
      `SELECT b.code AS brand_code
       FROM brand_providers bp
       JOIN brands b        ON b.id = bp.brand_id
       JOIN gp_providers p  ON p.id = bp.provider_id
       WHERE p.code = $1 AND bp.status = 'ACTIVE'
       LIMIT 1`,
      [upperCode],
    );
    if (!bpRows[0]) {
      return NextResponse.json(
        { error: `Provider "${upperCode}" has no active brand configuration. Enable it in Brand Center.` },
        { status: 503 },
      );
    }

    try {
      const platform = createGamingPlatform();
      adapter = await platform.brandManager.getAdapter(bpRows[0].brand_code, upperCode);
    } catch (err) {
      console.error(`[games/launch] BrandProviderManager.getAdapter failed for ${upperCode}:`, err);
      return NextResponse.json(
        { error: `Adapter for "${upperCode}" could not be initialized. Check credentials in Brand Center.` },
        { status: 503 },
      );
    }
  }
```

- [ ] **Step 6: Export MegaH5Adapter from providers/index.ts**

Append to the 918KISS Adapter section in `erp/src/lib/providers/index.ts`:

```typescript
// ── MegaH5 Adapter ────────────────────────────────────────────────────────────

export { MegaH5Adapter } from './adapters/megah5/MegaH5Adapter';
export type { MegaH5Credentials, MegaH5Config } from './adapters/megah5/types';
```

- [ ] **Step 7: Write failing launch route test**

```typescript
// erp/tests/megah5-launch-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock DB
const mockQuery = vi.fn();
vi.mock('@/lib/db', () => ({ default: { query: mockQuery } }));

// Mock BrandProviderManager
const mockGetAdapter = vi.fn();
const mockBrandManager = { getAdapter: mockGetAdapter };
vi.mock('@/lib/providers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/providers')>('@/lib/providers');
  return {
    ...actual,
    createGamingPlatform: () => ({ brandManager: mockBrandManager }),
  };
});

// Mock 918KISS legacy path
vi.mock('@/lib/gaming', () => ({
  getKiss918Adapter: vi.fn().mockResolvedValue(null),
}));

import { POST } from '@/app/api/games/launch/route';

const SERVICE_SECRET = 'test-secret';
process.env.REVALIDATE_SECRET = SERVICE_SECRET;

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/games/launch', {
    method: 'POST',
    body:   JSON.stringify(body),
    headers: {
      'Content-Type':     'application/json',
      'X-Service-Secret': SERVICE_SECRET,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/games/launch — MEGAH5', () => {
  it('returns 503 if no active brand-provider config', async () => {
    // provider exists and is ACTIVE
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 2, code: 'MEGAH5', display_name: 'Mega888H5', status: 'ACTIVE', website_launch_mode: 'LOBBY' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, first_name: 'Tester', phone: null }] })
      .mockResolvedValueOnce({ rows: [] }) // no brand-provider row
      ;

    const res  = await POST(makeReq({ user_id: 10, provider_code: 'MEGAH5' }));
    const data = await res.json() as { error: string };
    expect(res.status).toBe(503);
    expect(data.error).toMatch(/no active brand configuration/i);
  });

  it('returns 422 for unknown provider code', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // provider not found
    const res = await POST(makeReq({ user_id: 1, provider_code: 'FAKE_PROVIDER' }));
    expect(res.status).toBe(404);
  });

  it('returns 403 without service secret', async () => {
    const req = new NextRequest('http://localhost/api/games/launch', {
      method: 'POST',
      body:   JSON.stringify({ user_id: 1, provider_code: 'MEGAH5' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 8: Run tests**

```bash
cd erp && npx vitest run tests/megah5-adapter-factory.test.ts tests/megah5-launch-route.test.ts
```
Expected: all PASS

- [ ] **Step 9: Type check**

```bash
cd erp && npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0 errors"
```

- [ ] **Step 10: Run full suite**

```bash
cd erp && npx vitest run
```
Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add erp/src/lib/providers/adapters/megah5/MegaH5Adapter.ts \
        erp/src/lib/providers/adapters/AdapterFactory.ts \
        erp/src/app/api/games/launch/route.ts \
        erp/src/lib/providers/index.ts \
        erp/tests/megah5-adapter-factory.test.ts \
        erp/tests/megah5-launch-route.test.ts
git commit -m "feat(megah5): register adapter in factory + fix launch route for brand-aware providers"
```

---

### Task 6: Callback Route

Create the MEGAH5 callback route at `/api/games/megah5/callback/[action]`. Mirrors the 918KISS callback route structure but uses BrandProviderManager.

**Files:**
- Create: `erp/src/app/api/games/megah5/callback/[action]/route.ts`
- Create: `erp/tests/megah5-callback-route.test.ts`

**Interfaces:**
- Consumes: `MegaH5Adapter.handleXxxCallback()` (Task 5), `createGamingPlatform().brandManager`
- Produces: `POST /api/games/megah5/callback/:action` responds with provider JSON

- [ ] **Step 1: Write failing callback route test**

```typescript
// erp/tests/megah5-callback-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetAdapter = vi.fn();
vi.mock('@/lib/providers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/providers')>('@/lib/providers');
  return {
    ...actual,
    createGamingPlatform: () => ({
      brandManager: { getAdapter: mockGetAdapter },
    }),
  };
});

const mockQuery = vi.fn();
vi.mock('@/lib/db', () => ({ default: { query: mockQuery } }));

import { POST } from '@/app/api/games/megah5/callback/[action]/route';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(action: string, body: object, headers?: Record<string, string>) {
  return new NextRequest(`http://localhost/api/games/megah5/callback/${action}`, {
    method: 'POST',
    body:   JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('POST /api/games/megah5/callback/[action]', () => {
  it('returns 200 JSON when adapter not available (maintenance mode)', async () => {
    // brand_providers lookup returns no active row → adapter not available
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res  = await POST(makeReq('authenticate', {}), { params: Promise.resolve({ action: 'authenticate' }) });
    const data = await res.json() as { error: number };
    expect(res.status).toBe(200);
    expect(data.error).toBe(8); // MAINTENANCE
  });

  it('returns 200 for unknown action', async () => {
    // Supply a mock adapter (action not in switch → returns error)
    mockQuery.mockResolvedValueOnce({ rows: [{ brand_code: 'TESLA88' }] });
    mockGetAdapter.mockResolvedValueOnce({
      handleAuthenticateCallback: vi.fn().mockResolvedValue({ error: 0 }),
    });

    const res = await POST(makeReq('unknown_action', {}), { params: Promise.resolve({ action: 'unknown_action' }) });
    const data = await res.json() as { error: number };
    expect(res.status).toBe(200);
    expect(data.error).toBe(9); // SYSTEM_ERROR for unknown action
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
cd erp && npx vitest run tests/megah5-callback-route.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement the callback route**

```typescript
// erp/src/app/api/games/megah5/callback/[action]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createGamingPlatform } from '@/lib/providers';
import { OPERATOR_ERROR } from '@/lib/providers/adapters/megah5/constants';
import pool from '@/lib/db';
import type { MegaH5Adapter } from '@/lib/providers/adapters/megah5/MegaH5Adapter';

type Params = { params: Promise<{ action: string }> };

type Handler = (
  rawBody: Record<string, unknown>,
  headers: Record<string, string | undefined>,
  ip:      string | null,
) => Promise<Record<string, unknown>>;

function resolveHandler(adapter: MegaH5Adapter, action: string): Handler | null {
  switch (action.toLowerCase()) {
    case 'authenticate':  return adapter.handleAuthenticateCallback.bind(adapter);
    case 'getbalance':    return adapter.handleGetBalanceCallback.bind(adapter);
    case 'bet':           return adapter.handleBetCallback.bind(adapter);
    case 'betresult':     return adapter.handleBetResultCallback.bind(adapter);
    case 'refund':        return adapter.handleRefundCallback.bind(adapter);
    case 'jackpotwin':    return adapter.handleJackpotWinCallback.bind(adapter);
    case 'fundrequest':   return adapter.handleFundRequestCallback.bind(adapter);
    case 'fundreturn':    return adapter.handleFundReturnCallback.bind(adapter);
    case 'fundbetresult': return adapter.handleFundBetResultCallback.bind(adapter);
    default: return null;
  }
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { action } = await params;

  console.log(`[megah5-callback] action=${action} method=${request.method}`);

  // Parse body
  let rawBody: Record<string, unknown>;
  try {
    rawBody = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: OPERATOR_ERROR.SYSTEM_ERROR });
  }

  // Find active brand for MEGAH5
  const { rows: bpRows } = await pool.query<{ brand_code: string }>(
    `SELECT b.code AS brand_code
     FROM brand_providers bp
     JOIN brands b       ON b.id = bp.brand_id
     JOIN gp_providers p ON p.id = bp.provider_id
     WHERE p.code = 'MEGAH5' AND bp.status = 'ACTIVE'
     LIMIT 1`,
  );

  if (!bpRows[0]) {
    return NextResponse.json({ error: OPERATOR_ERROR.MAINTENANCE });
  }

  // Get adapter from BrandProviderManager
  let adapter: MegaH5Adapter;
  try {
    const platform = createGamingPlatform();
    adapter = await platform.brandManager.getAdapter(bpRows[0].brand_code, 'MEGAH5') as MegaH5Adapter;
  } catch {
    return NextResponse.json({ error: OPERATOR_ERROR.MAINTENANCE });
  }

  // Resolve handler
  const handler = resolveHandler(adapter, action);
  if (!handler) {
    console.warn(`[megah5-callback] unknown action "${action}"`);
    return NextResponse.json({ error: OPERATOR_ERROR.SYSTEM_ERROR });
  }

  // Build headers map
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((v, k) => { headers[k] = v; });

  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null;

  try {
    const result = await handler(rawBody, headers, ip);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[megah5-callback] handler threw for action="${action}":`, err);
    return NextResponse.json({ error: OPERATOR_ERROR.SYSTEM_ERROR });
  }
}
```

- [ ] **Step 4: Run callback route test**

```bash
cd erp && npx vitest run tests/megah5-callback-route.test.ts
```
Expected: all PASS

- [ ] **Step 5: Run full suite**

```bash
cd erp && npx vitest run
```
Expected: all PASS (0 failures)

- [ ] **Step 6: Type check**

```bash
cd erp && npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0 errors"
```

- [ ] **Step 7: Commit**

```bash
git add erp/src/app/api/games/megah5/callback/[action]/route.ts \
        erp/tests/megah5-callback-route.test.ts
git commit -m "feat(megah5): add callback route POST /api/games/megah5/callback/:action"
```

---

### Task 7: End-to-End Validation

Validate the complete integration works correctly: build succeeds, tests pass, type check clean.

**Files:**
- No new files — validation only

- [ ] **Step 1: Run full test suite**

```bash
cd erp && npx vitest run
```
Expected: all tests pass, 0 failures

- [ ] **Step 2: TypeScript type check**

```bash
cd erp && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Verify MEGAH5 appears in AdapterFactory**

```bash
grep -n "MEGAH5" erp/src/lib/providers/adapters/AdapterFactory.ts
```
Expected: shows `case 'MEGAH5':` line

- [ ] **Step 4: Verify launch route no longer hardcodes 918KISS only**

```bash
grep -n "not yet implemented" erp/src/app/api/games/launch/route.ts
```
Expected: no output (the hardcoded error is removed)

- [ ] **Step 5: Verify callback route is registered**

```bash
ls erp/src/app/api/games/megah5/callback/\[action\]/route.ts
```
Expected: file exists

- [ ] **Step 6: Final commit (if any cleanup needed)**

```bash
cd erp && npx vitest run && npx tsc --noEmit
git add -A
git commit -m "feat(megah5): Phase B complete — MegaH5 adapter registered and launchable"
```

---

## Acceptance Criteria

1. `npx vitest run` passes with 0 failures (all existing + new megah5 tests)
2. `npx tsc --noEmit` reports 0 new errors
3. `AdapterFactory.createAdapter('MEGAH5', creds, cfg, deps)` returns a `MegaH5Adapter`
4. `POST /api/games/launch` with `{ provider_code: 'MEGAH5', user_id: N }` no longer returns "Adapter for MEGAH5 not yet implemented"
5. `POST /api/games/megah5/callback/authenticate` returns HTTP 200 with `{ error: number }` JSON
6. `MegaH5Adapter.getCapabilities()` includes `SEAMLESS_WALLET` and `LOBBY`
7. 918KISS adapter and all existing tests are untouched (git diff confirms no Kiss918* files modified)
8. No imports from `gp_credentials` or `gp_config` in the new megah5/ adapter files

---

## Important Notes for Implementer

**Credential key names**: The MEGAH5 credentials in `brand_provider_credentials` use these exact keys: `api_token`, `operator_token`, `secret_key`, `encrypt_key`, `md5_key` — same as 918KISS.

**Config key names**: `api_base_url`, `h5_api_domain`, `h5_lobby_domain`, `h5_game_domain`, `postfix_id`, `currency`, `timeout_ms`, `datafeed_url`.

**API protocol assumptions**: The MEGAH5 H5 API uses the same DES-CBC + MD5 signing as 918KISS. If the actual MEGAH5 API spec uses a different algorithm or field names, update only `MegaH5Crypto.buildLoginPayload()` and `MegaH5ApiClient.h5Login()`. No other files need to change.

**Callback operator token**: MEGAH5 sends the operator token in the `Authorization: Bearer {token}` header. If it uses a different header name, update `MegaH5Adapter.checkToken()` only.

**Lobby/Game URL format**: The URL format in `getLobbyURL()` and `getGameURL()` is assumed from common Mega888H5 conventions. Verify with actual MEGAH5 integration documentation and update `MegaH5Adapter.getLobbyURL/getGameURL()` if different.

**Health check endpoint**: `API_PATH.HEALTH = '/operator/v2/HealthCheck'` is assumed. If MEGAH5 doesn't have this endpoint, implement `healthCheck()` as a lightweight GET to `h5_api_domain` instead. Update only `MegaH5ApiClient.healthCheck()`.

**MasterWalletEngine methods**: The adapter calls `wallet.handleJackpotWin()`, `wallet.handleFundRequest()`, `wallet.handleFundReturn()`, `wallet.handleFundBetResult()`. Verify these method names exist on `MasterWalletEngine` before Task 5. If they're named differently, update the adapter's handle* methods.
