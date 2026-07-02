import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn(),
  COOKIE_NAME: 'auth_token',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/media', () => ({
  mediaService: {
    update: vi.fn(),
    softDelete: vi.fn(),
    replace: vi.fn(),
    restore: vi.fn(),
    permanentDelete: vi.fn(),
  },
  MediaValidationError: class MediaValidationError extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.name = 'MediaValidationError';
      this.reason = reason;
    }
  },
}));

vi.mock('@/lib/repositories/media_repo', () => ({
  findMediaById: vi.fn(),
}));

vi.mock('@/lib/repositories/audit_repo', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { GET, PATCH, DELETE } from '../src/app/api/media/[id]/route';
import { POST as replaceRoute } from '../src/app/api/media/[id]/replace/route';
import { POST as restoreRoute } from '../src/app/api/media/[id]/restore/route';
import { DELETE as permanentRoute } from '../src/app/api/media/[id]/permanent/route';
import * as auth from '@/lib/auth';
import * as nextHeaders from 'next/headers';
import * as media from '@/lib/media';
import * as repo from '@/lib/repositories/media_repo';
import { NextRequest } from 'next/server';

const mockRecord = {
  id: 1, fileHash: 'abc', storageKey: 'abc.jpg', mediaType: 'IMAGE',
  mimeType: 'image/jpeg', originalFilename: 'photo.jpg', fileSize: 100,
  displayName: 'photo.jpg', isActive: true, deletedAt: null, referenceCount: 0,
  usageCount: 0, downloadCount: 0,
  createdAt: '2026-07-02T00:00:00Z', updatedAt: '2026-07-02T00:00:00Z',
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeJsonRequest(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest;
}

function makeFormRequest(file: File): NextRequest {
  const fd = new FormData();
  fd.append('file', file);
  return { formData: () => Promise.resolve(fd) } as unknown as NextRequest;
}

function makeFile(name: string, type: string): File {
  return new File(['fake'], name, { type });
}

function mockAuth(role: 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN') {
  vi.mocked(nextHeaders.cookies).mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: 'test-token' }),
  } as never);
  vi.mocked(auth.verifyJWT).mockResolvedValue({ sub: 1, role } as never);
}

function mockUnauth() {
  vi.mocked(nextHeaders.cookies).mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
  } as never);
}

describe('GET /api/media/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockUnauth();
    const res = await GET({} as NextRequest, makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when not found', async () => {
    mockAuth();
    vi.mocked(repo.findMediaById).mockResolvedValueOnce(null);
    const res = await GET({} as NextRequest, makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with media record', async () => {
    mockAuth();
    vi.mocked(repo.findMediaById).mockResolvedValueOnce(mockRecord as never);
    const res = await GET({} as NextRequest, makeParams('1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.media.id).toBe(1);
  });
});

describe('PATCH /api/media/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockUnauth();
    const res = await PATCH(makeJsonRequest({ display_name: 'new' }), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when media not found', async () => {
    mockAuth();
    vi.mocked(media.mediaService.update).mockResolvedValueOnce(null);
    const res = await PATCH(makeJsonRequest({ display_name: 'new' }), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with updated media', async () => {
    mockAuth();
    vi.mocked(media.mediaService.update).mockResolvedValueOnce({ ...mockRecord, displayName: 'updated' } as never);
    const res = await PATCH(makeJsonRequest({ display_name: 'updated' }), makeParams('1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.media.displayName).toBe('updated');
  });
});

describe('DELETE /api/media/[id] (soft delete)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockUnauth();
    const res = await DELETE({} as NextRequest, makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 409 when referenceCount > 0', async () => {
    mockAuth();
    vi.mocked(repo.findMediaById).mockResolvedValueOnce({ ...mockRecord, referenceCount: 3 } as never);
    const res = await DELETE({} as NextRequest, makeParams('1'));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe('REFERENCED');
    expect(body.referenceCount).toBe(3);
  });

  it('returns 200 on successful soft delete', async () => {
    mockAuth();
    vi.mocked(repo.findMediaById).mockResolvedValueOnce({ ...mockRecord, referenceCount: 0 } as never);
    vi.mocked(media.mediaService.softDelete).mockResolvedValueOnce(true);
    const res = await DELETE({} as NextRequest, makeParams('1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('POST /api/media/[id]/replace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockUnauth();
    const res = await replaceRoute(makeFormRequest(makeFile('a.jpg', 'image/jpeg')), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 200 on successful replace', async () => {
    mockAuth();
    vi.mocked(media.mediaService.replace).mockResolvedValueOnce(mockRecord as never);
    const res = await replaceRoute(makeFormRequest(makeFile('photo.jpg', 'image/jpeg')), makeParams('1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('returns 422 for validation error', async () => {
    mockAuth();
    const { MediaValidationError } = await import('@/lib/media');
    vi.mocked(media.mediaService.replace).mockRejectedValueOnce(new MediaValidationError('TOO_LARGE'));
    const res = await replaceRoute(makeFormRequest(makeFile('big.jpg', 'image/jpeg')), makeParams('1'));
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.error).toBe('TOO_LARGE');
  });
});

describe('POST /api/media/[id]/restore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when not SUPER_ADMIN', async () => {
    mockAuth('ADMIN');
    const res = await restoreRoute({} as NextRequest, makeParams('1'));
    expect(res.status).toBe(403);
  });

  it('returns 200 on successful restore', async () => {
    mockAuth('SUPER_ADMIN');
    vi.mocked(media.mediaService.restore).mockResolvedValueOnce(mockRecord as never);
    const res = await restoreRoute({} as NextRequest, makeParams('1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('DELETE /api/media/[id]/permanent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when not SUPER_ADMIN', async () => {
    mockAuth('ADMIN');
    const res = await permanentRoute({} as NextRequest, makeParams('1'));
    expect(res.status).toBe(403);
  });

  it('returns 409 when permanentDelete returns false', async () => {
    mockAuth('SUPER_ADMIN');
    vi.mocked(media.mediaService.permanentDelete).mockResolvedValueOnce(false);
    const res = await permanentRoute({} as NextRequest, makeParams('1'));
    expect(res.status).toBe(409);
  });

  it('returns 200 on successful permanent delete', async () => {
    mockAuth('SUPER_ADMIN');
    vi.mocked(media.mediaService.permanentDelete).mockResolvedValueOnce(true);
    const res = await permanentRoute({} as NextRequest, makeParams('1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
