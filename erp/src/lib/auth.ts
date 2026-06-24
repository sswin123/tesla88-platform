// Node.js only — DO NOT import from src/middleware.ts (Edge runtime)
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import pool from './db';
import type { ERPAdmin, JWTPayload } from './types';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
);

export const COOKIE_NAME = 'erp_session';
export const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signJWT(
  payload: Omit<JWTPayload, 'iat' | 'exp'>
): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(SECRET);
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getAdminByUsername(
  username: string
): Promise<(ERPAdmin & { erp_password_hash: string }) | null> {
  const { rows } = await pool.query<ERPAdmin & { erp_password_hash: string }>(
    `SELECT id, telegram_id, erp_username, erp_password_hash, role, is_active, created_at
     FROM admins WHERE erp_username = $1`,
    [username]
  );
  return rows[0] ?? null;
}

export async function getAdminById(
  id: number
): Promise<ERPAdmin | null> {
  const { rows } = await pool.query<ERPAdmin>(
    `SELECT id, telegram_id, erp_username, role, is_active, created_at
     FROM admins WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
