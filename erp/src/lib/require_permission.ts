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

export type PermissionCheckResult =
  | { ok: true; payload: AuthPayload }
  | { ok: false; status: 401 | 403 };

/**
 * Same checks as requirePermission(), but distinguishes "not logged in" (401)
 * from "logged in, permission denied" (403) — used by the Staff Monitoring
 * module, which requires 403 specifically. Existing callers of
 * requirePermission() are unaffected.
 */
export async function requirePermissionStrict(
  permission: string
): Promise<PermissionCheckResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) return { ok: false, status: 401 };
  try {
    const allowed = await can(payload.role, permission);
    return allowed ? { ok: true, payload: payload as AuthPayload } : { ok: false, status: 403 };
  } catch {
    return { ok: false, status: 403 };
  }
}
