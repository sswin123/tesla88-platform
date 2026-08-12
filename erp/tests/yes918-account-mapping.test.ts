/**
 * YES918 Account Mapping — regression tests
 *
 * TEST 1: confirm-play reads canonical loginId from provider_accounts
 *         (not from gp_players.provider_player_id which can be stale)
 * TEST 2: Yes918Adapter auto-create path syncs gp_players.provider_player_id
 * TEST 3: Yes918Adapter existing-account path does NOT mutate gp_players
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { LaunchParams }         from '@/lib/providers/types/game.types';
import type { CreatePlayerParams }   from '@/lib/providers/interfaces/IGameProvider';

// ── Module mocks (hoisted by vitest before imports) ────────────────────────

vi.mock('@/lib/db', () => ({
  default: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('@/lib/providers/core/ProviderRuntimeBuilder', () => ({
  ProviderRuntimeBuilder: { build: vi.fn() },
}));

vi.mock('@/lib/providers', async () => ({
  createGamingPlatform: () => ({
    security:    { decrypt: vi.fn() },
    wallet:      {},
    eventLogger: {},
  }),
  ProviderRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@/lib/services/wallet', () => ({
  adjustWallet: vi.fn().mockResolvedValue({
    id: '99', balance_before: '100.00', balance_after: '0.00',
  }),
}));

vi.mock('@/lib/providers/repositories/TransactionRepository', () => ({
  TransactionRepository: vi.fn().mockImplementation(() => ({
    findByReferenceId: vi.fn().mockResolvedValue([]),
    create:            vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('@/lib/services/gaming-activity', () => ({
  GamingActivityService: { record: vi.fn().mockResolvedValue(undefined) },
}));

const mockRandomUserName = vi.fn();
const mockAddUser        = vi.fn();
vi.mock('@/lib/providers/adapters/yes918/Yes918ApiClient', () => ({
  Yes918ApiClient: vi.fn().mockImplementation(() => ({
    randomUserName: mockRandomUserName,
    addUser:        mockAddUser,
    getUserInfo:    vi.fn().mockResolvedValue(null),
    setServerScore: vi.fn().mockResolvedValue(0),
  })),
}));

// ── Imports (resolved against mocked modules) ──────────────────────────────

import pool                        from '@/lib/db';
import { ProviderRuntimeBuilder }  from '@/lib/providers/core/ProviderRuntimeBuilder';
import { POST }                    from '@/app/api/games/confirm-play/route';
import { Yes918Adapter }           from '@/lib/providers/adapters/yes918/Yes918Adapter';

process.env.REVALIDATE_SECRET = 'svc-test-secret';

// ── Shared helpers ─────────────────────────────────────────────────────────

function makeConfirmReq(body: object) {
  return new NextRequest('http://localhost/api/games/confirm-play', {
    method: 'POST',
    body:   JSON.stringify(body),
    headers: {
      'Content-Type':     'application/json',
      'x-service-secret': 'svc-test-secret',
    },
  });
}

function makeMockAdapter() {
  const autoWithdrawAll = vi.fn().mockResolvedValue(0);
  const topUp           = vi.fn().mockResolvedValue({ balance: 0 });
  return { autoWithdrawAll, topUp };
}

function setupRuntime(adapter: ReturnType<typeof makeMockAdapter>) {
  vi.mocked(ProviderRuntimeBuilder.build).mockResolvedValue({
    found: true, adapterBuilt: true,
    adapter: adapter as never,
    gpProviderId: 5, bpWalletType: 'TRANSFER',
  } as never);
}

function makeLockClient() {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })                      // BEGIN
      .mockResolvedValueOnce({ rows: [{ result: true }] })      // pg_try_advisory_xact_lock
      .mockResolvedValueOnce({ rows: [] }),                     // COMMIT
    release: vi.fn(),
  };
}

function makeDeductClient() {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })   // BEGIN
      .mockResolvedValueOnce({ rows: [] }),  // COMMIT
    release: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── TEST 1: confirm-play canonical loginId ─────────────────────────────────

describe('TEST 1 — confirm-play: loginId from provider_accounts', () => {
  const REF = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  // Shared pool.query setup: user + brand + gp_players are always the same.
  // 4th call varies per test.
  function setupBase(providerAccountsRow: object | null) {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 16 }] } as never)                          // user
      .mockResolvedValueOnce({ rows: [{ brand_code: 'T88' }] } as never)               // brand_providers
      .mockResolvedValueOnce({ rows: [{ id: 1, provider_account_id: 'pub-acc' }] } as never) // gp_players
      .mockResolvedValueOnce({
        rows: providerAccountsRow ? [providerAccountsRow] : [],
      } as never);                                                                      // provider_accounts
  }

  it('1a — returns 503 when provider_accounts is empty (loginId not found)', async () => {
    const adp = makeMockAdapter();
    setupRuntime(adp);
    setupBase(null); // provider_accounts has no row

    const res  = await POST(makeConfirmReq({ user_id: 16, provider_code: 'YES918', confirm_ref_id: REF }));
    const body = await res.json() as { error: string };

    expect(res.status).toBe(503);
    expect(body.error).toMatch(/not initialized/i);
    expect(adp.autoWithdrawAll).not.toHaveBeenCalled();
    expect(adp.topUp).not.toHaveBeenCalled();
  });

  it('1b — autoWithdrawAll receives provider_login_id (not stale gp_players value)', async () => {
    // OLD_ID is what gp_players.provider_player_id used to hold (stale).
    // NEW_ID is the canonical provider_accounts.provider_login_id.
    // After the fix, confirm-play must call autoWithdrawAll with NEW_ID.
    const NEW_ID = '01741885232';

    const adp = makeMockAdapter();
    setupRuntime(adp);
    vi.mocked(pool.connect).mockResolvedValueOnce(makeLockClient() as never);
    setupBase({ provider_login_id: NEW_ID });
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ available_balance: '0' }] } as never); // balance=0 → early exit

    await POST(makeConfirmReq({ user_id: 16, provider_code: 'YES918', confirm_ref_id: REF }));

    // autoWithdrawAll must use NEW_ID from provider_accounts
    expect(adp.autoWithdrawAll).toHaveBeenCalledWith(NEW_ID);
    // balance=0 means topUp is skipped — verifying autoWithdrawAll is the key assertion here
    expect(adp.topUp).not.toHaveBeenCalled();
  });

  it('1c — topUp receives provider_login_id when balance > 0', async () => {
    const NEW_ID = '01741885232';

    const adp = makeMockAdapter();
    setupRuntime(adp);
    vi.mocked(pool.connect)
      .mockResolvedValueOnce(makeLockClient() as never)
      .mockResolvedValueOnce(makeDeductClient() as never);
    setupBase({ provider_login_id: NEW_ID });
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ available_balance: '100.00' }] } as never); // balance>0

    await POST(makeConfirmReq({ user_id: 16, provider_code: 'YES918', confirm_ref_id: REF }));

    expect(adp.topUp).toHaveBeenCalledWith(
      expect.objectContaining({ provider_player_id: NEW_ID }),
    );
  });
});

// ─── TEST 2 & 3: Yes918Adapter upsertProviderAccount ───────────────────────

describe('TEST 2 & 3 — Yes918Adapter: upsertProviderAccount gp_players sync', () => {
  function makeAdapterInstance() {
    return new Yes918Adapter(
      { authcode: 'ac', secret_key: 'sk' },
      { api_base_url: 'http://test', agent_username: 'agent' },
      {} as never, {} as never, {} as never,
    );
  }

  it('TEST 2 — auto-create: upsertProviderAccount calls UPDATE gp_players', async () => {
    // createPlayer() does NOT call findProviderAccount first.
    // Flow: randomUserName → addUser → upsertProviderAccount (INSERT + UPDATE).
    // So exactly 2 pool.query calls are expected.
    const NEW_ID = 'newly-created-01';
    mockRandomUserName.mockResolvedValue(NEW_ID);
    mockAddUser.mockResolvedValue(undefined);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)   // INSERT INTO provider_accounts
      .mockResolvedValueOnce({ rows: [] } as never);  // UPDATE gp_players

    const adapter = makeAdapterInstance();
    await adapter.createPlayer({
      account_id: 'u16@t88', nickname: 'Tester', currency: 'MYR',
    } as CreatePlayerParams);

    const calls = vi.mocked(pool.query).mock.calls;

    // Exactly 2 pool.query calls: INSERT provider_accounts + UPDATE gp_players
    expect(calls).toHaveLength(2);

    // 2nd call must be UPDATE gp_players
    const gpSql    = calls[1][0] as string;
    const gpParams = calls[1][1] as unknown[];
    expect(gpSql).toContain('UPDATE gp_players');
    // param[0] = username (NEW_ID), param[2] = userId (16)
    expect(gpParams[0]).toBe(NEW_ID);
    expect(gpParams[2]).toBe(16);
  });

  it('TEST 3 — existing account: launch does NOT modify gp_players or provider_accounts', async () => {
    const EXISTING_ID = '01741885232';
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{
        id: 1, provider_code: 'YES918', user_id: 16,
        provider_login_id: EXISTING_ID, provider_password: 'pass123',
        provider_user_id: null, extra: {}, created_at: '', updated_at: '',
      }],
    } as never); // findProviderAccount → existing row

    const adapter = makeAdapterInstance();
    const result  = await adapter.launch({
      user_id: 16, provider_id: 0, game_code: null, language: 0, lobby_return_url: '',
    } as LaunchParams);

    // Only 1 pool.query call (findProviderAccount). No INSERT or UPDATE.
    const calls = vi.mocked(pool.query).mock.calls;
    expect(calls).toHaveLength(1);
    expect(result.provider_login_id).toBe(EXISTING_ID);

    const hasMutation = calls.some(([sql]) =>
      typeof sql === 'string' && (sql.includes('INSERT') || sql.includes('UPDATE')),
    );
    expect(hasMutation).toBe(false);
  });
});
