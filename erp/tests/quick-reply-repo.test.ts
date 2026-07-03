import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pool before importing the module
vi.mock('@/lib/db', () => ({
  default: { query: vi.fn() },
}));

import pool from '@/lib/db';
import {
  getQuickReplies,
  getAllQuickRepliesAdmin,
  getQuickReplyById,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  archiveQuickReply,
  restoreQuickReply,
  incrementQuickReplyUsage,
  setQuickReplyPinned,
  toggleFavoriteQuickReply,
  getRecentlyUsedReplies,
  getPinnedReplies,
  bulkSetCategory,
  bulkSetActive,
  bulkDeleteReplies,
  bulkArchiveReplies,
} from '@/lib/repositories/support_repo';

beforeEach(() => vi.clearAllMocks());

// A full base row matching the new QR_COLS + ML_COLS columns
const baseRow = {
  id: 1,
  category_id: null,
  category_name: null,
  title: 'Hi',
  body: 'Hello',
  caption: null,
  content_type: 'TEXT',
  media_id: null,
  is_active: true,
  sort_order: 0,
  pinned: false,
  archived_at: null,
  archived_by: null,
  usage_count: 0,
  last_used_at: null,
  used_by: null,
  created_by: 'admin1',
  created_at: '2026-01-01',
  updated_by: null,
  updated_at: '2026-01-01',
  is_favorite: false,
  // ML columns (null = no media joined)
  ml_id: null,
  ml_tenant_id: null,
  ml_file_hash: null,
  ml_storage_key: null,
  ml_storage_provider: null,
  ml_media_type: null,
  ml_mime_type: null,
  ml_extension: null,
  ml_original_filename: null,
  ml_display_name: null,
  ml_file_size: null,
  ml_width: null,
  ml_height: null,
  ml_duration: null,
  ml_thumbnail_key: null,
  ml_thumbnail_status: null,
  ml_metadata: null,
  ml_usage_count: null,
  ml_reference_count: null,
  ml_last_used_at: null,
  ml_last_used_module: null,
  ml_download_count: null,
  ml_last_downloaded_at: null,
  ml_created_by: null,
  ml_created_at: null,
  ml_updated_at: null,
  ml_is_active: null,
  ml_deleted_at: null,
  ml_deleted_by: null,
};

// ── 1. getQuickReplies ─────────────────────────────────────────────────────────

describe('getQuickReplies', () => {
  it('returns only active + non-archived rows, mapped to QuickReply', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseRow] } as never);
    const result = await getQuickReplies('admin1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      title: 'Hi',
      body: 'Hello',
      caption: null,
      media: undefined,
      pinned: false,
      usage_count: 0,
    });
    // Verify query filters active + non-archived
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('is_active = TRUE');
    expect(sql).toContain('archived_at IS NULL');
  });
});

// ── 2. getAllQuickRepliesAdmin ─────────────────────────────────────────────────

describe('getAllQuickRepliesAdmin', () => {
  it('default: returns non-archived rows', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseRow] } as never);
    await getAllQuickRepliesAdmin();
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('archived_at IS NULL');
    expect(sql).not.toContain('archived_at IS NOT NULL');
  });

  it('includeArchived=true: returns archived rows', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getAllQuickRepliesAdmin({ includeArchived: true });
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('archived_at IS NOT NULL');
  });
});

// ── 3. getQuickReplyById ──────────────────────────────────────────────────────

describe('getQuickReplyById', () => {
  it('returns null when not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const result = await getQuickReplyById(999);
    expect(result).toBeNull();
  });

  it('returns QuickReply with media_content field', async () => {
    const rowWithContent = { ...baseRow, media_content: null };
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [rowWithContent] } as never);
    const result = await getQuickReplyById(1);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('media_content');
    expect(result!.id).toBe(1);
  });
});

// ── 4. createQuickReply TEXT — no ref-count call ──────────────────────────────

