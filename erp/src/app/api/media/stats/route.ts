import { NextRequest, NextResponse } from 'next/server';
import { getMediaStats, getRecentUploads } from '@/lib/repositories/media_repo';
import { mediaService } from '@/lib/media';
import { requirePermission } from '@/lib/require_permission';

export async function GET(_request: NextRequest) {
  const payload = await requirePermission('media.view');
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
