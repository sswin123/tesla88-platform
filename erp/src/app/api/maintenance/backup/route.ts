// POST — SUPER_ADMIN auth required
// Attempts pg_dump, streams result as file download
// If pg_dump not available, returns helpful error message
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';

const execFileAsync = promisify(execFile);

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (payload.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
  const filename = `postgres-backup-${new Date().toISOString().split('T')[0]}.sql`;

  try {
    const { stdout } = await execFileAsync('pg_dump', [DATABASE_URL], {
      maxBuffer: 100 * 1024 * 1024, // 100MB max
    });
    return new NextResponse(stdout, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('ENOENT')) {
      return NextResponse.json(
        { error: 'pg_dump not available in this environment. Install postgresql-client to enable backups.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: `Backup failed: ${message}` }, { status: 500 });
  }
}
