// vi.mock() is hoisted above all static imports by Vitest's transformer,
// so media_repo is mocked before media-service.ts tries to import it.
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// Mock DB repository — prevents pool connection attempts in test environment
vi.mock('@/lib/repositories/media_repo', () => ({
  insertMedia: vi.fn(),
  findMediaById: vi.fn(),
  findMediaByHash: vi.fn(),
  findMediaByStorageKey: vi.fn(),
  updateMedia: vi.fn(),
  updateMediaFile: vi.fn(),
  softDeleteMedia: vi.fn(),
  restoreMedia: vi.fn(),
  hardDeleteMedia: vi.fn(),
  incrementDownloadCount: vi.fn(),
  incrementUsageCount: vi.fn(),
  incrementReferenceCount: vi.fn(),
  decrementReferenceCount: vi.fn(),
  listMedia: vi.fn(),
  searchMedia: vi.fn(),
  getMediaStats: vi.fn(),
}));

import { FilesystemProvider } from '../src/lib/media/filesystem-provider';
import { MediaServiceImpl } from '../src/lib/media/media-service';
import { MediaValidationError } from '../src/lib/media/types';
import * as repo from '@/lib/repositories/media_repo';

let tmpDir: string;

const mockRecord = {
  id: 1, tenantId: null, fileHash: 'abc123', storageKey: 'abc123.jpg',
  storageProvider: 'LOCAL', mediaType: 'IMAGE' as const, mimeType: 'image/jpeg',
  extension: 'jpg', originalFilename: 'photo.jpg', displayName: 'photo.jpg',
  fileSize: 14, width: null, height: null, duration: null, thumbnailKey: null,
  thumbnailStatus: 'NONE' as const, metadata: {}, usageCount: 0, referenceCount: 0,
  lastUsedAt: null, lastUsedModule: null, downloadCount: 0, lastDownloadedAt: null,
  createdBy: 1, createdAt: '2026-07-02T00:00:00Z', updatedAt: '2026-07-02T00:00:00Z',
  isActive: true, deletedAt: null, deletedBy: null,
};

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-svc-test-'));
  vi.mocked(repo.findMediaByHash).mockResolvedValue(null);
  vi.mocked(repo.insertMedia).mockResolvedValue(mockRecord);
  vi.mocked(repo.findMediaById).mockResolvedValue(mockRecord);
  vi.mocked(repo.softDeleteMedia).mockResolvedValue(true);
  vi.mocked(repo.hardDeleteMedia).mockResolvedValue(true);
  vi.mocked(repo.incrementDownloadCount).mockResolvedValue();
  vi.mocked(repo.incrementUsageCount).mockResolvedValue();
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('MediaServiceImpl validation', () => {
  it('throws TOO_LARGE for a file over 50 MB', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    const bigBuffer = Buffer.alloc(51 * 1024 * 1024);
    await expect(
      service.save({ buffer: bigBuffer, originalFilename: 'big.jpg', mimeType: 'image/jpeg', uploadedBy: 1 })
    ).rejects.toMatchObject({ reason: 'TOO_LARGE' });
  });

  it('throws EXTENSION_NOT_ALLOWED for .exe', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    await expect(
      service.save({ buffer: Buffer.from('x'), originalFilename: 'virus.exe', mimeType: 'application/octet-stream', uploadedBy: 1 })
    ).rejects.toMatchObject({ reason: 'EXTENSION_NOT_ALLOWED' });
  });

  it('throws MIME_NOT_ALLOWED for unknown MIME type', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    await expect(
      service.save({ buffer: Buffer.from('x'), originalFilename: 'file.jpg', mimeType: 'application/x-custom-12345', uploadedBy: 1 })
    ).rejects.toMatchObject({ reason: 'MIME_NOT_ALLOWED' });
  });

  it('MediaValidationError is an instance of Error', () => {
    const e = new MediaValidationError('TOO_LARGE');
    expect(e).toBeInstanceOf(Error);
    expect(e.reason).toBe('TOO_LARGE');
    expect(e.name).toBe('MediaValidationError');
  });
});

