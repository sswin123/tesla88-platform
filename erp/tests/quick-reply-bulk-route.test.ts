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
  bulkSetCategory: vi.fn(),
  bulkSetActive: vi.fn(),
  bulkDeleteReplies: vi.fn(),
  bulkArchiveReplies: vi.fn(),
  restoreQuickReply: vi.fn(),
  setQuickReplyPinned: vi.fn(),
}));
vi.mock('@/lib/permission_engine', () => ({
  can:             vi.fn().mockResolvedValue(true),
  invalidateCache: vi.fn(),
}));

import { POST } from '@/app/api/livechat/quick-replies/bulk/route';
import {
  bulkSetCategory,
  bulkSetActive,
  bulkDeleteReplies,
  bulkArchiveReplies,
  restoreQuickReply,
  setQuickReplyPinned,
} from '@/lib/repositories/support_repo';

beforeEach(() => vi.clearAllMocks());

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/livechat/quick-replies/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/livechat/quick-replies/bulk', () => {
  it('archive action → calls bulkArchiveReplies', async () => {
    vi.mocked(bulkArchiveReplies).mockResolvedValueOnce(undefined);
    const res = await POST(makeRequest({ action: 'archive', ids: [1, 2, 3] }));
    expect(res.status).toBe(200);
    const d = await res.json() as { ok: boolean; count: number };
    expect(d.ok).toBe(true);
    expect(d.count).toBe(3);
    expect(bulkArchiveReplies).toHaveBeenCalledWith([1, 2, 3], 'admin1');
  });

  it('enable action → calls bulkSetActive with true', async () => {
    vi.mocked(bulkSetActive).mockResolvedValueOnce(undefined);
    const res = await POST(makeRequest({ action: 'enable', ids: [1, 2] }));
    expect(res.status).toBe(200);
    expect(bulkSetActive).toHaveBeenCalledWith([1, 2], true, 'admin1');
  });

  it('disable action → calls bulkSetActive with false', async () => {
    vi.mocked(bulkSetActive).mockResolvedValueOnce(undefined);
    const res = await POST(makeRequest({ action: 'disable', ids: [5] }));
    expect(res.status).toBe(200);
    expect(bulkSetActive).toHaveBeenCalledWith([5], false, 'admin1');
  });

  it('set_category action → calls bulkSetCategory with category_id', async () => {
    vi.mocked(bulkSetCategory).mockResolvedValueOnce(undefined);
    const res = await POST(makeRequest({ action: 'set_category', ids: [1, 2], category_id: 3 }));
    expect(res.status).toBe(200);
    expect(bulkSetCategory).toHaveBeenCalledWith([1, 2], 3, 'admin1');
  });

  it('set_category action with null category_id', async () => {
    vi.mocked(bulkSetCategory).mockResolvedValueOnce(undefined);
    const res = await POST(makeRequest({ action: 'set_category', ids: [1], category_id: null }));
    expect(res.status).toBe(200);
    expect(bulkSetCategory).toHaveBeenCalledWith([1], null, 'admin1');
  });

  it('delete action → calls bulkDeleteReplies', async () => {
    vi.mocked(bulkDeleteReplies).mockResolvedValueOnce(undefined);
    const res = await POST(makeRequest({ action: 'delete', ids: [10, 20] }));
    expect(res.status).toBe(200);
    expect(bulkDeleteReplies).toHaveBeenCalledWith([10, 20]);
  });

  it('pin action → calls setQuickReplyPinned(id, true) for each id', async () => {
    vi.mocked(setQuickReplyPinned).mockResolvedValue(undefined);
    const res = await POST(makeRequest({ action: 'pin', ids: [1, 2] }));
    expect(res.status).toBe(200);
    expect(setQuickReplyPinned).toHaveBeenCalledTimes(2);
    expect(setQuickReplyPinned).toHaveBeenCalledWith(1, true);
    expect(setQuickReplyPinned).toHaveBeenCalledWith(2, true);
  });

  it('unpin action → calls setQuickReplyPinned(id, false) for each id', async () => {
    vi.mocked(setQuickReplyPinned).mockResolvedValue(undefined);
    const res = await POST(makeRequest({ action: 'unpin', ids: [3] }));
    expect(res.status).toBe(200);
    expect(setQuickReplyPinned).toHaveBeenCalledWith(3, false);
  });

  it('restore action → calls restoreQuickReply for each id', async () => {
    vi.mocked(restoreQuickReply).mockResolvedValue(undefined);
    const res = await POST(makeRequest({ action: 'restore', ids: [4, 5] }));
    expect(res.status).toBe(200);
    expect(restoreQuickReply).toHaveBeenCalledTimes(2);
    expect(restoreQuickReply).toHaveBeenCalledWith(4);
    expect(restoreQuickReply).toHaveBeenCalledWith(5);
  });

  it('returns 400 when action is missing', async () => {
    const res = await POST(makeRequest({ ids: [1, 2] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when ids is empty array', async () => {
    const res = await POST(makeRequest({ action: 'archive', ids: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown action', async () => {
    const res = await POST(makeRequest({ action: 'nuke', ids: [1] }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValueOnce({ get: () => undefined } as never);
    const res = await POST(makeRequest({ action: 'archive', ids: [1] }));
    expect(res.status).toBe(401);
  });
});
