import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { createNote, listNotes } from '@/lib/transactions';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await params;

  if (type !== 'deposit' && type !== 'withdrawal') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const payload = await requirePermission('transaction.notes.view');
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const notes = await listNotes({ transactionType: type, transactionId: numId });
  return NextResponse.json({ notes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await params;

  if (type !== 'deposit' && type !== 'withdrawal') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const payload = await requirePermission('transaction.notes.create');
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = payload.sub;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const content = (body as Record<string, unknown>)?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }
  if (content.trim().length > 2000) {
    return NextResponse.json({ error: 'content must be 2000 characters or fewer' }, { status: 400 });
  }

  const note = await createNote({
    adminId,
    transactionType: type,
    transactionId: numId,
    content: content.trim(),
  });

  return NextResponse.json({ note }, { status: 201 });
}
