/**
 * Verifies the statusFilter logic extracted from transactions/route.ts.
 *
 * This directly tests the SQL WHERE clause that determines which rows appear
 * in each tab view — specifically that txType=pending includes BOTH Pending
 * and Processing statuses (Scenario 3 & 4 of the four user test cases).
 */

import { describe, it, expect } from 'vitest';

// ─── Extracted filter logic ───────────────────────────────────────────────────
// Mirrors lines 149-156 in transactions/route.ts exactly.
// Any change to the route must be reflected here.

function buildStatusFilter(txType: string, status: string): string {
  const isPending       = txType === 'pending';
  const effectiveStatus = isPending ? '' : status;

  return isPending                             ? `status IN ('PENDING','PROCESSING')` :
         effectiveStatus === 'approved_paid'   ? `status IN ('APPROVED','PAID')` :
         effectiveStatus                        ? `status = '${effectiveStatus.replace(/'/g, "''")}'` :
         '';
}

// ─── Extracted pending-count response shape ───────────────────────────────────
// Mirrors the calculation in pending-count/route.ts.

interface CountRow {
  deposit_count:               number;
  withdrawal_count:            number;
  deposit_processing_count:    number;
  withdrawal_processing_count: number;
}

function buildPendingCountResponse(row: CountRow) {
  const { deposit_count, withdrawal_count, deposit_processing_count, withdrawal_processing_count } = row;

  const count = deposit_count + withdrawal_count; // PENDING only → sidebar reminder
  const deposit_active_count    = deposit_count    + deposit_processing_count;
  const withdrawal_active_count = withdrawal_count + withdrawal_processing_count;
  const active_count            = deposit_active_count + withdrawal_active_count;

  return {
    count,
    deposit_count,
    withdrawal_count,
    active_count,
    deposit_active_count,
    withdrawal_active_count,
  };
}

// ─── Status filter tests ──────────────────────────────────────────────────────

describe('Scenario 3 – Pending tab statusFilter', () => {
  it('includes BOTH Pending and Processing for txType=pending', () => {
    const filter = buildStatusFilter('pending', '');
    expect(filter).toBe(`status IN ('PENDING','PROCESSING')`);
  });

  it('includes BOTH Pending and Processing even when a status param is present (ignored for pending tab)', () => {
    // The pending tab does not allow status param — effectiveStatus is forced to ''
    const filter = buildStatusFilter('pending', 'PENDING');
    expect(filter).toBe(`status IN ('PENDING','PROCESSING')`);
  });

  it('returns empty filter for txType=all (no status selected)', () => {
    expect(buildStatusFilter('all', '')).toBe('');
  });

  it('returns APPROVED/PAID filter for approved_paid virtual status', () => {
    const filter = buildStatusFilter('all', 'approved_paid');
    expect(filter).toBe(`status IN ('APPROVED','PAID')`);
  });

  it('returns single status filter for deposit/withdrawal tabs', () => {
    expect(buildStatusFilter('deposit',    'PENDING'))   .toBe(`status = 'PENDING'`);
    expect(buildStatusFilter('deposit',    'PROCESSING')).toBe(`status = 'PROCESSING'`);
    expect(buildStatusFilter('withdrawal', 'REJECTED'))  .toBe(`status = 'REJECTED'`);
  });

  it('sanitises single-quote injection in status param', () => {
    const filter = buildStatusFilter('all', "PEN'DING");
    expect(filter).toBe(`status = 'PEN''DING'`);
  });
});

// ─── Pending-count response shape tests ──────────────────────────────────────

describe('Scenario 4 – Pending statistics show both Pending and Processing', () => {
  it('count (sidebar reminder) reflects ONLY Pending — not Processing', () => {
    const response = buildPendingCountResponse({
      deposit_count:               2,
      withdrawal_count:            1,
      deposit_processing_count:    3,
      withdrawal_processing_count: 1,
    });

    // Sidebar reminder must stop once all Pending are processed
    expect(response.count).toBe(3); // 2+1 PENDING only
  });

  it('active_count (Pending tab display) includes BOTH Pending and Processing', () => {
    const response = buildPendingCountResponse({
      deposit_count:               2,
      withdrawal_count:            1,
      deposit_processing_count:    3,
      withdrawal_processing_count: 1,
    });

    expect(response.active_count).toBe(7);           // 2+1+3+1
    expect(response.deposit_active_count).toBe(5);   // 2+3
    expect(response.withdrawal_active_count).toBe(2); // 1+1
  });

  it('active_count equals count when there are no Processing transactions', () => {
    const response = buildPendingCountResponse({
      deposit_count:               1,
      withdrawal_count:            1,
      deposit_processing_count:    0,
      withdrawal_processing_count: 0,
    });

    expect(response.count).toBe(2);
    expect(response.active_count).toBe(2);
  });

  it('count is 0 but active_count > 0 when all transactions are in Processing', () => {
    // This is the "Start Process" case: Pending becomes Processing
    // → sidebar reminder should stop (count=0)
    // → Pending tab should still show the transaction (active_count>0)
    const response = buildPendingCountResponse({
      deposit_count:               0,
      withdrawal_count:            0,
      deposit_processing_count:    1,
      withdrawal_processing_count: 0,
    });

    expect(response.count).toBe(0);       // reminder stops ✓
    expect(response.active_count).toBe(1); // still visible in Pending tab ✓
  });
});
