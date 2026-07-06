// Node.js only — DO NOT import from src/middleware.ts (Edge runtime)
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
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

/**
 * Reads the session cookie, verifies the JWT, and returns the payload.
 * Throws a NextResponse (401) if unauthenticated — callers should re-throw it.
 */
export async function requireAdmin(
  _req?: unknown
): Promise<JWTPayload> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;
  if (!payload) {
    throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return payload;
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
