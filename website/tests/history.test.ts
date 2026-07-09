import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('@/lib/member-auth', () => ({
  getMember: vi.fn().mockResolvedValue({ sub: 7, phone: '0123456789', first_name: 'Tan' }),
}));

import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { GET as getDeposits  } from '@/app/api/member/deposits/route';
import { GET as getWithdrawals } from '@/app/api/member/withdrawals/route';

beforeEach(() => vi.clearAllMocks());

/* ── Deposit history ──────────────────────────────────────────── */

describe('交易记录 — 存款历史 (GET /api/member/deposits)', () => {
  it('未登录返回 401', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await getDeposits();
    expect(res.status).toBe(401);
  });

  it('返回存款列表数组', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getDeposits();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });

  it('记录包含 TransactionCard 所需字段', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{
        id: 101,
        deposit_amount: '500.00',
        bonus_amount: '50.00',
        status: 'APPROVED',
        provider: 'Mega888',
        created_at: '2025-01-15T10:00:00Z',
        reviewed_at: '2025-01-15T10:05:00Z',
      }],
    } as never);
    const res = await getDeposits();
    const data = await res.json() as Record<string, unknown>[];
    expect(data[0].id).toBe(101);
    expect(data[0].deposit_amount).toBe('500.00');
    expect(data[0].bonus_amount).toBe('50.00');
    expect(data[0].status).toBe('APPROVED');
    expect(data[0].provider).toBe('Mega888');
    expect(data[0].created_at).toBeDefined();
  });

  it('状态值为 PENDING', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 102, deposit_amount: '200.00', bonus_amount: null, status: 'PENDING', provider: null, created_at: '2025-01-16T08:00:00Z' }],
    } as never);
    const res = await getDeposits();
    const data = await res.json() as Record<string, unknown>[];
    expect(data[0].status).toBe('PENDING');
  });

  it('状态值为 REJECTED', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 103, deposit_amount: '100.00', bonus_amount: null, status: 'REJECTED', provider: null, created_at: '2025-01-17T09:00:00Z' }],
    } as never);
    const res = await getDeposits();
    const data = await res.json() as Record<string, unknown>[];
    expect(data[0].status).toBe('REJECTED');
  });

  it('查询仅限当前会员 (user_id 参数)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getDeposits();
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[1]).toEqual([7]);
  });
});

/* ── Withdrawal history ───────────────────────────────────────── */

describe('交易记录 — 取款历史 (GET /api/member/withdrawals)', () => {
  it('未登录返回 401', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await getWithdrawals();
    expect(res.status).toBe(401);
  });

  it('返回取款列表数组', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getWithdrawals();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });

  it('记录包含 TransactionCard 所需字段', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{
        id: 201,
        withdraw_amount: '1000.00',
        status: 'PAID',
        bank_name: 'Maybank',
        bank_account: '1234567890',
        created_at: '2025-01-18T14:00:00Z',
        reviewed_at: '2025-01-18T14:30:00Z',
      }],
    } as never);
    const res = await getWithdrawals();
    const data = await res.json() as Record<string, unknown>[];
    expect(data[0].id).toBe(201);
    expect(data[0].withdraw_amount).toBe('1000.00');
    expect(data[0].status).toBe('PAID');
    expect(data[0].bank_name).toBe('Maybank');
    expect(data[0].bank_account).toBe('1234567890');
    expect(data[0].created_at).toBeDefined();
  });

  it('状态值为 PENDING', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 202, withdraw_amount: '500.00', status: 'PENDING', bank_name: 'CIMB', bank_account: '9876', created_at: '2025-01-19T10:00:00Z' }],
    } as never);
    const res = await getWithdrawals();
    const data = await res.json() as Record<string, unknown>[];
    expect(data[0].status).toBe('PENDING');
  });

  it('状态值为 REJECTED', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 203, withdraw_amount: '300.00', status: 'REJECTED', bank_name: 'RHB', bank_account: '5555', created_at: '2025-01-20T11:00:00Z' }],
    } as never);
    const res = await getWithdrawals();
    const data = await res.json() as Record<string, unknown>[];
    expect(data[0].status).toBe('REJECTED');
  });

  it('查询仅限当前会员 (user_id 参数)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getWithdrawals();
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[1]).toEqual([7]);
  });
});
