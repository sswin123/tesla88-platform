import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/require_permission';
import { updateNote, deleteNote } from '@/lib/transactions';
import { dbGetNoteById } from '@/lib/repositories/notes_repo';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string; noteId: string }> }
) {
  const { type, id, noteId } = await params;

  if (type !== 'deposit' && type !== 'withdrawal') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const numNoteId = parseInt(noteId, 10);
  if (isNaN(numNoteId)) {
    return NextResponse.json({ error: 'Invalid noteId' }, { status: 400 });
  }

  const payload = await requirePermission('transaction.notes.edit');
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = payload.sub;

  const note = await dbGetNoteById(numNoteId);
  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  if (note.transaction_type !== type || note.transaction_id !== numId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  const updated = await updateNote({
    adminId,
    noteId: numNoteId,
    content: content.trim(),
  });

  return NextResponse.json({ note: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string; noteId: string }> }
) {
  const { type, id, noteId } = await params;

  if (type !== 'deposit' && type !== 'withdrawal') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const numNoteId = parseInt(noteId, 10);
  if (isNaN(numNoteId)) {
    return NextResponse.json({ error: 'Invalid noteId' }, { status: 400 });
  }

  const payload = await requirePermission('transaction.notes.delete');
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminId = payload.sub;

  const note = await dbGetNoteById(numNoteId);
  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  if (note.transaction_type !== type || note.transaction_id !== numId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await deleteNote({
    adminId,
    noteId: numNoteId,
    transactionType: type as 'deposit' | 'withdrawal',
    transactionId: numId,
  });

  return NextResponse.json({ ok: true });
}
