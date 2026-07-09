import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyJWT:   vi.fn().mockResolvedValue({ sub: 1, username: 'admin', role: 'SUPER_ADMIN', iat: 0, exp: 9999999999 }),
  COOKIE_NAME: 'erp_session',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

vi.mock('@/lib/permission_engine', () => ({
  can: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/repositories/audit_repo', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

const mockSave = vi.fn();
vi.mock('@/lib/media', () => ({
  mediaService: { save: (...a: unknown[]) => mockSave(...a) },
  MediaValidationError: class MediaValidationError extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.reason = reason;
      this.name = 'MediaValidationError';
    }
  },
}));

import { POST as uploadPost } from '@/app/api/media/upload/route';
import { MediaValidationError } from '@/lib/media';

beforeEach(() => vi.clearAllMocks());

function makeUploadReq(file: File) {
  const form = new FormData();
  form.append('file', file, file.name);
  return new NextRequest('http://localhost/api/media/upload', {
    method: 'POST',
    body: form,
  });
}

describe('Media upload security', () => {
  it('returns 422 when MIME type is not allowed', async () => {
    mockSave.mockRejectedValueOnce(new MediaValidationError('MIME_NOT_ALLOWED'));
    const file = new File(['<script>alert(1)</script>'], 'evil.html', { type: 'text/html' });
    const res = await uploadPost(makeUploadReq(file));
    expect(res.status).toBe(422);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('MIME_NOT_ALLOWED');
  });

  it('returns 422 when file extension is not allowed', async () => {
    mockSave.mockRejectedValueOnce(new MediaValidationError('EXTENSION_NOT_ALLOWED'));
    const file = new File(['binary'], 'malware.exe', { type: 'application/octet-stream' });
    const res = await uploadPost(makeUploadReq(file));
    expect(res.status).toBe(422);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('EXTENSION_NOT_ALLOWED');
  });

  it('returns 422 when file is too large', async () => {
    mockSave.mockRejectedValueOnce(new MediaValidationError('TOO_LARGE'));
    const file = new File(['x'.repeat(1000)], 'huge.png', { type: 'image/png' });
    const res = await uploadPost(makeUploadReq(file));
    expect(res.status).toBe(422);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('TOO_LARGE');
  });

  it('returns 401 when not authenticated', async () => {
    const { can } = await import('@/lib/permission_engine');
    vi.mocked(can).mockResolvedValueOnce(false);
    const file = new File(['data'], 'test.png', { type: 'image/png' });
    const res = await uploadPost(makeUploadReq(file));
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid upload', async () => {
    const mockRecord = {
      id: 1, originalFilename: 'photo.png', mimeType: 'image/png',
      fileSize: 1024, mediaType: 'IMAGE', storageKey: 'abc.png',
    };
    mockSave.mockResolvedValueOnce({ record: mockRecord, isDuplicate: false });
    const file = new File(['PNG data'], 'photo.png', { type: 'image/png' });
    const res = await uploadPost(makeUploadReq(file));
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('returns 400 when no file provided', async () => {
    const form = new FormData();
    const req = new NextRequest('http://localhost/api/media/upload', {
      method: 'POST',
      body: form,
    });
    const res = await uploadPost(req);
    expect(res.status).toBe(400);
  });
});
