import crypto from 'crypto';
import type { StorageProvider } from './storage-provider';
import type {
  MediaRecord, MediaModule, SaveMediaInput, SaveMediaResult,
  RelayMediaPayload, MediaEvent, MediaType,
} from './types';
import { MediaValidationError, MediaVirusScanError, MediaNotFoundError } from './types';
import {
  insertMedia, findMediaById, findMediaByHash,
  updateMedia, updateMediaFile, softDeleteMedia,
  restoreMedia, hardDeleteMedia,
  incrementDownloadCount, incrementUsageCount,
} from '@/lib/repositories/media_repo';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff',
  'gif',
  'mp4', 'mov', 'avi', 'mkv', 'webm',
  'mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac',
  'pdf',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv',
  'apk',
  'zip',
  'rar',
]);

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac', 'audio/mp4', 'audio/aac',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/vnd.android.package-archive',
  'application/zip', 'application/x-zip-compressed',
  'application/x-rar-compressed', 'application/vnd.rar',
]);

function mimeToMediaType(mime: string, ext: string): MediaType {
  if (mime === 'image/gif') return 'GIF';
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  // OGG audio from Telegram voice messages
  if (mime === 'audio/ogg' && ext === 'ogg') return 'VOICE';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime === 'application/pdf') return 'PDF';
  if (mime === 'application/vnd.android.package-archive') return 'APK';
  if (['application/zip', 'application/x-zip-compressed'].includes(mime)) return 'ZIP';
  if (['application/x-rar-compressed', 'application/vnd.rar'].includes(mime)) return 'RAR';
  if (mime.startsWith('application/') || mime.startsWith('text/')) return 'DOCUMENT';
  return 'UNKNOWN';
}

type EventHandler = (e: MediaEvent) => void;

export class MediaServiceImpl {
  private readonly handlers = new Map<MediaEvent['type'], EventHandler[]>();

  constructor(private readonly storage: StorageProvider) {}

  on(event: MediaEvent['type'], handler: EventHandler): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  off(event: MediaEvent['type'], handler: EventHandler): void {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter(h => h !== handler));
  }

  private emit(event: MediaEvent): void {
    for (const h of (this.handlers.get(event.type) ?? [])) {
      try { h(event); } catch { /* event errors must not propagate */ }
    }
  }

  private validate(input: SaveMediaInput): void {
    if (input.buffer.length > MAX_FILE_SIZE) throw new MediaValidationError('TOO_LARGE');
    const ext = (input.originalFilename.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new MediaValidationError('EXTENSION_NOT_ALLOWED');
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) throw new MediaValidationError('MIME_NOT_ALLOWED');
  }

  private sha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // v1.0: no-op scan — hook for future virus scanner (ClamAV, cloud AV)
  private scan(_buffer: Buffer): 'PASS' | 'FAIL' {
    return 'PASS';
  }

  async save(input: SaveMediaInput): Promise<SaveMediaResult> {
    this.validate(input);
    const hash = this.sha256(input.buffer);

    // Dedup: return existing record without writing to disk
    const existing = await findMediaByHash(hash);
    if (existing) return { record: existing, isDuplicate: true };

    if (this.scan(input.buffer) === 'FAIL') throw new MediaVirusScanError();

    const ext = (input.originalFilename.split('.').pop() ?? 'bin').toLowerCase();
    const key = `${hash}.${ext}`;
    await this.storage.save(key, input.buffer, input.mimeType);

    const record = await insertMedia({
      fileHash:         hash,
      storageKey:       key,
      storageProvider:  'LOCAL',
      mediaType:        mimeToMediaType(input.mimeType, ext),
      mimeType:         input.mimeType,
      extension:        ext,
      originalFilename: input.originalFilename,
      displayName:      input.displayName ?? input.originalFilename,
      fileSize:         input.buffer.length,
      createdBy:        input.uploadedBy,
    });

    this.emit({ type: 'MEDIA_CREATED', mediaId: record.id, uploadedBy: input.uploadedBy });
    return { record, isDuplicate: false };
  }

  async saveMany(inputs: SaveMediaInput[]): Promise<SaveMediaResult[]> {
    const results: SaveMediaResult[] = [];
    for (const input of inputs) {
      results.push(await this.save(input));
    }
    return results;
  }

  async getBuffer(
    id: number
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
    const record = await findMediaById(id);
    if (!record || record.deletedAt) return null;
    const buffer = await this.storage.get(record.storageKey).catch(() => null);
    if (!buffer) return null;
    return { buffer, mimeType: record.mimeType, filename: record.originalFilename };
  }

  async getForRelay(id: number): Promise<RelayMediaPayload | null> {
    const result = await this.getBuffer(id);
    if (!result) return null;
    return {
      _type:    'RelayMediaPayload',
      version:  1,
      mimeType: result.mimeType,
      filename: result.filename,
      data:     result.buffer.toString('base64'),
    };
  }

  // Phase 5.4A: thumbnail_status is always NONE — falls back to original
  async getPreview(
    id: number
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const result = await this.getBuffer(id);
    if (!result) return null;
    return { buffer: result.buffer, mimeType: result.mimeType };
  }

  async replace(id: number, input: SaveMediaInput): Promise<MediaRecord> {
    this.validate(input);
    if (this.scan(input.buffer) === 'FAIL') throw new MediaVirusScanError();

    const hash = this.sha256(input.buffer);
    const ext = (input.originalFilename.split('.').pop() ?? 'bin').toLowerCase();
    const key = `${hash}.${ext}`;
    await this.storage.save(key, input.buffer, input.mimeType);

    const record = await updateMediaFile(id, {
      fileHash:         hash,
      storageKey:       key,
      fileSize:         input.buffer.length,
      originalFilename: input.originalFilename,
      mimeType:         input.mimeType,
      extension:        ext,
      mediaType:        mimeToMediaType(input.mimeType, ext),
    });
    if (!record) throw new MediaNotFoundError(id);

    this.emit({ type: 'MEDIA_UPDATED', mediaId: id, updatedBy: input.uploadedBy });
    return record;
  }

  // Returns false (and does NOT delete) if reference_count > 0
  async softDelete(id: number, deletedBy: number): Promise<boolean> {
    const record = await findMediaById(id);
    if (!record) return false;
    if (record.referenceCount > 0) return false;
    const ok = await softDeleteMedia(id, deletedBy);
    if (ok) this.emit({ type: 'MEDIA_DELETED', mediaId: id, deletedBy });
    return ok;
  }

  // SUPER_ADMIN only: requires deleted_at IS NOT NULL AND reference_count == 0
  async permanentDelete(id: number, deletedBy: number): Promise<boolean> {
    const record = await findMediaById(id);
    if (!record || !record.deletedAt || record.referenceCount > 0) return false;
    await this.storage.delete(record.storageKey).catch(() => {});
    const ok = await hardDeleteMedia(id);
    if (ok) this.emit({ type: 'MEDIA_DELETED', mediaId: id, deletedBy });
    return ok;
  }

  async restore(id: number): Promise<MediaRecord | null> {
    return restoreMedia(id);
  }

  // Fire-and-forget — must never block callers
  recordUsage(id: number, module: MediaModule): void {
    incrementUsageCount(id, module).catch(() => {});
  }

  // Fire-and-forget — must never block callers
  recordDownload(id: number): void {
    incrementDownloadCount(id).catch(() => {});
  }

  getStorageProvider(): StorageProvider {
    return this.storage;
  }

  update(
    id: number,
    data: { displayName?: string; isActive?: boolean }
  ): Promise<MediaRecord | null> {
    return updateMedia(id, data);
  }
}
