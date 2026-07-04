import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

import pool from '@/lib/db';
import {
  getBroadcasts,
  getBroadcastById,
  createBroadcast,
  updateBroadcast,
  deleteBroadcast,
  updateBroadcastCounts,
  resolveAudienceTelegramIds,
  getAudienceCount,
  getActiveSessionUserIds,
} from '@/lib/repositories/broadcast_repo';

const mockQuery = vi.mocked(pool.query);
beforeEach(() => vi.clearAllMocks());

const BASE_ROW = {
  id: 1, title: 'Test', content_type: 'TEXT', body: 'Hello', caption: null,
  media_id: null, channels: ['TELEGRAM'], audience_type: 'ALL',
  audience_tag_id: null, audience_tag_name: null, audience_user_ids: null,
  status: 'DRAFT', scheduled_at: null, sent_at: null,
  recipient_count: 0, success_count: 0, failed_count: 0,
  created_by: 'admin1', created_at: '2026-01-01', updated_at: '2026-01-01',
  // media join
  ml_id: null, ml_display_name: null, ml_mime_type: null,
  ml_file_size: null, ml_file_path: null, ml_created_at: null,
};

describe('getBroadcasts', () => {
  it('returns paginated broadcasts', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [BASE_ROW] } as never)
      .mockResolvedValueOnce({ rows: [{ count: 1 }] } as never);
    const r = await getBroadcasts({ limit: 20, offset: 0 });
    expect(r.total).toBe(1);
    expect(r.data[0].id).toBe(1);
  });

  it('filters by status', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ count: 0 }] } as never);
    const r = await getBroadcasts({ status: 'SENT', limit: 20, offset: 0 });
    expect(r.total).toBe(0);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('status');
  });
});

describe('getBroadcastById', () => {
  it('returns broadcast when found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [BASE_ROW] } as never);
    const r = await getBroadcastById(1);
    expect(r?.id).toBe(1);
  });

  it('returns null when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    const r = await getBroadcastById(99);
    expect(r).toBeNull();
  });
});

describe('createBroadcast', () => {
  it('inserts and returns the new broadcast', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [BASE_ROW] } as never);
    const r = await createBroadcast({
      title: 'Test', content_type: 'TEXT', body: 'Hello',
      channels: ['TELEGRAM'], audience_type: 'ALL',
    }, 'admin1');
    expect(r.title).toBe('Test');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO broadcasts');
  });
});

describe('updateBroadcast', () => {
  it('returns null for empty update', async () => {
    const r = await updateBroadcast(1, {});
    expect(r).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updates title and returns broadcast', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...BASE_ROW, title: 'Updated' }] } as never);
    const r = await updateBroadcast(1, { title: 'Updated' });
    expect(r?.title).toBe('Updated');
  });
});

describe('deleteBroadcast', () => {
  it('deletes and returns true when rowCount > 0', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 } as never);
    const r = await deleteBroadcast(1);
    expect(r).toBe(true);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'DRAFT'");
  });

  it('returns false when not found or not a draft', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 } as never);
    const r = await deleteBroadcast(99);
    expect(r).toBe(false);
  });
});

describe('updateBroadcastCounts', () => {
  it('calls UPDATE with provided fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await updateBroadcastCounts(1, { status: 'SENT', success_count: 5, failed_count: 1, recipient_count: 6, sent_at: new Date() });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('UPDATE broadcasts');
    expect(sql).toContain('success_count');
  });
});

describe('resolveAudienceTelegramIds', () => {
  it('ALL: selects all users with telegram_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ telegram_id: '111' }] } as never);
    const ids = await resolveAudienceTelegramIds('ALL');
    expect(ids).toEqual(['111']);
  });

  it('TAG: joins user_tag_assignments', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ telegram_id: '222' }] } as never);
    const ids = await resolveAudienceTelegramIds('TAG', { tagId: 5 });
    expect(ids).toEqual(['222']);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('user_tag_assignments');
  });

  it('VIP: joins customer_tags where name = VIP', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await resolveAudienceTelegramIds('VIP');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("'VIP'");
  });

  it('ACTIVE: filters by last_seen_at within 30 days', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await resolveAudienceTelegramIds('ACTIVE');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('last_seen_at');
    expect(sql).toContain('30 days');
  });

  it('NEVER_DEPOSIT: filters total_deposit = 0', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await resolveAudienceTelegramIds('NEVER_DEPOSIT');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('total_deposit');
  });

  it('SELECTED: uses audience_user_ids', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ telegram_id: '333' }] } as never);
    const ids = await resolveAudienceTelegramIds('SELECTED', { userIds: [10, 20] });
    expect(ids).toEqual(['333']);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('ANY');
  });
});

describe('getAudienceCount', () => {
  it('returns COUNT for ALL', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ telegram_id: '1' }, { telegram_id: '2' }] } as never);
    const n = await getAudienceCount('ALL');
    expect(n).toBe(2);
  });
});

describe('getActiveSessionUserIds', () => {
  it('returns user_id + session_id for open sessions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 1, session_id: 10 }] } as never);
    const r = await getActiveSessionUserIds([1, 2]);
    expect(r[0].session_id).toBe(10);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("IN ('OPEN','ACTIVE')");
  });

  it('returns empty array when userIds is empty', async () => {
    const r = await getActiveSessionUserIds([]);
    expect(r).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