describe('createQuickReply', () => {
  it('TEXT type: inserts without touching reference_count', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [baseRow] } as never);
    const result = await createQuickReply({
      category_id: null,
      title: 'Hi',
      body: 'Hello',
      caption: null,
      content_type: 'TEXT',
      media_id: null,
      sort_order: 0,
      created_by: 'admin1',
    });
    expect(result.title).toBe('Hi');
    // Only 1 query: INSERT — no refcount update
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(1);
  });

  it('IMAGE type with media_id: calls incRefCount after INSERT', async () => {
    const rowWithMedia = { ...baseRow, media_id: 42, content_type: 'IMAGE' };
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [rowWithMedia] } as never) // INSERT
      .mockResolvedValueOnce({ rows: [] } as never);             // reference_count + 1
    await createQuickReply({
      category_id: null,
      title: 'Photo',
      body: '',
      caption: 'A photo',
      content_type: 'IMAGE',
      media_id: 42,
      sort_order: 0,
      created_by: 'admin1',
    });
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(2);
    const refCall = vi.mocked(pool.query).mock.calls[1];
    expect(refCall[0]).toContain('reference_count + 1');
    expect(refCall[1]).toEqual([42]);
  });
});

// ── 5. updateQuickReply — media_id change ─────────────────────────────────────

describe('updateQuickReply', () => {
  it('changing media_id: decrements old, increments new', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ media_id: 10 }] } as never)  // SELECT current
      .mockResolvedValueOnce({ rows: [baseRow] } as never)             // UPDATE
      .mockResolvedValueOnce({ rows: [] } as never)                    // decrement old
      .mockResolvedValueOnce({ rows: [] } as never);                   // increment new
    await updateQuickReply(1, { media_id: 20 });
    const calls = vi.mocked(pool.query).mock.calls;
    expect(calls[2][0]).toContain('reference_count - 1');
    expect(calls[2][1]).toEqual([10]);
    expect(calls[3][0]).toContain('reference_count + 1');
    expect(calls[3][1]).toEqual([20]);
  });

  it('no media_id change: no ref-count calls', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ media_id: null }] } as never) // SELECT current
      .mockResolvedValueOnce({ rows: [baseRow] } as never);             // UPDATE
    await updateQuickReply(1, { title: 'New title' });
    // 2 calls: SELECT + UPDATE, no ref-count calls
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(2);
  });

  it('returns null when row not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never); // SELECT returns nothing
    const result = await updateQuickReply(999, { title: 'x' });
    expect(result).toBeNull();
    // Only 1 query (SELECT) — UPDATE never called
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(1);
  });
});

// ── 6. deleteQuickReply ───────────────────────────────────────────────────────

describe('deleteQuickReply', () => {
  it('with media_id: decrements reference_count', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ media_id: 5 }] } as never) // SELECT current
      .mockResolvedValueOnce({ rows: [] } as never)                  // DELETE
      .mockResolvedValueOnce({ rows: [] } as never);                 // decrement
    await deleteQuickReply(1);
    const calls = vi.mocked(pool.query).mock.calls;
    expect(calls[2][0]).toContain('reference_count - 1');
    expect(calls[2][1]).toEqual([5]);
  });

  it('without media_id: no ref-count call', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ media_id: null }] } as never) // SELECT current
      .mockResolvedValueOnce({ rows: [] } as never);                    // DELETE
    await deleteQuickReply(2);
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(2);
  });
});

// ── 7. archiveQuickReply ──────────────────────────────────────────────────────

describe('archiveQuickReply', () => {
  it('sets archived_at and archived_by', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await archiveQuickReply(1, 'admin1');
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('archived_at = NOW()');
    expect(call[0]).toContain('archived_by');
    expect(call[1]).toEqual([1, 'admin1']);
  });
});

// ── 8. restoreQuickReply ──────────────────────────────────────────────────────

describe('restoreQuickReply', () => {
  it('clears archived_at and archived_by', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await restoreQuickReply(1);
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('archived_at = NULL');
    expect(call[0]).toContain('archived_by = NULL');
    expect(call[1]).toEqual([1]);
  });
});

// ── 9. incrementQuickReplyUsage ───────────────────────────────────────────────

describe('incrementQuickReplyUsage', () => {
  it('updates usage_count, last_used_at, used_by', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await incrementQuickReplyUsage(1, 'admin1');
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('usage_count = usage_count + 1');
    expect(call[0]).toContain('last_used_at = NOW()');
    expect(call[0]).toContain('used_by');
    expect(call[1]).toEqual([1, 'admin1']);
  });
});

