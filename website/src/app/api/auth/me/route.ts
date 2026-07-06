import { NextResponse } from 'next/server';
import { getMember } from '@/lib/member-auth';
export async function GET() {
  const member = await getMember();
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ sub: member.sub, phone: member.phone, first_name: member.first_name });
}
