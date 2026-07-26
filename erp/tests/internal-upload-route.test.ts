import { vi, describe, it, expect, beforeEach } from 'vitest';

// All vi.mock() calls before any imports of the modules under test

vi.mock('@/lib/media', () => ({
  mediaService: {
    save: vi.fn(),
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

import { POST } from '@/app/api/internal/media/upload/route';
import { mediaService, MediaValidationError } from '@/lib/media';
import type { NextRequest } from 'next/server';

const TOKEN = 'test-internal-token-abc123';

function makeRequest(opts: {
  file?: File | null;
  token?: string | null;
}): NextRequest {
  const { file, token = TOKEN } = opts;
  const form = new FormData();
  if (file) form.append('file', file);

  return {
    headers: {
      get: (name: string) =>
        name === 'authorization'
          ? token !== null ? `Bearer ${token}` : null
          : null,
    },
    formData: () => Promise.resolve(form),
  } as unknown as NextRequest;
}

const FAKE_RECORD = {
  id:               42,
  tenantId:         null,
  storageKey:       'abc123def456.png',
  mimeType:         'image/png',
  fileSize:         1024,
  storageProvider:  'LOCAL',
  mediaType:        'IMAGE' as const,
  originalFilename: 'photo.png',
  displayName:      'photo.png',
  extension:        'png',
  fileHash:         'abc123def456',
  isActive:         true,
  deletedAt:        null,
  deletedBy:        null,
  createdBy:        null,
  referenceCount:   0,
  usageCount:       0,
  downloadCount:    0,
  lastUsedAt:       null,
  lastUsedModule:   null,
  lastDownloadedAt: null,
  thumbnailKey:     null,
  thumbnailStatus:  'NONE' as const,
  metadata:         {},
  width:            null,
  height:           null,
  duration:         null,
  createdAt:        new Date().toISOString(),
  updatedAt:        new Date().toISOString(),
};

describe('POST /api/internal/media/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_RELAY_AUTH_TOKEN = TOKEN;
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = makeRequest({ token: null });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is wrong', async () => {
    const req = makeRequest({ token: 'wrong-token' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when no file is provided', async () => {
    const req = makeRequest({ file: null });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/no file/i);
  });

  it('returns 201 and media_id on successful upload', async () => {
    vi.mocked(mediaService.save).mockResolvedValue({
      record:      FAKE_RECORD,
      isDuplicate: false,
    });

    const file = new File([Buffer.from('fake-png-data')], 'photo.png', { type: 'image/png' });
    const req  = makeRequest({ file });
    const res  = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.media_id).toBe(42);
    expect(body.storage_key).toBe('abc123def456.png');
    expect(body.is_duplicate).toBe(false);
  });

  it('returns 200 (not 201) when file is a duplicate', async () => {
    vi.mocked(mediaService.save).mockResolvedValue({
      record:      FAKE_RECORD,
      isDuplicate: true,
    });

    const file = new File([Buffer.from('fake-png-data')], 'photo.png', { type: 'image/png' });
    const req  = makeRequest({ file });
    const res  = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.is_duplicate).toBe(true);
    expect(body.media_id).toBe(42);
  });

  it('returns 422 when mediaService throws MediaValidationError', async () => {
    vi.mocked(mediaService.save).mockRejectedValue(new MediaValidationError('MIME_NOT_ALLOWED'));

    const file = new File([Buffer.from('data')], 'file.exe', { type: 'application/octet-stream' });
    const req  = makeRequest({ file });
    const res  = await POST(req);

    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('MIME_NOT_ALLOWED');
  });

  it('returns 500 when mediaService throws unexpected error', async () => {
    vi.mocked(mediaService.save).mockRejectedValue(new Error('disk full'));

    const file = new File([Buffer.from('data')], 'photo.png', { type: 'image/png' });
    const req  = makeRequest({ file });
    const res  = await POST(req);

    expect(res.status).toBe(500);
  });

  it('calls mediaService.save with uploadedBy=null', async () => {
    vi.mocked(mediaService.save).mockResolvedValue({
      record:      FAKE_RECORD,
      isDuplicate: false,
    });

    const file = new File([Buffer.from('data')], 'photo.png', { type: 'image/png' });
    const req  = makeRequest({ file });
    await POST(req);

    expect(vi.mocked(mediaService.save)).toHaveBeenCalledWith(
      expect.objectContaining({ uploadedBy: null })
    );
  });
});