// ── 10. setQuickReplyPinned ───────────────────────────────────────────────────

describe('setQuickReplyPinned', () => {
  it('sets pinned = true', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await setQuickReplyPinned(1, true);
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('pinned');
    expect(call[1]).toEqual([1, true]);
  });

  it('sets pinned = false', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await setQuickReplyPinned(1, false);
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[1]).toEqual([1, false]);
  });
});

// ── 11. toggleFavoriteQuickReply ──────────────────────────────────────────────

describe('toggleFavoriteQuickReply', () => {
  it('inserts when isFavorite=true', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await toggleFavoriteQuickReply('admin1', 1, true);
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('INSERT INTO quick_reply_favorites');
  });

  it('deletes when isFavorite=false', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await toggleFavoriteQuickReply('admin1', 1, false);
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('DELETE FROM quick_reply_favorites');
  });
});

// ── 12. getRecentlyUsedReplies ────────────────────────────────────────────────

describe('getRecentlyUsedReplies', () => {
  it('queries with last_used_at IS NOT NULL and archived_at IS NULL', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getRecentlyUsedReplies(10);
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('last_used_at IS NOT NULL');
    expect(call[0]).toContain('archived_at IS NULL');
    expect(call[1]).toEqual([10]);
  });
});

// ── 13. getPinnedReplies ──────────────────────────────────────────────────────

describe('getPinnedReplies', () => {
  it('queries with pinned = TRUE and archived_at IS NULL', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await getPinnedReplies();
    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).toContain('pinned = TRUE');
    expect(sql).toContain('archived_at IS NULL');
  });
});

// ── 14. bulkSetCategory ───────────────────────────────────────────────────────

describe('bulkSetCategory', () => {
  it('uses ANY($3) and passes ids as array', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await bulkSetCategory([1, 2, 3], 5, 'admin1');
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('ANY($3)');
    expect(call[1]).toEqual([5, 'admin1', [1, 2, 3]]);
  });
});

// ── 15. bulkSetActive ─────────────────────────────────────────────────────────

describe('bulkSetActive', () => {
  it('uses ANY($3) with is_active and updated_by', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await bulkSetActive([1, 2], false, 'admin1');
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('ANY($3)');
    expect(call[1]).toEqual([false, 'admin1', [1, 2]]);
  });
});

// ── 16. bulkDeleteReplies ─────────────────────────────────────────────────────

describe('bulkDeleteReplies', () => {
  it('selects media_ids, deletes rows, then decrements each media ref-count', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ media_id: 10 }, { media_id: null }, { media_id: 20 }] } as never) // SELECT
      .mockResolvedValueOnce({ rows: [] } as never)  // DELETE
      .mockResolvedValueOnce({ rows: [] } as never)  // decRef 10
      .mockResolvedValueOnce({ rows: [] } as never); // decRef 20
    await bulkDeleteReplies([1, 2, 3]);
    const calls = vi.mocked(pool.query).mock.calls;
    // call 0: SELECT media_id
    expect(calls[0][0]).toContain('SELECT media_id');
    // call 1: DELETE
    expect(calls[1][0]).toContain('DELETE FROM quick_replies');
    // calls 2+3: decrement for media_id 10 and 20
    const decCalls = calls.slice(2);
    expect(decCalls).toHaveLength(2);
    decCalls.forEach(c => expect(c[0]).toContain('reference_count - 1'));
    const decIds = decCalls.map(c => (c[1] as number[])[0]).sort();
    expect(decIds).toEqual([10, 20]);
  });

  it('no decrement calls when no media_ids', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ media_id: null }] } as never) // SELECT
      .mockResolvedValueOnce({ rows: [] } as never);                    // DELETE
    await bulkDeleteReplies([1]);
    expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(2);
  });
});

// ── 17. bulkArchiveReplies ────────────────────────────────────────────────────

describe('bulkArchiveReplies', () => {
  it('updates archived_at = NOW() for all ids using ANY($2)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await bulkArchiveReplies([1, 2], 'admin1');
    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('archived_at = NOW()');
    expect(call[0]).toContain('ANY($2)');
    expect(call[1]).toEqual(['admin1', [1, 2]]);
  });
});
