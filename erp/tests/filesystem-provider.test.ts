import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { FilesystemProvider } from '../src/lib/media/filesystem-provider';

let tmpDir: string;
let provider: FilesystemProvider;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-provider-test-'));
  provider = new FilesystemProvider(tmpDir);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('FilesystemProvider', () => {
  it('saves a buffer and retrieves it', async () => {
    const buf = Buffer.from('hello-media-test');
    await provider.save('test.bin', buf, 'application/octet-stream');
    const result = await provider.get('test.bin');
    expect(result.equals(buf)).toBe(true);
  });

  it('exists() returns true after save', async () => {
    expect(await provider.exists('test.bin')).toBe(true);
  });

  it('exists() returns false for unknown key', async () => {
    expect(await provider.exists('no-such-file.bin')).toBe(false);
  });

  it('delete() removes the file', async () => {
    await provider.delete('test.bin');
    expect(await provider.exists('test.bin')).toBe(false);
  });

  it('health() returns ONLINE when the directory is writable', async () => {
    const health = await provider.health();
    expect(health).toBe('ONLINE');
  });

  it('creates the upload dir if it does not exist', async () => {
    const newDir = path.join(tmpDir, 'subdir');
    const p = new FilesystemProvider(newDir);
    await p.save('x.bin', Buffer.from('x'), 'application/octet-stream');
    expect(await p.exists('x.bin')).toBe(true);
  });
});
