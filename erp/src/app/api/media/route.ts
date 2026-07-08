import { NextRequest, NextResponse } from 'next/server';
import { listMediaFiltered, type SortOption } from '@/lib/repositories/media_repo';
import { requirePermission } from '@/lib/require_permission';

const VALID_SORTS = new Set<string>([
  'newest', 'oldest', 'most_used', 'most_downloaded', 'largest', 'smallest', 'recently_used',
]);

export async function GET(request: NextRequest) {
  const payload = await requirePermission('media.view');
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;

  const page   = Math.max(1, parseInt(sp.get('page')  ?? '1',  10) || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20', 10) || 20));
  const offset = (page - 1) * limit;
  const sortRaw = sp.get('sort') ?? 'newest';
  const sort = (VALID_SORTS.has(sortRaw) ? sortRaw : 'newest') as SortOption;

  const search      = sp.get('search')      ?? undefined;
  const mediaType   = sp.get('type')        ?? undefined;
  const mimeType    = sp.get('mime_type')   ?? undefined;
  const extension   = sp.get('extension')   ?? undefined;
  const module      = sp.get('module')      ?? undefined;
  const dateFrom    = sp.get('date_from')   ?? undefined;
  const dateTo      = sp.get('date_to')     ?? undefined;

  const uploadedByRaw = sp.get('uploaded_by');
  const uploadedBy = uploadedByRaw ? parseInt(uploadedByRaw, 10) : undefined;

  const minSizeRaw = sp.get('min_size');
  const maxSizeRaw = sp.get('max_size');
  const minSize = minSizeRaw ? parseInt(minSizeRaw, 10) : undefined;
  const maxSize = maxSizeRaw ? parseInt(maxSizeRaw, 10) : undefined;

  const activeRaw = sp.get('active');
  const active = activeRaw === 'true' ? true : activeRaw === 'false' ? false : undefined;
  const includeArchived = sp.get('include_archived') === 'true';

  const { records, total } = await listMediaFiltered({
    limit, offset, sort,
    search, mediaType, mimeType, extension, module, dateFrom, dateTo,
    uploadedBy: Number.isNaN(uploadedBy ?? NaN) ? undefined : uploadedBy,
    minSize:    Number.isNaN(minSize    ?? NaN) ? undefined : minSize,
    maxSize:    Number.isNaN(maxSize    ?? NaN) ? undefined : maxSize,
    active,
    includeArchived,
  });

  return NextResponse.json({ media: records, total, page, limit });
}
