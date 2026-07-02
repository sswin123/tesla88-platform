import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { getMediaStats, getRecentUploads } from '@/lib/repositories/media_repo';
import { mediaService } from '@/lib/media';

export async function GET(_request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [stats, recentUploads, storageHealth] = await Promise.all([
    getMediaStats(),
    getRecentUploads(6),
    mediaService.getStorageProvider().health().catch(() => 'OFFLINE' as const),
  ]);

  return NextResponse.json({
    totalFiles:    stats.total,
    totalSize:     stats.totalSize,
    byType:        stats.byType,
    storageHealth,
    recentUploads,
  });
}
