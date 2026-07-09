import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));

vi.mock('@/lib/auth', () => ({
  verifyJWT:   vi.fn().mockResolvedValue({ sub: 1, username: 'admin', role: 'SUPER_ADMIN', iat: 0, exp: 9999999999 }),
  COOKIE_NAME: 'erp_session',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

vi.mock('@/lib/repositories/audit_repo', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/repositories/settings_repo', () => ({
  getSetting: vi.fn().mockResolvedValue('30'),
}));

// Use vi.hoisted so the mock variables exist before vi.mock factories run
const { mockExecFile, mockWriteFile, mockMkdir, mockStat, mockUnlink } = vi.hoisted(() => ({
  mockExecFile:  vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockMkdir:     vi.fn().mockResolvedValue(undefined),
  mockStat:      vi.fn().mockResolvedValue({ size: 1024 }),
  mockUnlink:    vi.fn().mockResolvedValue(undefined),
}));

// Do NOT mock util — let real promisify wrap our callback-style execFile mock
vi.mock('child_process', () => ({ execFile: mockExecFile }));
vi.mock('fs/promises', () => ({
  mkdir:     mockMkdir,
  writeFile: mockWriteFile,
  stat:      mockStat,
  unlink:    mockUnlink,
}));

import pool from '@/lib/db';
import { GET, POST } from '@/app/api/system/backups/route';

beforeEach(() => {
  vi.clearAllMocks();
  mockWriteFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
  mockStat.mockResolvedValue({ size: 1024 });
  mockUnlink.mockResolvedValue(undefined);
});

function stubSuccessfulExec() {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as (err: null, result: { stdout: string }) => void;
    cb(null, { stdout: '-- PostgreSQL dump' });
  });
}

function stubFailingExec(message = 'pg_dump: not found ENOENT') {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as (err: Error) => void;
    cb(new Error(message));
  });
}

const SAMPLE_BACKUPS = [
  { id: 2, filename: 'backup-2026-07-09.sql', file_size_bytes: 204800, status: 'completed', notes: null, created_at: '2026-07-09T00:00:00Z' },
  { id: 1, filename: 'backup-2026-07-08.sql', file_size_bytes: 198000, status: 'completed', notes: null, created_at: '2026-07-08T00:00:00Z' },
];

describe('GET /api/system/backups', () => {
  it('returns 200 with backup list', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: SAMPLE_BACKUPS } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as typeof SAMPLE_BACKUPS;
    expect(data).toHaveLength(2);
    expect(data[0].filename).toBe('backup-2026-07-09.sql');
    expect(data[0].status).toBe('completed');
  });

  it('returns 401 when not SUPER_ADMIN', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce({ sub: 2, username: 'staff', role: 'ADMIN', iat: 0, exp: 9999 } as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns empty array when no backups exist', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data).toHaveLength(0);
  });
});

describe('POST /api/system/backups', () => {
  function stubDbForSuccess(insertId = 99, expiredRows: unknown[] = []) {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: insertId }] } as never)  // insertBackupRecord
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)       // completeBackupRecord
      .mockResolvedValueOnce({ rows: expiredRows } as never);           // getExpiredBackups
  }

  it('returns 201 when backup is created successfully', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    stubDbForSuccess(10);
    stubSuccessfulExec();

    const res = await POST();
    expect(res.status).toBe(201);
    const body = await res.json() as { ok: boolean; id: number; filename: string; file_size_bytes: number };
    expect(body.ok).toBe(true);
    expect(body.id).toBe(10);
    expect(body.filename).toMatch(/^backup-/);
    expect(body.file_size_bytes).toBe(1024);
  });

  it('returns 503 when DATABASE_URL is not configured', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('DATABASE_URL');
  });

  it('returns 503 when pg_dump is not available', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 5 }] } as never)          // insertBackupRecord
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);      // failBackupRecord
    stubFailingExec('pg_dump: not found ENOENT');

    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('pg_dump');
  });

  it('returns 401 when not SUPER_ADMIN', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce({ sub: 2, username: 'staff', role: 'ADMIN', iat: 0, exp: 9999 } as never);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('cleans up expired backups after successful creation', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    stubDbForSuccess(11, [{ id: 1, filename: 'backup-old.sql' }]);
    stubSuccessfulExec();
    // deleteBackupRecord for the expired entry
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const res = await POST();
    expect(res.status).toBe(201);
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('backup-old.sql'));
  });
});
