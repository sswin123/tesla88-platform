import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import { can } from '@/lib/permission_engine';

export interface AuthPayload {
  sub: number;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Extracts the JWT from cookies, verifies it, then checks if the role has
 * the given permission via permission_engine.can().
 *
 * SUPER_ADMIN always passes (can() bypasses the DB for SUPER_ADMIN).
 * Returns the payload on success, null on failure (not logged in, or
 * permission denied, or DB error).
 */
export async function requirePermission(permission: string): Promise<AuthPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return null;
  try {
    const allowed = await can(payload.role, permission);
    return allowed ? (payload as AuthPayload) : null;
  } catch {
    return null;
  }
}
