export type MediaModule =
  | 'QUICK_REPLY' | 'ANNOUNCEMENT' | 'BROADCAST' | 'BOT_MESSAGE'
  | 'APK' | 'WEBSITE' | 'BANNER' | 'PROMOTION' | 'AI';

export type StorageHealth   = 'ONLINE' | 'OFFLINE' | 'READ_ONLY';
export type ThumbnailStatus = 'NONE' | 'PENDING' | 'READY' | 'FAILED';
export type MediaType =
  | 'IMAGE' | 'GIF' | 'VIDEO' | 'AUDIO' | 'VOICE'
  | 'DOCUMENT' | 'PDF' | 'APK' | 'ZIP' | 'RAR' | 'UNKNOWN';

export interface MediaRecord {
  id: number;
  tenantId: number | null;
  fileHash: string;
  storageKey: string;
  storageProvider: string;
  mediaType: MediaType;
  mimeType: string;
  extension: string;
  originalFilename: string;
  displayName: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnailKey: string | null;
  thumbnailStatus: ThumbnailStatus;
  metadata: Record<string, unknown>;
  usageCount: number;
  referenceCount: number;
  lastUsedAt: string | null;
  lastUsedModule: MediaModule | null;
  downloadCount: number;
  lastDownloadedAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  deletedAt: string | null;
  deletedBy: number | null;
}

// Opaque — callers pass to relay without inspecting internals
export interface RelayMediaPayload {
  readonly _type:    'RelayMediaPayload';
  readonly version:  1;
  readonly mimeType: string;
  readonly filename: string;
  readonly data:     string; // base64 in v1.0
}

export interface SaveMediaInput {
  buffer:           Buffer;
  originalFilename: string;
  mimeType:         string;
  uploadedBy:       number;
  displayName?:     string;
}

export interface SaveMediaResult {
  record:      MediaRecord;
  isDuplicate: boolean;
}

export type MediaEvent =
  | { type: 'MEDIA_CREATED'; mediaId: number; uploadedBy: number }
  | { type: 'MEDIA_UPDATED'; mediaId: number; updatedBy: number }
  | { type: 'MEDIA_DELETED'; mediaId: number; deletedBy: number }
  | { type: 'MEDIA_USED';    mediaId: number; module: MediaModule };

export class MediaValidationError extends Error {
  constructor(
    public readonly reason: 'TOO_LARGE' | 'EXTENSION_NOT_ALLOWED' | 'MIME_NOT_ALLOWED'
  ) {
    super(reason);
    this.name = 'MediaValidationError';
  }
}

export class MediaNotFoundError extends Error {
  constructor(public readonly id: number) {
    super(`Media ${id} not found`);
    this.name = 'MediaNotFoundError';
  }
}

export class MediaStorageError extends Error {
  constructor(public readonly cause: unknown) {
    super('Storage operation failed');
    this.name = 'MediaStorageError';
  }
}

export class MediaReferencedError extends Error {
  constructor(public readonly id: number, public readonly referenceCount: number) {
    super(`Media ${id} is still referenced by ${referenceCount} module(s)`);
    this.name = 'MediaReferencedError';
  }
}

export class MediaVirusScanError extends Error {
  constructor() {
    super('File failed virus scan');
    this.name = 'MediaVirusScanError';
  }
}
