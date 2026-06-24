import { NextRequest, NextResponse } from 'next/server';
import { getSessionById, getSessionMessages } from '@/lib/repositories/support_repo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);

  const [session, messages] = await Promise.all([
    getSessionById(numId),
    getSessionMessages(numId),
  ]);

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ session, messages });
}
