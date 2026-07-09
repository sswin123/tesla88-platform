import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed'), compare: vi.fn() } }));

vi.mock('@/lib/member-auth', () => ({ getMember: vi.fn().mockResolvedValue({ sub: 1, phone: '0123456789', first_name: 'Alice' }) }));

import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { GET as getProfile, PATCH as patchProfile } from '@/app/api/member/profile/route';
import { GET as getDeposits, POST as postDeposit } from '@/app/api/member/deposits/route';
import { GET as getWithdrawals, POST as postWithdrawal } from '@/app/api/member/withdrawals/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(method: string, body?: unknown) {
  return new Request('http://localhost/', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

describe('GET /api/member/profile', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await getProfile();
    expect(res.status).toBe(401);
  });

  it('returns member profile', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', phone: '0123456789', total_deposit: '500.00' }],
    } as never);
    const res = await getProfile();
    expect(res.status).toBe(200);
    const data = await res.json() as { first_name: string };
    expect(data.first_name).toBe('Alice');
  });
});

describe('PATCH /api/member/profile', () => {
  it('returns 400 when new_password missing', async () => {
    const res = await patchProfile(makeReq('PATCH', {}) as never);
    expect(res.status).toBe(400);
  });

  it('returns 200 and updates password', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await patchProfile(makeReq('PATCH', { new_password: 'newpass123' }) as never);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/member/deposits', () => {
  it('returns 400 when amount missing', async () => {
    const res = await postDeposit(makeReq('POST', { provider: 'Mega888', payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when provider missing', async () => {
    const res = await postDeposit(makeReq('POST', { amount: 100, payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when payment_bank missing', async () => {
    const res = await postDeposit(makeReq('POST', { amount: 100, provider: 'Mega888' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 201 on valid submission', async () => {
    /* New flow: (1) min amount, (2) pending check, (3) INSERT */
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ value: '30' }] } as never)  /* min amount */
      .mockResolvedValueOnce({ rows: [] } as never)                  /* no pending */
      .mockResolvedValueOnce({ rows: [{ id: 99 }] } as never);      /* INSERT */
    const res = await postDeposit(makeReq('POST', { amount: 100, provider: 'Mega888', payment_bank: 'Maybank' }) as never);
    expect(res.status).toBe(201);
  });
});

describe('POST /api/member/withdrawals', () => {
  it('returns 400 when amount missing', async () => {
    const res = await postWithdrawal(makeReq('POST', {}) as never);
    expect(res.status).toBe(400);
  });

  it('returns 201 on valid submission', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ bank_name: 'BANK', bank_account: '123', bank_holder_name: 'Alice', net_deposit: '500.00' }] } as never) /* user */
      .mockResolvedValueOnce({ rows: [{ value: '30' }] } as never)    /* min amount */
      .mockResolvedValueOnce({ rows: [] } as never)                    /* no pending */
      .mockResolvedValueOnce({ rows: [{ id: 55 }] } as never);        /* INSERT */
    const res = await postWithdrawal(makeReq('POST', { amount: 200 }) as never);
    expect(res.status).toBe(201);
  });
});

describe('GET /api/member/deposits', () => {
  it('returns deposit history array', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 1, deposit_amount: '100' }] } as never);
    const res = await getDeposits();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });
});

describe('GET /api/member/withdrawals', () => {
  it('returns withdrawal history array', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getWithdrawals();
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });
});
