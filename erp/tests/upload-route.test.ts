import { vi, describe, it, expect, beforeEach } from 'vitest';

// All vi.mock() calls must appear before imports of the modules under test

vi.mock('@/lib/auth', () => ({
  verifyJWT: vi.fn(),
  COOKIE_NAME: 'auth_token',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/media', () => ({
  mediaService: { save: vi.fn(), saveMany: vi.fn() },
  MediaValidationError: class MediaValidationError extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.name = 'MediaValidationError';
      this.reason = reason;
    }
  },
}));

vi.mock('@/lib/repositories/audit_repo', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/permission_engine', () => ({
  can:             vi.fn().mockResolvedValue(true),
  invalidateCache: vi.fn(),
}));

import { POST as uploadSingle } from '../src/app/api/media/upload/route';
import { POST as uploadMany } from '../src/app/api/media/upload/many/route';
import * as auth from '@/lib/auth';
import * as nextHeaders from 'next/headers';
import * as media from '@/lib/media';
import { NextRequest } from 'next/server';

const mockRecord = {
  id: 1, fileHash: 'abc', storageKey: 'abc.jpg', mediaType: 'IMAGE',
  mimeType: 'image/jpeg', originalFilename: 'photo.jpg', fileSize: 100,
  displayName: 'photo.jpg', isActive: true, deletedAt: null,
  usageCount: 0, referenceCount: 0, downloadCount: 0,
  createdAt: '2026-07-02T00:00:00Z', updatedAt: '2026-07-02T00:00:00Z',
};

function makeAuthCookies() {
  vi.mocked(nextHeaders.cookies).mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: 'test-token' }),
  } as never);
  vi.mocked(auth.verifyJWT).mockResolvedValue({ sub: 1 } as never);
}

function makeUnauthCookies() {
  vi.mocked(nextHeaders.cookies).mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
  } as never);
}

function makeFormDataRequest(fieldName: string, file: File, extra?: Record<string, string>): NextRequest {
  const fd = new FormData();
  fd.append(fieldName, file);
  if (extra) Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  return { formData: () => Promise.resolve(fd) } as unknown as NextRequest;
}

function makeFile(name: string, type: string, content = 'fake-content'): File {
  return new File([content], name, { type });
}

describe('POST /api/media/upload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    makeUnauthCookies();
    const req = makeFormDataRequest('file', makeFile('a.jpg', 'image/jpeg'));
    const res = await uploadSingle(req);
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when no file provided', async () => {
    makeAuthCookies();
    const fd = new FormData();
    const req = { formData: () => Promise.resolve(fd) } as unknown as NextRequest;
    const res = await uploadSingle(req);
    const body = await res.json();
    expect(res.status).toBe(400);
  });

  it('returns 200 with media record on success', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.save).mockResolvedValueOnce({ record: mockRecord as never, isDuplicate: false });
    const req = makeFormDataRequest('file', makeFile('photo.jpg', 'image/jpeg'));
    const res = await uploadSingle(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.isDuplicate).toBe(false);
    expect(body.media.id).toBe(1);
  });

  it('returns isDuplicate=true for duplicate file', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.save).mockResolvedValueOnce({ record: mockRecord as never, isDuplicate: true });
    const req = makeFormDataRequest('file', makeFile('photo.jpg', 'image/jpeg'));
    const res = await uploadSingle(req);
    const body = await res.json();
    expect(body.isDuplicate).toBe(true);
  });

  it('returns 422 for MediaValidationError (TOO_LARGE)', async () => {
    makeAuthCookies();
    const { MediaValidationError } = await import('@/lib/media');
    vi.mocked(media.mediaService.save).mockRejectedValueOnce(new MediaValidationError('TOO_LARGE'));
    const req = makeFormDataRequest('file', makeFile('big.jpg', 'image/jpeg'));
    const res = await uploadSingle(req);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.error).toBe('TOO_LARGE');
  });

  it('returns 500 for unexpected storage error', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.save).mockRejectedValueOnce(new Error('disk full'));
    const req = makeFormDataRequest('file', makeFile('photo.jpg', 'image/jpeg'));
    const res = await uploadSingle(req);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('Upload failed');
  });
});

describe('POST /api/media/upload/many', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    makeUnauthCookies();
    const fd = new FormData();
    fd.append('files', makeFile('a.jpg', 'image/jpeg'));
    const req = { formData: () => Promise.resolve(fd) } as unknown as NextRequest;
    const res = await uploadMany(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when no files provided', async () => {
    makeAuthCookies();
    const fd = new FormData();
    const req = { formData: () => Promise.resolve(fd) } as unknown as NextRequest;
    const res = await uploadMany(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with results array for valid batch', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.save).mockResolvedValue({ record: mockRecord as never, isDuplicate: false });
    const fd = new FormData();
    fd.append('files', makeFile('a.jpg', 'image/jpeg'));
    fd.append('files', makeFile('b.png', 'image/png'));
    const req = { formData: () => Promise.resolve(fd) } as unknown as NextRequest;
    const res = await uploadMany(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(2);
  });

  it('returns per-file errors for validation failures in batch', async () => {
    makeAuthCookies();
    const { MediaValidationError } = await import('@/lib/media');
    vi.mocked(media.mediaService.save)
      .mockResolvedValueOnce({ record: mockRecord as never, isDuplicate: false })
      .mockRejectedValueOnce(new MediaValidationError('EXTENSION_NOT_ALLOWED'));
    const fd = new FormData();
    fd.append('files', makeFile('ok.jpg', 'image/jpeg'));
    fd.append('files', makeFile('bad.exe', 'application/x-msdownload'));
    const req = { formData: () => Promise.resolve(fd) } as unknown as NextRequest;
    const res = await uploadMany(req);
    const body = await res.json();
    expect(body.results[0]).toHaveProperty('media');
    expect(body.results[1]).toHaveProperty('error', 'EXTENSION_NOT_ALLOWED');
  });

  it('returns 422 when more than 20 files submitted', async () => {
    makeAuthCookies();
    const fd = new FormData();
    for (let i = 0; i < 21; i++) fd.append('files', makeFile(`f${i}.jpg`, 'image/jpeg'));
    const req = { formData: () => Promise.resolve(fd) } as unknown as NextRequest;
    const res = await uploadMany(req);
    expect(res.status).toBe(422);
  });
});
