import { dbCreateNote, dbUpdateNote, dbSoftDeleteNote, dbListNotes } from '@/lib/repositories/notes_repo';
import type { NoteRow } from '@/lib/repositories/notes_repo';
import { TransactionEvent, emitTransactionEvent } from './transaction_events';
import type { TransactionType } from './transaction_events';
import { recordTransactionAudit } from './transaction_audit';

export async function createNote(params: {
  adminId: number;
  transactionType: TransactionType;
  transactionId: number;
  content: string;
}): Promise<NoteRow> {
  const note = await dbCreateNote({
    transaction_type: params.transactionType,
    transaction_id: params.transactionId,
    admin_id: params.adminId,
    content: params.content,
  });

  await recordTransactionAudit({
    adminId: params.adminId,
    event: TransactionEvent.INTERNAL_NOTE_CREATED,
    transactionType: params.transactionType,
    transactionId: params.transactionId,
    description: 'Internal note created',
  });

  await emitTransactionEvent(TransactionEvent.INTERNAL_NOTE_CREATED, {
    noteId: note.id,
    transactionType: params.transactionType,
    transactionId: params.transactionId,
  });

  return note;
}

export async function updateNote(params: {
  adminId: number;
  noteId: number;
  content: string;
}): Promise<NoteRow> {
  const updated = await dbUpdateNote(params.noteId, params.content);

  await recordTransactionAudit({
    adminId: params.adminId,
    event: TransactionEvent.INTERNAL_NOTE_UPDATED,
    transactionType: updated.transaction_type as TransactionType,
    transactionId: updated.transaction_id,
    description: 'Internal note updated',
  });

  await emitTransactionEvent(TransactionEvent.INTERNAL_NOTE_UPDATED, {
    noteId: params.noteId,
  });

  return updated;
}

export async function deleteNote(params: {
  adminId: number;
  noteId: number;
  transactionType: TransactionType;
  transactionId: number;
}): Promise<void> {
  await dbSoftDeleteNote(params.noteId);

  await recordTransactionAudit({
    adminId: params.adminId,
    event: TransactionEvent.INTERNAL_NOTE_DELETED,
    transactionType: params.transactionType,
    transactionId: params.transactionId,
    description: 'Internal note deleted',
  });

  await emitTransactionEvent(TransactionEvent.INTERNAL_NOTE_DELETED, {
    noteId: params.noteId,
  });
}

export async function listNotes(params: {
  transactionType: TransactionType;
  transactionId: number;
}): Promise<NoteRow[]> {
  return dbListNotes(params.transactionType, params.transactionId);
}
