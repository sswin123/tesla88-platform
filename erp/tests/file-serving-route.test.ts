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
    getBuffer: vi.fn(),
    getPreview: vi.fn(),
    recordDownload: vi.fn(),
  },
}));
vi.mock('@/lib/permission_engine', () => ({
  can:             vi.fn().mockResolvedValue(true),
  invalidateCache: vi.fn(),
}));

import { GET as serveFile } from '../src/app/api/media/[id]/file/route';
import { GET as serveThumbnail } from '../src/app/api/media/[id]/thumbnail/route';
import * as auth from '@/lib/auth';
import * as nextHeaders from 'next/headers';
import * as media from '@/lib/media';
import { NextRequest } from 'next/server';

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(searchParams?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/media/1/file');
  if (searchParams) Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  return { nextUrl: url } as unknown as NextRequest;
}

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

const mockBuffer = {
  buffer: Buffer.from('fake-image-bytes'),
  mimeType: 'image/jpeg',
  filename: 'photo.jpg',
};

describe('GET /api/media/[id]/file', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    makeUnauthCookies();
    const res = await serveFile(makeRequest(), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-numeric id', async () => {
    makeAuthCookies();
    const res = await serveFile(makeRequest(), makeParams('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when media not found', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.getBuffer).mockResolvedValueOnce(null);
    const res = await serveFile(makeRequest(), makeParams('999'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with correct Content-Type for existing file', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.getBuffer).mockResolvedValueOnce(mockBuffer);
    const res = await serveFile(makeRequest(), makeParams('1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('sets Content-Disposition: inline when no download param', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.getBuffer).mockResolvedValueOnce(mockBuffer);
    const res = await serveFile(makeRequest(), makeParams('1'));
    expect(res.headers.get('Content-Disposition')).toContain('inline');
  });

  it('sets Content-Disposition: attachment when ?download=1', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.getBuffer).mockResolvedValueOnce(mockBuffer);
    const res = await serveFile(makeRequest({ download: '1' }), makeParams('1'));
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
  });

  it('sets Cache-Control: immutable for file serving', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.getBuffer).mockResolvedValueOnce(mockBuffer);
    const res = await serveFile(makeRequest(), makeParams('1'));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('sets ETag header', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.getBuffer).mockResolvedValueOnce(mockBuffer);
    const res = await serveFile(makeRequest(), makeParams('1'));
    expect(res.headers.get('ETag')).toBeTruthy();
  });

  it('sets Content-Length matching buffer size', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.getBuffer).mockResolvedValueOnce(mockBuffer);
    const res = await serveFile(makeRequest(), makeParams('1'));
    expect(res.headers.get('Content-Length')).toBe(String(mockBuffer.buffer.length));
  });

  it('calls recordDownload for successful file serve', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.getBuffer).mockResolvedValueOnce(mockBuffer);
    await serveFile(makeRequest(), makeParams('1'));
    expect(media.mediaService.recordDownload).toHaveBeenCalledWith(1);
  });
});

describe('GET /api/media/[id]/thumbnail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    makeUnauthCookies();
    const res = await serveThumbnail(makeRequest(), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when media not found', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.getPreview).mockResolvedValueOnce(null);
    const res = await serveThumbnail(makeRequest(), makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with original file as fallback (Phase 5.4A)', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.getPreview).mockResolvedValueOnce({
      buffer: mockBuffer.buffer,
      mimeType: 'image/jpeg',
    });
    const res = await serveThumbnail(makeRequest(), makeParams('1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('sets Cache-Control: max-age=3600 for thumbnail', async () => {
    makeAuthCookies();
    vi.mocked(media.mediaService.getPreview).mockResolvedValueOnce({
      buffer: mockBuffer.buffer,
      mimeType: 'image/jpeg',
    });
    const res = await serveThumbnail(makeRequest(), makeParams('1'));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });
});
