import type { StorageHealth } from './types';

export interface StorageProvider {
  save(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  health(): Promise<StorageHealth>;
}
