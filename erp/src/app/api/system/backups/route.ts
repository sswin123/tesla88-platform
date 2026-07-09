import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, writeFile, stat, unlink } from 'fs/promises';
import {
  listBackups,
  insertBackupRecord,
  completeBackupRecord,
  failBackupRecord,
  getExpiredBackups,
  deleteBackupRecord,
  BACKUP_DIR,
  backupFilePath,
} from '@/lib/repositories/backup_repo';
import { getSetting } from '@/lib/repositories/settings_repo';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/lib/repositories/audit_repo';

const execFileAsync = promisify(execFile);

async function getSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return null;
  if (payload.role !== 'SUPER_ADMIN') return null;
  return payload;
}

export async function GET() {
  const payload = await getSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const backups = await listBackups();
  return NextResponse.json(backups);
}

export async function POST() {
  const payload = await getSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
  if (!DATABASE_URL) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  const id = await insertBackupRecord(filename);

  try {
    await mkdir(BACKUP_DIR, { recursive: true });
    const { stdout } = await execFileAsync('pg_dump', [DATABASE_URL], {
      maxBuffer: 200 * 1024 * 1024,
    });

    const filePath = backupFilePath(filename);
    await writeFile(filePath, stdout, 'utf8');
    const { size } = await stat(filePath);
    await completeBackupRecord(id, size);

    logAudit({
      admin_id: payload.sub,
      action: 'BACKUP_CREATED',
      target_type: 'system',
      target_id: id,
      new_value: { filename, file_size_bytes: size },
    }).catch(() => {});

    await cleanupOldBackups();

    return NextResponse.json({ ok: true, id, filename, file_size_bytes: size }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failBackupRecord(id, message);

    if (message.includes('not found') || message.includes('ENOENT')) {
      return NextResponse.json(
        { error: 'pg_dump not available. Install postgresql-client to enable backups.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: `Backup failed: ${message}` }, { status: 500 });
  }
}

async function cleanupOldBackups(): Promise<void> {
  const retentionStr = await getSetting('backup_retention_days');
  const retentionDays = parseInt(retentionStr ?? '30', 10);
  if (isNaN(retentionDays) || retentionDays <= 0) return;

  const expired = await getExpiredBackups(retentionDays);
  for (const record of expired) {
    try { await unlink(backupFilePath(record.filename)); } catch { /* file may not exist */ }
    await deleteBackupRecord(record.id);
  }
}
