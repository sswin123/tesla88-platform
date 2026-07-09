import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readFile } from 'fs/promises';
import { getBackup, backupFilePath } from '@/lib/repositories/backup_repo';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';

async function getSuperAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return null;
  if (payload.role !== 'SUPER_ADMIN') return null;
  return payload;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getSuperAdmin();
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const record = await getBackup(Number(id));
  if (!record) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
  if (record.status !== 'completed')
    return NextResponse.json({ error: 'Backup not ready' }, { status: 409 });

  try {
    const data = await readFile(backupFilePath(record.filename));
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${record.filename}"`,
        'Content-Length': String(data.length),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Backup file not found on disk' }, { status: 404 });
  }
}
