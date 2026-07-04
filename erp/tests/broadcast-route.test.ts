import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN' }),
  COOKIE_NAME: 'token',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));
vi.mock('@/lib/repositories/broadcast_repo', () => ({
  getBroadcasts:              vi.fn(),
  getBroadcastById:           vi.fn(),
  createBroadcast:            vi.fn(),
  updateBroadcast:            vi.fn(),
  deleteBroadcast:            vi.fn(),
  updateBroadcastCounts:      vi.fn(),
  getAudienceCount:           vi.fn(),
}));
vi.mock('@/lib/broadcast/send', () => ({
  sendBroadcast: vi.fn(),
}));
vi.mock('@/lib/repositories/audit_repo', () => ({
  logAudit: vi.fn(),
}));

import { GET as listGet, POST as listPost } from '@/app/api/broadcast/route';
import { GET as detailGet, PATCH, DELETE } from '@/app/api/broadcast/[id]/route';
import { POST as sendPost } from '@/app/api/broadcast/[id]/send/route';
import { GET as countGet } from '@/app/api/broadcast/audience-count/route';
import {
  getBroadcasts, getBroadcastById, createBroadcast,
  updateBroadcast, deleteBroadcast, getAudienceCount,
} from '@/lib/repositories/broadcast_repo';
import { sendBroadcast } from '@/lib/broadcast/send';

const BASE = {
  id: 1, title: 'Test', content_type: 'TEXT' as const, body: 'Hello',
  caption: null, media_id: null, channels: ['TELEGRAM'] as import('@/lib/types').BroadcastChannel[],
  audience_type: 'ALL' as const, audience_tag_id: null, audience_tag_name: null,
  audience_user_ids: null, status: 'DRAFT' as const,
  scheduled_at: null, sent_at: null, recipient_count: 0,
  success_count: 0, failed_count: 0, created_by: 'admin1',
  created_at: '2026-01-01', updated_at: '2026-01-01',
};

beforeEach(() => vi.clearAllMocks());

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/broadcast', () => {
  it('returns paginated list', async () => {
    vi.mocked(getBroadcasts).mockResolvedValueOnce({ data: [BASE], total: 1 });
    const res = await listGet(new NextRequest('http://localhost/api/broadcast'));
    const d = await res.json() as { data: unknown[]; total: number };
    expect(res.status).toBe(200);
    expect(d.data).toHaveLength(1);
    expect(d.total).toBe(1);
  });
});

describe('POST /api/broadcast', () => {
  it('creates a draft broadcast', async () => {
    vi.mocked(createBroadcast).mockResolvedValueOnce(BASE);
    const res = await listPost(new NextRequest('http://localhost/api/broadcast', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test', content_type: 'TEXT', body: 'Hello', channels: ['TELEGRAM'], audience_type: 'ALL' }),
    }));
    expect(res.status).toBe(201);
    expect(vi.mocked(createBroadcast)).toHaveBeenCalled();
  });

  it('returns 400 when title is missing', async () => {
    const res = await listPost(new NextRequest('http://localhost/api/broadcast', {
      method: 'POST',
      body: JSON.stringify({ content_type: 'TEXT', body: 'Hi', channels: ['TELEGRAM'], audience_type: 'ALL' }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when channels is empty', async () => {
    const res = await listPost(new NextRequest('http://localhost/api/broadcast', {
      method: 'POST',
      body: JSON.stringify({ title: 'T', content_type: 'TEXT', body: 'Hi', channels: [], audience_type: 'ALL' }),
    }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/broadcast/audience-count', () => {
  it('returns count for ALL', async () => {
    vi.mocked(getAudienceCount).mockResolvedValueOnce(50);
    const res = await countGet(new NextRequest('http://localhost/api/broadcast/audience-count?type=ALL'));
    const d = await res.json() as { count: number };
    expect(d.count).toBe(50);
  });
});

describe('GET /api/broadcast/[id]', () => {
  it('returns 404 when not found', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(null);
    const res = await detailGet(new NextRequest('http://localhost/api/broadcast/99'), params('99'));
    expect(res.status).toBe(404);
  });

  it('returns broadcast when found', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE);
    const res = await detailGet(new NextRequest('http://localhost/api/broadcast/1'), params('1'));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/broadcast/[id]', () => {
  it('updates and returns broadcast', async () => {
    vi.mocked(updateBroadcast).mockResolvedValueOnce({ ...BASE, title: 'Updated' });
    const res = await PATCH(
      new NextRequest('http://localhost/api/broadcast/1', { method: 'PATCH', body: JSON.stringify({ title: 'Updated' }) }),
      params('1')
    );
    const d = await res.json() as { ok: boolean; broadcast: { title: string } };
    expect(d.ok).toBe(true);
    expect(d.broadcast.title).toBe('Updated');
  });
});

describe('DELETE /api/broadcast/[id]', () => {
  it('returns 200 when deleted', async () => {
    vi.mocked(deleteBroadcast).mockResolvedValueOnce(true);
    const res = await DELETE(new NextRequest('http://localhost/api/broadcast/1', { method: 'DELETE' }), params('1'));
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found or not a draft', async () => {
    vi.mocked(deleteBroadcast).mockResolvedValueOnce(false);
    const res = await DELETE(new NextRequest('http://localhost/api/broadcast/1', { method: 'DELETE' }), params('1'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/broadcast/[id]/send', () => {
  it('triggers sendBroadcast and returns result', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE);
    vi.mocked(sendBroadcast).mockResolvedValueOnce({ sent: 5, failed: 0, total: 5, livechat_inserted: 0 });
    const res = await sendPost(
      new NextRequest('http://localhost/api/broadcast/1/send', { method: 'POST' }),
      params('1')
    );
    const d = await res.json() as { ok: boolean; sent: number };
    expect(d.ok).toBe(true);
    expect(d.sent).toBe(5);
  });

  it('returns 400 when broadcast is not in DRAFT or SCHEDULED status', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce({ ...BASE, status: 'SENT' as const });
    const res = await sendPost(
      new NextRequest('http://localhost/api/broadcast/1/send', { method: 'POST', body: JSON.stringify({}) }),
      params('1')
    );
    expect(res.status).toBe(400);
  });

  it('schedules when scheduled_at is provided and in the future', async () => {
    vi.mocked(getBroadcastById).mockResolvedValueOnce(BASE);
    vi.mocked(updateBroadcast).mockResolvedValueOnce({ ...BASE, status: 'SCHEDULED' as const });
    const future = new Date(Date.now() + 3600_000).toISOString();
    const res = await sendPost(
      new NextRequest('http://localhost/api/broadcast/1/send', {
        method: 'POST',
        body: JSON.stringify({ scheduled_at: future }),
      }),
      params('1')
    );
    const d = await res.json() as { ok: boolean; status: string };
    expect(d.ok).toBe(true);
    expect(d.status).toBe('SCHEDULED');
    expect(vi.mocked(sendBroadcast)).not.toHaveBeenCalled();
  });
});
