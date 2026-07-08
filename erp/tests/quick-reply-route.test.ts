import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN' }),
  COOKIE_NAME: 'token',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));
vi.mock('@/lib/repositories/support_repo', () => ({
  getQuickReplies: vi.fn(),
  getAllQuickRepliesAdmin: vi.fn(),
  getQuickReplyCategories: vi.fn(),
  createQuickReply: vi.fn(),
  getPinnedReplies: vi.fn(),
  getRecentlyUsedReplies: vi.fn(),
}));
vi.mock('@/lib/permission_engine', () => ({
  can:             vi.fn().mockResolvedValue(true),
  invalidateCache: vi.fn(),
}));

import { GET, POST } from '@/app/api/livechat/quick-replies/route';
import {
  getAllQuickRepliesAdmin,
  getQuickReplies,
  getQuickReplyCategories,
  createQuickReply,
  getPinnedReplies,
  getRecentlyUsedReplies,
} from '@/lib/repositories/support_repo';

const BASE_REPLY = {
  id: 1, category_id: null, category_name: null, title: 'Hi', body: 'Hello',
  caption: null, content_type: 'TEXT' as const, media_id: null,
  is_active: true, sort_order: 0, is_favorite: false,
  pinned: false, archived_at: null, archived_by: null,
  usage_count: 0, last_used_at: null, used_by: null,
  created_by: 'admin1', created_at: '2026-01-01',
  updated_by: null, updated_at: '2026-01-01',
};

beforeEach(() => vi.clearAllMocks());

describe('GET /api/livechat/quick-replies', () => {
  it('returns replies+categories in ReplyBox mode (no ?admin)', async () => {
    vi.mocked(getQuickReplies).mockResolvedValueOnce([BASE_REPLY]);
    vi.mocked(getQuickReplyCategories).mockResolvedValueOnce([]);
    const res = await GET(new NextRequest('http://localhost/api/livechat/quick-replies'));
    const d = await res.json() as { replies: unknown[]; categories: unknown[] };
    expect(res.status).toBe(200);
    expect(d.replies).toHaveLength(1);
    expect(d.categories).toHaveLength(0);
    expect(getQuickReplies).toHaveBeenCalledTimes(1);
    expect(getAllQuickRepliesAdmin).not.toHaveBeenCalled();
  });

  it('returns admin list when ?admin=1', async () => {
    vi.mocked(getAllQuickRepliesAdmin).mockResolvedValueOnce([BASE_REPLY]);
    vi.mocked(getPinnedReplies).mockResolvedValueOnce([]);
    vi.mocked(getRecentlyUsedReplies).mockResolvedValueOnce([]);
    vi.mocked(getQuickReplyCategories).mockResolvedValueOnce([]);
    const res = await GET(new NextRequest('http://localhost/api/livechat/quick-replies?admin=1'));
    const d = await res.json() as { replies: unknown[]; pinned: unknown[]; recent: unknown[]; categories: unknown[] };
    expect(res.status).toBe(200);
    expect(d.replies).toHaveLength(1);
    expect(d.pinned).toBeDefined();
    expect(d.recent).toBeDefined();
    expect(d.categories).toBeDefined();
    expect(getAllQuickRepliesAdmin).toHaveBeenCalledWith({ includeArchived: false });
    expect(getQuickReplies).not.toHaveBeenCalled();
    expect(getPinnedReplies).toHaveBeenCalledTimes(1);
    expect(getRecentlyUsedReplies).toHaveBeenCalledWith(20);
  });

  it('returns archived list when ?admin=1&archived=1', async () => {
    vi.mocked(getAllQuickRepliesAdmin).mockResolvedValueOnce([BASE_REPLY]);
    vi.mocked(getQuickReplyCategories).mockResolvedValueOnce([]);
    const res = await GET(new NextRequest('http://localhost/api/livechat/quick-replies?admin=1&archived=1'));
    const d = await res.json() as { replies: unknown[]; pinned: unknown[]; recent: unknown[]; categories: unknown[] };
    expect(res.status).toBe(200);
    expect(getAllQuickRepliesAdmin).toHaveBeenCalledWith({ includeArchived: true });
    expect(d.pinned).toEqual([]);
    expect(d.recent).toEqual([]);
    expect(getPinnedReplies).not.toHaveBeenCalled();
    expect(getRecentlyUsedReplies).not.toHaveBeenCalled();
  });
});

describe('POST /api/livechat/quick-replies', () => {
  it('creates TEXT reply (201)', async () => {
    vi.mocked(createQuickReply).mockResolvedValueOnce(BASE_REPLY);
    const res = await POST(new NextRequest('http://localhost/api/livechat/quick-replies', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hi', body: 'Hello', content_type: 'TEXT' }),
    }));
    expect(res.status).toBe(201);
    expect(createQuickReply).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Hi', body: 'Hello', content_type: 'TEXT', media_id: null,
    }));
  });

  it('creates IMAGE reply with media_id (201)', async () => {
    const reply = { ...BASE_REPLY, content_type: 'IMAGE' as const, media_id: 5, caption: 'A photo' };
    vi.mocked(createQuickReply).mockResolvedValueOnce(reply);
    const res = await POST(new NextRequest('http://localhost/api/livechat/quick-replies', {
      method: 'POST',
      body: JSON.stringify({ title: 'Photo', body: '', content_type: 'IMAGE', media_id: 5, caption: 'A photo' }),
    }));
    expect(res.status).toBe(201);
    expect(createQuickReply).toHaveBeenCalledWith(expect.objectContaining({
      media_id: 5, caption: 'A photo', content_type: 'IMAGE',
    }));
  });

  it('returns 400 when title missing', async () => {
    const res = await POST(new NextRequest('http://localhost/api/livechat/quick-replies', {
      method: 'POST',
      body: JSON.stringify({ body: 'text', content_type: 'TEXT' }),
    }));
    expect(res.status).toBe(400);
    expect(createQuickReply).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid content_type', async () => {
    const res = await POST(new NextRequest('http://localhost/api/livechat/quick-replies', {
      method: 'POST',
      body: JSON.stringify({ title: 'X', content_type: 'INVALID' }),
    }));
    expect(res.status).toBe(400);
    expect(createQuickReply).not.toHaveBeenCalled();
  });

  it('returns 400 for TEXT type without body', async () => {
    const res = await POST(new NextRequest('http://localhost/api/livechat/quick-replies', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hi', content_type: 'TEXT' }),
    }));
    expect(res.status).toBe(400);
    expect(createQuickReply).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce(null as never);
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValueOnce({ get: () => undefined } as never);
    const res = await POST(new NextRequest('http://localhost/api/livechat/quick-replies', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hi', body: 'Hello', content_type: 'TEXT' }),
    }));
    expect(res.status).toBe(401);
  });
});
