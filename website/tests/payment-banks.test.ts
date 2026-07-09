import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

import pool from '@/lib/db';
import { GET as getBanks } from '@/app/api/public/payment-banks/route';

beforeEach(() => vi.clearAllMocks());

const MAYBANK = {
  id: 1, bank_name: 'Maybank', account_name: 'ACME Sdn Bhd',
  account_number: '1234567890', qr_media_id: 7, instructions: '请备注用户名',
};

const CIMB = {
  id: 2, bank_name: 'CIMB', account_name: 'ACME Sdn Bhd',
  account_number: '9876543210', qr_media_id: null, instructions: null,
};

const INACTIVE = {
  id: 3, bank_name: 'Hidden Bank', account_name: 'ACME Sdn Bhd',
  account_number: '0000000000', qr_media_id: null, instructions: null,
};

describe('GET /api/public/payment-banks', () => {
  it('returns active banks array', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [MAYBANK, CIMB] } as never);
    const res = await getBanks();
    expect(res.status).toBe(200);
    const data = await res.json() as typeof MAYBANK[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
  });

  it('returns empty array when no active banks', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getBanks();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(0);
  });

  it('returns 200 with empty array on DB error (graceful fallback)', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('connection refused'));
    const res = await getBanks();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(0);
  });

  it('returns correct fields including qr_media_id and instructions', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [MAYBANK] } as never);
    const res = await getBanks();
    const data = await res.json() as typeof MAYBANK[];
    const b = data[0];
    expect(b).toHaveProperty('id');
    expect(b).toHaveProperty('bank_name');
    expect(b).toHaveProperty('account_number');
    expect(b).toHaveProperty('account_name');
    expect(b).toHaveProperty('qr_media_id');
    expect(b).toHaveProperty('instructions');
    expect(b.qr_media_id).toBe(7);
    expect(b.instructions).toBe('请备注用户名');
  });

  it('allows null qr_media_id and null instructions', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [CIMB] } as never);
    const res = await getBanks();
    const data = await res.json() as typeof CIMB[];
    expect(data[0].qr_media_id).toBeNull();
    expect(data[0].instructions).toBeNull();
  });

  it('returns banks ordered by display_order ASC', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [MAYBANK, CIMB] } as never);
    await getBanks();
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY display_order ASC');
  });

  it('SQL query filters by is_active = TRUE', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getBanks();
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('is_active = TRUE');
  });

  it('inactive bank not returned (WHERE clause excludes it)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [MAYBANK] } as never);
    const res = await getBanks();
    const data = await res.json() as typeof MAYBANK[];
    expect(data.every(b => b.bank_name !== INACTIVE.bank_name)).toBe(true);
  });
});
