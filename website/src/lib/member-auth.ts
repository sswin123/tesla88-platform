import { cookies } from 'next/headers';
import { verifyMemberJWT, COOKIE_NAME, type MemberJWTPayload } from './auth';

export async function getMember(): Promise<MemberJWTPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await verifyMemberJWT(token);
  } catch {
    return null;
  }
}