describe('MediaServiceImpl save', () => {
  it('saves a valid JPEG and returns isDuplicate=false', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    vi.mocked(repo.findMediaByHash).mockResolvedValueOnce(null);
    const result = await service.save({
      buffer: Buffer.from('fake-jpeg'),
      originalFilename: 'photo.jpg',
      mimeType: 'image/jpeg',
      uploadedBy: 1,
    });
    expect(result.isDuplicate).toBe(false);
    expect(result.record.mediaType).toBe('IMAGE');
  });

  it('returns isDuplicate=true when file_hash already exists', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    vi.mocked(repo.findMediaByHash).mockResolvedValueOnce(mockRecord);
    const result = await service.save({
      buffer: Buffer.from('duplicate'),
      originalFilename: 'dup.jpg',
      mimeType: 'image/jpeg',
      uploadedBy: 1,
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.record.id).toBe(1);
  });
});

describe('MediaServiceImpl getForRelay', () => {
  it('returns a RelayMediaPayload with version=1', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    // Write a test file to the tmp dir so getBuffer can read it
    await fs.writeFile(path.join(tmpDir, 'abc123.jpg'), Buffer.from('fake-image-bytes'));
    vi.mocked(repo.findMediaById).mockResolvedValueOnce(mockRecord);
    const payload = await service.getForRelay(1);
    expect(payload).not.toBeNull();
    expect(payload!._type).toBe('RelayMediaPayload');
    expect(payload!.version).toBe(1);
    expect(typeof payload!.data).toBe('string');
    // data is base64 of 'fake-image-bytes'
    expect(Buffer.from(payload!.data, 'base64').toString()).toBe('fake-image-bytes');
  });
});

describe('MediaServiceImpl softDelete', () => {
  it('returns false when referenceCount > 0', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    vi.mocked(repo.findMediaById).mockResolvedValueOnce({ ...mockRecord, referenceCount: 2 });
    const result = await service.softDelete(1, 1);
    expect(result).toBe(false);
    expect(repo.softDeleteMedia).not.toHaveBeenCalled();
  });

  it('returns true when referenceCount == 0', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    vi.mocked(repo.findMediaById).mockResolvedValueOnce({ ...mockRecord, referenceCount: 0 });
    vi.mocked(repo.softDeleteMedia).mockResolvedValueOnce(true);
    const result = await service.softDelete(1, 1);
    expect(result).toBe(true);
  });
});

describe('MediaServiceImpl restore', () => {
  it('returns the restored record', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    vi.mocked(repo.restoreMedia).mockResolvedValueOnce(mockRecord);
    const record = await service.restore(1);
    expect(record?.id).toBe(1);
  });
});

describe('MediaServiceImpl recordUsage', () => {
  it('calls incrementUsageCount without awaiting (fire-and-forget)', () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    vi.mocked(repo.incrementUsageCount).mockResolvedValueOnce(undefined);
    // Must be synchronous — no await
    service.recordUsage(1, 'QUICK_REPLY');
    expect(repo.incrementUsageCount).toHaveBeenCalledWith(1, 'QUICK_REPLY');
  });
});

describe('MediaServiceImpl recordDownload', () => {
  it('calls incrementDownloadCount without awaiting (fire-and-forget)', () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    vi.mocked(repo.incrementDownloadCount).mockResolvedValueOnce(undefined);
    service.recordDownload(1);
    expect(repo.incrementDownloadCount).toHaveBeenCalledWith(1);
  });
});

describe('MediaServiceImpl health', () => {
  it('getStorageProvider().health() returns ONLINE with a writable tmp dir', async () => {
    const service = new MediaServiceImpl(new FilesystemProvider(tmpDir));
    const health = await service.getStorageProvider().health();
    expect(health).toBe('ONLINE');
  });
});
