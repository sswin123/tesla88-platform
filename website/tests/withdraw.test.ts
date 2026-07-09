import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit:             vi.fn().mockReturnValue({ ok: true, retryAfterSecs: 0 }),
  getClientIp:           vi.fn().mockReturnValue('test-ip'),
  _resetRateLimitStore:  vi.fn(),
}));
vi.mock('@/lib/member-auth', () => ({
  getMember: vi.fn().mockResolvedValue({ sub: 7, phone: '0123456789', first_name: 'Ali' }),
}));

import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { GET as getWithdrawals, POST as postWithdrawal } from '@/app/api/member/withdrawals/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(body: unknown) {
  return new Request('http://localhost/', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/* Stubs for standard DB call sequence */
function stubUser(overrides?: Partial<{ bank_name: string; bank_account: string; bank_holder_name: string; net_deposit: string }>) {
  vi.mocked(pool.query).mockResolvedValueOnce({
    rows: [{
      bank_name: 'Maybank',
      bank_account: '12345678',
      bank_holder_name: 'Ali',
      net_deposit: '500.00',
      ...overrides,
    }],
  } as never);
}
function stubMinAmount(value = '30') {
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ value }] } as never);
}
function stubNoPending() {
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
}
function stubInsert(id = 55) {
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id }] } as never);
}

/* ── Auth protection ──────────────────────────────────────────── */

describe('提款 — 认证保护', () => {
  it('GET: 未登录返回 401', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await getWithdrawals();
    expect(res.status).toBe(401);
  });

  it('POST: 未登录返回 401', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await postWithdrawal(makeReq({ amount: 100 }) as never);
    expect(res.status).toBe(401);
  });
});

/* ── Input validation ─────────────────────────────────────────── */

describe('提款 — 字段校验', () => {
  it('缺少金额返回 400', async () => {
    const res = await postWithdrawal(makeReq({}) as never);
    expect(res.status).toBe(400);
  });

  it('金额为 0 返回 400', async () => {
    const res = await postWithdrawal(makeReq({ amount: 0 }) as never);
    expect(res.status).toBe(400);
  });
});

/* ── No bank account ──────────────────────────────────────────── */

describe('提款 — 银行账户验证', () => {
  it('未绑定银行卡返回 400', async () => {
    stubUser({ bank_account: '' });
    const res = await postWithdrawal(makeReq({ amount: 100 }) as never);
    expect(res.status).toBe(400);
    const d = await res.json() as { error: string };
    expect(d.error).toMatch(/银行/);
  });
});

/* ── Minimum amount ───────────────────────────────────────────── */

describe('提款 — 最低金额验证', () => {
  it('金额低于最低限额返回 400', async () => {
    stubUser();
    stubMinAmount('50');
    const res = await postWithdrawal(makeReq({ amount: 20 }) as never);
    expect(res.status).toBe(400);
    const d = await res.json() as { error: string };
    expect(d.error).toMatch(/50/);
  });

  it('金额等于最低限额时通过', async () => {
    stubUser();
    stubMinAmount('30');
    stubNoPending();
    stubInsert(10);
    const res = await postWithdrawal(makeReq({ amount: 30 }) as never);
    expect(res.status).toBe(201);
  });
});

/* ── Balance check ────────────────────────────────────────────── */

describe('提款 — 余额验证', () => {
  it('提款金额超过余额返回 400', async () => {
    stubUser({ net_deposit: '100.00' });
    stubMinAmount('30');
    const res = await postWithdrawal(makeReq({ amount: 200 }) as never);
    expect(res.status).toBe(400);
    const d = await res.json() as { error: string };
    expect(d.error).toMatch(/余额/);
  });

  it('金额等于余额时通过', async () => {
    stubUser({ net_deposit: '200.00' });
    stubMinAmount('30');
    stubNoPending();
    stubInsert(20);
    const res = await postWithdrawal(makeReq({ amount: 200 }) as never);
    expect(res.status).toBe(201);
  });
});

/* ── Duplicate pending prevention ────────────────────────────── */

describe('提款 — 重复挂单防护', () => {
  it('已有 PENDING 提款时返回 409', async () => {
    stubUser();
    stubMinAmount('30');
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 99 }] } as never);
    const res = await postWithdrawal(makeReq({ amount: 100 }) as never);
    expect(res.status).toBe(409);
    const d = await res.json() as { error: string; pending_id: number };
    expect(d.pending_id).toBe(99);
  });

  it('无 PENDING 提款时正常提交', async () => {
    stubUser();
    stubMinAmount('30');
    stubNoPending();
    stubInsert(77);
    const res = await postWithdrawal(makeReq({ amount: 100 }) as never);
    expect(res.status).toBe(201);
    const d = await res.json() as { id: number };
    expect(d.id).toBe(77);
  });
});

/* ── Successful withdraw ──────────────────────────────────────── */

describe('提款 — 正常提交', () => {
  it('返回 201 及流水号', async () => {
    stubUser();
    stubMinAmount('30');
    stubNoPending();
    stubInsert(42);
    const res = await postWithdrawal(makeReq({ amount: 150 }) as never);
    expect(res.status).toBe(201);
    const d = await res.json() as { ok: boolean; id: number };
    expect(d.ok).toBe(true);
    expect(d.id).toBe(42);
  });

  it('GET 返回提款历史数组', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, withdraw_amount: '100', status: 'PENDING' }],
    } as never);
    const res = await getWithdrawals();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
  });
});
