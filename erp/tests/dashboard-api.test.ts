import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN' }),
  COOKIE_NAME: 'token',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

const mockQuery = vi.fn();
vi.mock('@/lib/db', () => ({
  default: {
    connect: vi.fn(),
  },
}));

import pool from '@/lib/db';
import { GET } from '@/app/api/dashboard/route';

// Returns rows appropriate for each query call position.
// The dashboard route runs queries in a fixed order via Promise.all.
// Any query returning count/amount gets a row shape; chart queries get empty arrays.
function makeCountRow(count = 0) { return { rows: [{ count, amount: 0, seconds: 0, files: 0, bytes: 0 }] }; }
function makeChartRows() { return { rows: [] }; }

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pool.connect).mockResolvedValue({
    query: mockQuery,
    release: vi.fn(),
  } as never);
});

describe('GET /api/dashboard', () => {
  it('returns 200 with all required DashboardStats fields', async () => {
    // Feed one default response per query (30 queries total after extension)
    mockQuery.mockResolvedValue(makeCountRow());

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;

    // Existing fields
    expect(typeof data.totalMembers).toBe('number');
    expect(typeof data.activeMembers).toBe('number');
    expect(typeof data.pendingDeposits).toBe('number');
    expect(typeof data.pendingWithdrawals).toBe('number');
    expect(typeof data.todayDepositAmount).toBe('number');
    expect(typeof data.todayWithdrawalAmount).toBe('number');
    expect(typeof data.todayProfit).toBe('number');
    expect(typeof data.newMembersToday).toBe('number');
    expect(typeof data.activeMembersToday).toBe('number');
    expect(Array.isArray(data.depositChart)).toBe(true);
    expect(Array.isArray(data.withdrawalChart)).toBe(true);
    expect(Array.isArray(data.monthlyRevenue)).toBe(true);

    // New Dashboard 2.0 fields
    expect(typeof data.vipMembers).toBe('number');
    expect(typeof data.onlineMembers).toBe('number');
    expect(typeof data.openLiveChats).toBe('number');
    expect(typeof data.waitingCustomers).toBe('number');
    expect(typeof data.broadcastSentToday).toBe('number');
    expect(typeof data.weeklyDepositAmount).toBe('number');
    expect(typeof data.thisMonthDepositAmount).toBe('number');
    expect(typeof data.avgResponseTimeSeconds).toBe('number');
    expect(typeof data.chatSessionsToday).toBe('number');
    expect(Array.isArray(data.csPerformance)).toBe(true);
    expect(Array.isArray(data.thirtyDayChart)).toBe(true);
  });

  it('returns profit = today deposit - withdrawal - bonus', async () => {
    // todayDep=1000, todayWith=300, todayBonus=100 → profit=600
    let callIdx = 0;
    mockQuery.mockImplementation(() => {
      callIdx++;
      // Based on query order in Promise.all:
      // [0]=totalMembers [1]=activeMembers [2]=totalDeposits [3]=totalWithdrawals
      // [4]=pendingDeposits [5]=pendingWithdrawals
      // [6]=todayDep [7]=todayWith
      // [8]=depChart [9]=withChart [10]=topPromo [11]=topDep [12]=todayBonus
      // [13]=newMembers [14]=activeToday [15]=onlineStaff [16]=topProviders
      // [17]=monthlyDep [18]=monthlyWith
      // [19]=vipCount [20]=onlineCount [21]=openChats [22]=waitingChats
      // [23]=broadcastToday [24]=weeklyDep [25]=thisMonthDep [26]=avgResponseTime
      // [27]=chatSessionsToday [28]=csPerf [29]=thirtyDayDep [30]=thirtyDayWith
      if (callIdx === 7) return Promise.resolve({ rows: [{ amount: 1000, count: 3 }] }); // todayDep
      if (callIdx === 8) return Promise.resolve({ rows: [{ amount: 300, count: 1 }] });  // todayWith
      if (callIdx === 13) return Promise.resolve({ rows: [{ amount: 100 }] });             // todayBonus
      return Promise.resolve({ rows: [{ count: 0, amount: 0, seconds: 0 }] });
    });

    const res = await GET();
    const data = await res.json() as { todayProfit: number };
    expect(data.todayProfit).toBe(600); // 1000 - 300 - 100
  });

  it('includes csPerformance array from query', async () => {
    let callIdx = 0;
    mockQuery.mockImplementation(() => {
      callIdx++;
      if (callIdx === 29) { // csPerf query position
        return Promise.resolve({ rows: [{ agent: 'alice', sessions: 5 }, { agent: 'bob', sessions: 3 }] });
      }
      return Promise.resolve({ rows: [{ count: 0, amount: 0, seconds: 0 }] });
    });

    const res = await GET();
    const data = await res.json() as { csPerformance: { agent: string; sessions: number }[] };
    expect(data.csPerformance).toEqual([{ agent: 'alice', sessions: 5 }, { agent: 'bob', sessions: 3 }]);
  });

  it('handles database error gracefully with 500', async () => {
    vi.mocked(pool.connect).mockRejectedValueOnce(new Error('DB down'));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
