import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const SECRET = new TextEncoder().encode(
  process.env.MEMBER_JWT_SECRET ?? 'member-dev-secret-change-in-production'
);

export const COOKIE_NAME   = 'member_session';
export const COOKIE_MAXAGE = 60 * 60 * 24 * 7; // 7 days

export interface MemberJWTPayload {
  sub: number;
  phone: string;
  first_name: string;
}

export async function signMemberJWT(payload: MemberJWTPayload): Promise<string> {
  return new SignJWT({ ...payload, sub: String(payload.sub) })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function verifyMemberJWT(token: string): Promise<MemberJWTPayload> {
  const { payload } = await jwtVerify(token, SECRET);
  return payload as unknown as MemberJWTPayload;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
