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
  updateQuickReply: vi.fn(),
  archiveQuickReply: vi.fn(),
  restoreQuickReply: vi.fn(),
  deleteQuickReply: vi.fn(),
  toggleFavoriteQuickReply: vi.fn(),
  setQuickReplyPinned: vi.fn(),
}));

import { PATCH, DELETE } from '@/app/api/livechat/quick-replies/[id]/route';
import {
  updateQuickReply,
  archiveQuickReply,
  restoreQuickReply,
  deleteQuickReply,
  toggleFavoriteQuickReply,
  setQuickReplyPinned,
} from '@/lib/repositories/support_repo';

const BASE_REPLY = {
  id: 1, title: 'Hi', body: 'Hello', caption: null, content_type: 'TEXT' as const,
  media_id: null, is_active: true, sort_order: 0, is_favorite: false,
  category_id: null, category_name: null,
  pinned: false, archived_at: null, archived_by: null,
  usage_count: 0, last_used_at: null, used_by: null,
  created_by: 'admin1', created_at: '2026-01-01',
  updated_by: null, updated_at: '2026-01-01',
};

beforeEach(() => vi.clearAllMocks());

const makeParams = (id: string) =>
  ({ params: Promise.resolve({ id }) }) as { params: Promise<{ id: string }> };

describe('PATCH /api/livechat/quick-replies/:id', () => {
  it('updates is_active field', async () => {
    vi.mocked(updateQuickReply).mockResolvedValueOnce({ ...BASE_REPLY, is_active: false });
    const res = await PATCH(
      new NextRequest('http://localhost/api/livechat/quick-replies/1', {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(updateQuickReply).toHaveBeenCalledWith(1, { is_active: false }, 'admin1');
  });

  it('calls setQuickReplyPinned for pinned field', async () => {
    vi.mocked(setQuickReplyPinned).mockResolvedValueOnce(undefined);
    const res = await PATCH(
      new NextRequest('http://localhost/api/livechat/quick-replies/1', {
        method: 'PATCH',
        body: JSON.stringify({ pinned: true }),
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(setQuickReplyPinned).toHaveBeenCalledWith(1, true);
    expect(updateQuickReply).not.toHaveBeenCalled();
  });

  it('calls toggleFavoriteQuickReply for is_favorite', async () => {
    vi.mocked(toggleFavoriteQuickReply).mockResolvedValueOnce(undefined);
    const res = await PATCH(
      new NextRequest('http://localhost/api/livechat/quick-replies/1', {
        method: 'PATCH',
        body: JSON.stringify({ is_favorite: true }),
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(toggleFavoriteQuickReply).toHaveBeenCalledWith('admin1', 1, true);
    expect(updateQuickReply).not.toHaveBeenCalled();
  });

  it('calls restoreQuickReply when restore:true', async () => {
    vi.mocked(restoreQuickReply).mockResolvedValueOnce(undefined);
    const res = await PATCH(
      new NextRequest('http://localhost/api/livechat/quick-replies/1', {
        method: 'PATCH',
        body: JSON.stringify({ restore: true }),
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(restoreQuickReply).toHaveBeenCalledWith(1);
    expect(updateQuickReply).not.toHaveBeenCalled();
  });

  it('updates media_id field', async () => {
    const updated = { ...BASE_REPLY, media_id: 7, content_type: 'IMAGE' as const };
    vi.mocked(updateQuickReply).mockResolvedValueOnce(updated);
    const res = await PATCH(
      new NextRequest('http://localhost/api/livechat/quick-replies/1', {
        method: 'PATCH',
        body: JSON.stringify({ media_id: 7, content_type: 'IMAGE' }),
      }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    expect(updateQuickReply).toHaveBeenCalledWith(1, { media_id: 7, content_type: 'IMAGE' }, 'admin1');
  });

  it('returns 400 for invalid id', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost/api/livechat/quick-replies/abc', {
        method: 'PATCH',
        body: JSON.stringify({ is_active: true }),
      }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
    expect(updateQuickReply).not.toHaveBeenCalled();
  });

  it('returns 404 when updateQuickReply returns null', async () => {
    vi.mocked(updateQuickReply).mockResolvedValueOnce(null);
    const res = await PATCH(
      new NextRequest('http://localhost/api/livechat/quick-replies/999', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'New title' }),
      }),
      makeParams('999'),
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/livechat/quick-replies/:id', () => {
  it('archives (not hard-deletes) the reply', async () => {
    vi.mocked(archiveQuickReply).mockResolvedValueOnce(undefined);
    const res = await DELETE(
      new NextRequest('http://localhost/api/livechat/quick-replies/1', { method: 'DELETE' }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const d = await res.json() as { ok: boolean };
    expect(d.ok).toBe(true);
    expect(archiveQuickReply).toHaveBeenCalledWith(1, 'admin1');
    expect(deleteQuickReply).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid id', async () => {
    const res = await DELETE(
      new NextRequest('http://localhost/api/livechat/quick-replies/abc', { method: 'DELETE' }),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
    expect(archiveQuickReply).not.toHaveBeenCalled();
  });
});
