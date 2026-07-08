import { getRolePermissions } from '@/lib/repositories/permissions_repo';

const CACHE_TTL_MS = 30_000;

let cache: Map<string, Set<string>> | null = null;
let cacheAt = 0;

async function loadCache(): Promise<Map<string, Set<string>>> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;

  try {
    const rows = await getRolePermissions();
    const m = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.granted) continue;
      if (!m.has(row.role)) m.set(row.role, new Set());
      m.get(row.role)!.add(row.permission);
    }
    cache = m;
    cacheAt = now;
    return m;
  } catch {
    // DB offline — return stale cache if available, else empty map
    return cache ?? new Map();
  }
}

export async function can(role: string, permission: string): Promise<boolean> {
  if (role === 'SUPER_ADMIN') return true;
  const m = await loadCache();
  return m.get(role)?.has(permission) ?? false;
}

export function invalidateCache(): void {
  cache = null;
  cacheAt = 0;
}
