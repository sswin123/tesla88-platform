import fs from 'fs/promises';
import path from 'path';
import type { StorageProvider } from './storage-provider';
import type { StorageHealth } from './types';

export class FilesystemProvider implements StorageProvider {
  private readonly dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? process.env.MEDIA_UPLOAD_DIR ?? '/uploads/media';
  }

  private keyToPath(key: string): string {
    return path.join(this.dir, key);
  }

  async save(key: string, buffer: Buffer, _mimeType: string): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.keyToPath(key), buffer);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.keyToPath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.keyToPath(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.keyToPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async health(): Promise<StorageHealth> {
    try {
      await fs.mkdir(this.dir, { recursive: true });
      const probe = path.join(this.dir, '.health-probe');
      await fs.writeFile(probe, 'ok');
      await fs.unlink(probe);
      return 'ONLINE';
    } catch {
      return 'OFFLINE';
    }
  }
}
