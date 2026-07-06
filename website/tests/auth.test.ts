import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed'), compare: vi.fn() },
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(body: unknown) {
  return new Request('http://localhost/', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── register ──────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('returns 400 when phone missing', async () => {
    const res = await register(makeReq({ password: 'pass1234' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when password missing', async () => {
    const res = await register(makeReq({ phone: '0123456789' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when password shorter than 8 chars', async () => {
    const res = await register(makeReq({ phone: '0123456789', password: 'short' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 404 when phone not found in DB', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await register(makeReq({ phone: '0199999999', password: 'pass1234' }) as never);
    expect(res.status).toBe(404);
  });

  it('returns 409 when web access already activated', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', website_password_hash: 'existing_hash' }],
    } as never);
    const res = await register(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(409);
  });

  it('returns 200 and sets cookie on success', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 1, first_name: 'Alice', website_password_hash: null }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const res = await register(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; first_name: string };
    expect(data.ok).toBe(true);
    expect(data.first_name).toBe('Alice');
    expect(res.headers.get('set-cookie')).toContain('member_session');
  });
});

// ── login ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 400 when fields missing', async () => {
    const res = await login(makeReq({}) as never);
    expect(res.status).toBe(400);
  });

  it('returns 401 when user not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await login(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 when no web password set', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', website_password_hash: null, status: 'ACTIVE' }],
    } as never);
    const res = await login(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 403 when account frozen', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', website_password_hash: 'hash', status: 'FROZEN' }],
    } as never);
    const res = await login(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(403);
  });

  it('returns 401 when password incorrect', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', website_password_hash: 'hash', status: 'ACTIVE' }],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
    const res = await login(makeReq({ phone: '0123456789', password: 'wrongpass' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 200 and sets cookie on valid credentials', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 1, first_name: 'Alice', website_password_hash: 'hash', status: 'ACTIVE' }],
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);
    const res = await login(makeReq({ phone: '0123456789', password: 'pass1234' }) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('member_session');
  });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('returns 200 and clears cookie', async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('member_session=;');
  });
});
