import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/repositories/broadcast_repo', () => ({
  getBroadcastById: vi.fn(),
  resolveAudienceTelegramIds: vi.fn(),
  updateBroadcastCounts: vi.fn(),
  getActiveSessionUserIds: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  getBroadcastById,
  resolveAudienceTelegramIds,
  updateBroadcastCounts,
  getActiveSessionUserIds,
} from '@/lib/repositories/broadcast_repo';
import pool from '@/lib/db';
import { sendBroadcast } from '@/lib/broadcast/send';
import type { Broadcast } from '@/lib/types';

const BASE_BROADCAST: Broadcast = {
  id: 1, title: 'Hello', content_type: 'TEXT', body: 'Hi there',
  caption: null, media_id: null, channels: ['TELEGRAM'],
  audience_type: 'ALL', audience_tag_id: null,
  audience_user_ids: null, status: 'DRAFT',
  scheduled_at: null, sent_at: null,
  recipient_count: 0, success_count: 0, failed_count: 0,
  created_by: 'admin1', created_at: '2026-01-01', updated_at: '2026-01-01',
  audience_tag_name: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BOT_RELAY_URL = 'http://relay:8090';
  process.env.BOT_RELAY_AUTH_TOKEN = 'test_token';
});

describe('sendBroadcast', () => {
  it('returns error result when broadcast not found', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(null);
    const r = await sendBroadcast(99);
    expect(r.sent).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.total).toBe(0);
  });

  it('sends TEXT to all telegram_ids and returns counts', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE_BROADCAST);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111', '222']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const r = await sendBroadcast(1);
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(0);
    expect(r.total).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('counts relay failures correctly', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE_BROADCAST);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111', '222']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const r = await sendBroadcast(1);
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(1);
  });

  it('handles relay 404 gracefully (endpoint not implemented)', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE_BROADCAST);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const r = await sendBroadcast(1);
    // relay 404 = endpoint not available; treat as 0 sent but not a hard failure
    expect(r.sent).toBe(0);
    expect(r.total).toBe(1);
  });

  it('sends non-TEXT using caption as text fallback', async () => {
    const imgBroadcast = { ...BASE_BROADCAST, content_type: 'IMAGE' as const, caption: 'Check this out' };
    vi.mocked(getBroadcastById).mockResolvedValueOnce(imgBroadcast);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendBroadcast(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { message: string };
    expect(body.message).toBe('Check this out');
  });

  it('inserts livechat messages for LIVECHAT channel', async () => {
    const lcBroadcast = { ...BASE_BROADCAST, channels: ['TELEGRAM', 'LIVECHAT'] as ('TELEGRAM' | 'LIVECHAT')[] };
    vi.mocked(getBroadcastById).mockResolvedValueOnce(lcBroadcast);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([{ user_id: 1, session_id: 10 }]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);

    const r = await sendBroadcast(1);
    expect(r.livechat_inserted).toBe(1);
    expect(vi.mocked(pool.query)).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO support_messages'),
      expect.any(Array)
    );
  });

  it('calls updateBroadcastCounts with SENT when all succeed', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE_BROADCAST);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await sendBroadcast(1);
    expect(vi.mocked(updateBroadcastCounts)).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'SENT' })
    );
  });

  it('calls updateBroadcastCounts with PARTIALLY_SENT on partial failure', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE_BROADCAST);
    vi.mocked(resolveAudienceTelegramIds).mockResolvedValueOnce(['111', '222']);
    vi.mocked(updateBroadcastCounts).mockResolvedValue(undefined);
    vi.mocked(getActiveSessionUserIds).mockResolvedValueOnce([]);
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    await sendBroadcast(1);
    expect(vi.mocked(updateBroadcastCounts)).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'PARTIALLY_SENT' })
    );
  });
});
