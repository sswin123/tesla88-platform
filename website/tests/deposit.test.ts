import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('@/lib/member-auth', () => ({
  getMember: vi.fn().mockResolvedValue({ sub: 5, phone: '0123456789', first_name: 'Lim' }),
}));

import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { POST as postDeposit, GET as getDeposits } from '@/app/api/member/deposits/route';
import { GET as getEligible } from '@/app/api/member/promotions/eligible/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(body: unknown) {
  return new Request('http://localhost/', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/* Helpers that stub the standard DB call sequence for a clean deposit */
function stubMinAmount(value = '30') {
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ value }] } as never);
}
function stubNoPending() {
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
}
function stubInsert(id = 99) {
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id }] } as never);
}

/* ── Auth protection ──────────────────────────────────────────── */

describe('存款 — 认证保护', () => {
  it('GET: 未登录返回 401', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await getDeposits();
    expect(res.status).toBe(401);
  });

  it('POST: 未登录返回 401', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await postDeposit(makeReq({ amount: 100, provider: 'Mega888', payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(401);
  });
});

/* ── Input validation ─────────────────────────────────────────── */

describe('存款 — 字段校验', () => {
  it('缺少金额返回 400', async () => {
    const res = await postDeposit(makeReq({ provider: 'Mega888', payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(400);
  });

  it('金额为 0 返回 400', async () => {
    const res = await postDeposit(makeReq({ amount: 0, provider: 'Mega888', payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(400);
  });

  it('缺少游戏返回 400', async () => {
    const res = await postDeposit(makeReq({ amount: 100, payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(400);
  });

  it('无效游戏名返回 400', async () => {
    const res = await postDeposit(makeReq({ amount: 100, provider: 'INVALID', payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(400);
  });

  it('缺少付款方式返回 400', async () => {
    const res = await postDeposit(makeReq({ amount: 100, provider: 'Mega888' }) as never);
    expect(res.status).toBe(400);
  });
});

/* ── Minimum deposit amount ───────────────────────────────────── */

describe('存款 — 最低金额验证', () => {
  it('金额低于最低限额返回 400', async () => {
    stubMinAmount('50'); /* min = 50 */
    const res = await postDeposit(makeReq({ amount: 30, provider: 'Mega888', payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(400);
    const d = await res.json() as { error: string };
    expect(d.error).toMatch(/50/);
  });

  it('金额等于最低限额时通过', async () => {
    stubMinAmount('30');
    stubNoPending();
    stubInsert(10);
    const res = await postDeposit(makeReq({ amount: 30, provider: 'Mega888', payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(201);
  });
});

/* ── Duplicate pending prevention ────────────────────────────── */

describe('存款 — 重复挂单防护', () => {
  it('已有 PENDING 存款时返回 409', async () => {
    stubMinAmount('30');
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 77 }] } as never); /* pending exists */
    const res = await postDeposit(makeReq({ amount: 100, provider: 'Mega888', payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(409);
    const d = await res.json() as { error: string; pending_id: number };
    expect(d.pending_id).toBe(77);
  });

  it('无 PENDING 存款时正常提交', async () => {
    stubMinAmount('30');
    stubNoPending();
    stubInsert(88);
    const res = await postDeposit(makeReq({ amount: 100, provider: 'Mega888', payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(201);
    const d = await res.json() as { id: number };
    expect(d.id).toBe(88);
  });
});

/* ── Normal deposit ───────────────────────────────────────────── */

describe('存款 — 正常提交', () => {
  it('返回 201 及流水号', async () => {
    stubMinAmount('30');
    stubNoPending();
    stubInsert(42);
    const res = await postDeposit(makeReq({ amount: 200, provider: '918Kiss', payment_bank: 'CIMB' }) as never);
    expect(res.status).toBe(201);
    const d = await res.json() as { ok: boolean; id: number };
    expect(d.ok).toBe(true);
    expect(d.id).toBe(42);
  });

  it('无优惠时 bonus_amount 为 0', async () => {
    stubMinAmount('30');
    stubNoPending();
    stubInsert(43);
    const res = await postDeposit(makeReq({ amount: 100, provider: 'Mega888', payment_bank: 'Maybank' }) as never);
    const d = await res.json() as { bonus_amount: number };
    expect(d.bonus_amount).toBe(0);
  });
});

/* ── Promotion bonus calculation ──────────────────────────────── */

describe('存款 — 优惠奖金计算', () => {
  it('百分比奖金正确计算', async () => {
    stubMinAmount('30');
    stubNoPending();
    /* Promo: 100%, max_bonus 100, min_deposit 30 */
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, bonus_type: 'PERCENTAGE', bonus_value: '100', min_deposit: '30', max_bonus: '100' }],
    } as never);
    stubInsert(50);
    const res = await postDeposit(makeReq({ amount: 200, provider: 'Mega888', payment_bank: 'Maybank', promotion_id: 1 }) as never);
    expect(res.status).toBe(201);
    const d = await res.json() as { bonus_amount: number; credit_amount: number };
    expect(d.bonus_amount).toBe(100);       /* capped at max_bonus */
    expect(d.credit_amount).toBe(300);      /* 200 + 100 */
  });

  it('固定奖金正确计算', async () => {
    stubMinAmount('30');
    stubNoPending();
    /* Promo: FIXED RM 50 */
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 2, bonus_type: 'FIXED', bonus_value: '50', min_deposit: '30', max_bonus: null }],
    } as never);
    stubInsert(51);
    const res = await postDeposit(makeReq({ amount: 100, provider: '918Kiss', payment_bank: 'TNG', promotion_id: 2 }) as never);
    const d = await res.json() as { bonus_amount: number; credit_amount: number };
    expect(d.bonus_amount).toBe(50);
    expect(d.credit_amount).toBe(150);
  });

  it('存款未达最低时奖金为 0', async () => {
    stubMinAmount('30');
    stubNoPending();
    /* Promo: 100%, min_deposit 200 */
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 3, bonus_type: 'PERCENTAGE', bonus_value: '100', min_deposit: '200', max_bonus: null }],
    } as never);
    stubInsert(52);
    const res = await postDeposit(makeReq({ amount: 50, provider: 'Mega888', payment_bank: 'Maybank', promotion_id: 3 }) as never);
    const d = await res.json() as { bonus_amount: number; credit_amount: number };
    expect(d.bonus_amount).toBe(0);
    expect(d.credit_amount).toBe(50);
  });

  it('优惠不存在时静默忽略，bonus 为 0', async () => {
    stubMinAmount('30');
    stubNoPending();
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); /* promo not found */
    stubInsert(53);
    const res = await postDeposit(makeReq({ amount: 100, provider: 'Mega888', payment_bank: 'Maybank', promotion_id: 999 }) as never);
    expect(res.status).toBe(201);
    const d = await res.json() as { bonus_amount: number };
    expect(d.bonus_amount).toBe(0);
  });
});

/* ── Eligible promotions ──────────────────────────────────────── */

describe('存款 — 资格优惠列表', () => {
  it('未登录返回 401', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await getEligible();
    expect(res.status).toBe(401);
  });

  it('已领取的首存优惠被过滤', async () => {
    /* All promos */
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'Welcome', promotion_type: 'FIRST_DEPOSIT', bonus_type: 'PERCENTAGE', bonus_value: '100', min_deposit: '30', max_bonus: null, turnover_multiplier: '5', expiry_date: null },
          { id: 2, name: 'Daily',   promotion_type: 'DAILY',         bonus_type: 'PERCENTAGE', bonus_value: '10',  min_deposit: '50', max_bonus: null, turnover_multiplier: '3', expiry_date: null },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [{ promotion_id: 1 }] } as never) /* claimed promo 1 */
      .mockResolvedValueOnce({ rows: [] } as never);                    /* no pending promos */
    const res = await getEligible();
    expect(res.status).toBe(200);
    const data = await res.json() as { id: number }[];
    expect(data.map(p => p.id)).not.toContain(1);
    expect(data.map(p => p.id)).toContain(2);
  });

  it('无限制优惠始终显示', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [{ id: 3, name: 'Reload', promotion_type: 'UNLIMITED', bonus_type: 'PERCENTAGE', bonus_value: '5', min_deposit: '30', max_bonus: null, turnover_multiplier: '1', expiry_date: null }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const res = await getEligible();
    const data = await res.json() as { id: number }[];
    expect(data.map(p => p.id)).toContain(3);
  });
});
