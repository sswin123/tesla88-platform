import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed'), compare: vi.fn() },
}));
vi.mock('@/lib/member-auth', () => ({
  getMember: vi.fn().mockResolvedValue({ sub: 1, phone: '0123456789', first_name: 'Ali' }),
}));

import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { GET as getProfile, PATCH as patchProfile } from '@/app/api/member/profile/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(method: string, body?: unknown) {
  return new Request('http://localhost/', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

describe('ProfileCard — GET /api/member/profile', () => {
  it('redirects when unauthenticated (401)', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await getProfile();
    expect(res.status).toBe(401);
  });

  it('returns all fields required by ProfileCard', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{
        id: 1,
        first_name: 'Ali',
        phone: '0123456789',
        bank_name: 'Maybank',
        bank_account: '1234567890',
        bank_holder_name: 'Ali Bin Ahmad',
        status: 'ACTIVE',
        total_deposit: '1000.00',
        total_withdraw: '200.00',
        total_bonus: '50.00',
        net_deposit: '800.00',
        referral_code: 'ALI123',
        created_at: '2024-01-01T00:00:00Z',
        last_seen_at: null,
      }],
    } as never);
    const res = await getProfile();
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.first_name).toBe('Ali');
    expect(data.phone).toBe('0123456789');
    expect(data.bank_name).toBe('Maybank');
    expect(data.bank_account).toBe('1234567890');
    expect(data.bank_holder_name).toBe('Ali Bin Ahmad');
    expect(data.total_deposit).toBe('1000.00');
    expect(data.total_withdraw).toBe('200.00');
    expect(data.total_bonus).toBe('50.00');
    expect(data.created_at).toBeDefined();
  });

  it('returns 404 when member record not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getProfile();
    expect(res.status).toBe(404);
  });
});

describe('SettingsList — PATCH /api/member/profile (password change)', () => {
  it('rejects missing new_password', async () => {
    const res = await patchProfile(makeReq('PATCH', {}) as never);
    expect(res.status).toBe(400);
  });

  it('rejects password shorter than 8 characters', async () => {
    const res = await patchProfile(makeReq('PATCH', { new_password: 'short7' }) as never);
    expect(res.status).toBe(400);
    const d = await res.json() as { error: string };
    expect(d.error).toMatch(/8/);
  });

  it('accepts password of exactly 8 characters', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await patchProfile(makeReq('PATCH', { new_password: 'exactly8' }) as never);
    expect(res.status).toBe(200);
  });

  it('accepts password longer than 8 characters', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await patchProfile(makeReq('PATCH', { new_password: 'securelongpassword123' }) as never);
    expect(res.status).toBe(200);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await patchProfile(makeReq('PATCH', { new_password: 'newpass123' }) as never);
    expect(res.status).toBe(401);
  });
});
