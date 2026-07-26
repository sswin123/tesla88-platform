import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockRequirePermission = vi.fn();
vi.mock('@/lib/require_permission', () => ({
  requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
}));

vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

// ── Imports (after mock factories are registered) ────────────────────────────

import pool from '@/lib/db';
import { GET } from '@/app/api/transactions/pending-count/route';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(role = 'ADMIN') {
  return { sub: 1, username: 'admin1', role };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/transactions/pending-count', () => {
  it('returns 401 when user has neither deposit.view nor withdraw.view', async () => {
    mockRequirePermission.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with deposit.view permission', async () => {
    mockRequirePermission.mockImplementation((perm: unknown) =>
      perm === 'deposit.view'
        ? Promise.resolve(makePayload())
        : Promise.resolve(null),
    );
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ deposit_count: 3, withdrawal_count: 1 }] } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { count: number; deposit_count: number; withdrawal_count: number };
    expect(body.count).toBe(4);
    expect(body.deposit_count).toBe(3);
    expect(body.withdrawal_count).toBe(1);
  });

  it('returns 200 with withdraw.view permission only', async () => {
    mockRequirePermission.mockImplementation((perm: unknown) =>
      perm === 'withdraw.view'
        ? Promise.resolve(makePayload())
        : Promise.resolve(null),
    );
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ deposit_count: 0, withdrawal_count: 5 }] } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { count: number; deposit_count: number; withdrawal_count: number };
    expect(body.count).toBe(5);
    expect(body.deposit_count).toBe(0);
    expect(body.withdrawal_count).toBe(5);
  });

  it('returns zeros when no pending transactions', async () => {
    mockRequirePermission.mockResolvedValue(makePayload());
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ deposit_count: 0, withdrawal_count: 0 }] } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { count: number; deposit_count: number; withdrawal_count: number };
    expect(body.count).toBe(0);
    expect(body.deposit_count).toBe(0);
    expect(body.withdrawal_count).toBe(0);
  });

  it('coerces null DB values to 0', async () => {
    mockRequirePermission.mockResolvedValue(makePayload());
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ deposit_count: null, withdrawal_count: null }] } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { count: number; deposit_count: number; withdrawal_count: number };
    expect(body.count).toBe(0);
    expect(body.deposit_count).toBe(0);
    expect(body.withdrawal_count).toBe(0);
  });
});
