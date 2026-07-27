import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks (must be before imports) ──────────────────────────────────────────

vi.mock('@/lib/require_permission', () => ({
  requirePermission: vi.fn().mockResolvedValue({ sub: 1, username: 'admin', role: 'SUPER_ADMIN' }),
}));

vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import pool from '@/lib/db';
import { GET } from '@/app/api/transactions/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/transactions');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: return empty data for data queries; count=0 for count queries.
  // Both shapes are compatible with the route handler.
  vi.mocked(pool.query).mockResolvedValue({ rows: [{ count: 0 }] } as never);
});

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe('GET /api/transactions — new params (type=pending + search)', () => {
  it("type=pending → SQL contains status IN ('PENDING','PROCESSING')", async () => {
    await GET(makeReq({ type: 'pending' }));
    const sqls = vi.mocked(pool.query).mock.calls.map(c => c[0] as string);
    expect(sqls.some(sql => sql.includes("status IN ('PENDING','PROCESSING')"))).toBe(true);
  });

  it("type=pending → SQL uses UNION ALL base (contains both 'deposit' and 'withdrawal' literals)", async () => {
    await GET(makeReq({ type: 'pending' }));
    const sqls = vi.mocked(pool.query).mock.calls.map(c => c[0] as string);
    // Data SQL is the first call; it should come from SELECT_WITH_PROCESSING (UNION ALL)
    const dataSql = sqls[0];
    expect(dataSql).toContain("'deposit'");
    expect(dataSql).toContain("'withdrawal'");
  });

  it("type=pending + explicit status=APPROVED → status param ignored; SQL has IN ('PENDING','PROCESSING') only", async () => {
    await GET(makeReq({ type: 'pending', status: 'APPROVED' }));
    const sqls = vi.mocked(pool.query).mock.calls.map(c => c[0] as string);
    expect(sqls.some(sql => sql.includes("status IN ('PENDING','PROCESSING')"))).toBe(true);
    expect(sqls.every(sql => !sql.includes("status = 'APPROVED'"))).toBe(true);
  });

  it('search=john → SQL contains ILIKE; params array contains %john%', async () => {
    await GET(makeReq({ search: 'john' }));
    const calls = vi.mocked(pool.query).mock.calls;
    const sqls   = calls.map(c => c[0] as string);
    const params  = calls.map(c => c[1] as unknown[]);
    expect(sqls.some(sql => sql.includes('ILIKE'))).toBe(true);
    expect(params.some(p => Array.isArray(p) && p.includes('%john%'))).toBe(true);
  });

  it('search=0123 → WHERE clause references first_name, phone, public_id, user_id', async () => {
    await GET(makeReq({ search: '0123' }));
    const sqls = vi.mocked(pool.query).mock.calls.map(c => c[0] as string);
    // The outer WHERE on the sub-query should reference all four fields
    const withIlike = sqls.find(sql => sql.includes('ILIKE'));
    expect(withIlike).toBeDefined();
    expect(withIlike).toContain('first_name');
    expect(withIlike).toContain('phone');
    expect(withIlike).toContain('public_id');
    expect(withIlike).toContain('user_id');
  });

  it("type=pending + search=SS10 → SQL has IN ('PENDING','PROCESSING') AND ILIKE; params contains %SS10%", async () => {
    await GET(makeReq({ type: 'pending', search: 'SS10' }));
    const calls = vi.mocked(pool.query).mock.calls;
    const sqls   = calls.map(c => c[0] as string);
    const params  = calls.map(c => c[1] as unknown[]);
    expect(sqls.some(sql => sql.includes("status IN ('PENDING','PROCESSING')") && sql.includes('ILIKE'))).toBe(true);
    expect(params.some(p => Array.isArray(p) && p.includes('%SS10%'))).toBe(true);
  });

  it('bare call (no params) → no ILIKE in SQL; data query params = [20, 0]', async () => {
    await GET(makeReq());
    const calls  = vi.mocked(pool.query).mock.calls;
    const sqls   = calls.map(c => c[0] as string);
    const params  = calls.map(c => c[1] as unknown[]);
    // No ILIKE anywhere
    expect(sqls.every(sql => !sql.includes('ILIKE'))).toBe(true);
    // Data query carries only limit + offset
    const dataParams = params.find(p => Array.isArray(p) && p.includes(20));
    expect(dataParams).toEqual([20, 0]);
  });

  it("status=PROCESSING (type=all) → SQL contains status = 'PROCESSING' (backward compat)", async () => {
    await GET(makeReq({ status: 'PROCESSING' }));
    const sqls = vi.mocked(pool.query).mock.calls.map(c => c[0] as string);
    expect(sqls.some(sql => sql.includes("status = 'PROCESSING'"))).toBe(true);
  });

  it('search + type=deposit: ILIKE applied to deposit-only base', async () => {
    await GET(makeReq({ type: 'deposit', search: 'john' }));
    const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
    const [dataSql, dataParams] = calls[0];
    expect(dataSql).toContain('ILIKE');
    expect(dataParams).toContain('%john%');
    // type=deposit uses deposit-only base (should NOT contain 'withdrawal' literal in base)
    // but the outer WHERE ILIKE applies
    expect(dataSql).toContain('first_name');
  });

  it('search + type=withdrawal: ILIKE applied to withdrawal-only base', async () => {
    await GET(makeReq({ type: 'withdrawal', search: '0199' }));
    const calls = vi.mocked(pool.query).mock.calls as [string, unknown[]][];
    const [dataSql, dataParams] = calls[0];
    expect(dataSql).toContain('ILIKE');
    expect(dataParams).toContain('%0199%');
    expect(dataSql).toContain('first_name');
  });
});
