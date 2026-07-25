import pool from '@/lib/db';

export interface NoteRow {
  id: number;
  transaction_type: string;
  transaction_id: number;
  admin_id: number;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export async function dbCreateNote(data: {
  transaction_type: string;
  transaction_id: number;
  admin_id: number;
  content: string;
}): Promise<NoteRow> {
  const result = await pool.query<NoteRow>(
    `INSERT INTO transaction_internal_notes (transaction_type, transaction_id, admin_id, content)
     VALUES ($1, $2, $3, $4)
     RETURNING id, transaction_type, transaction_id, admin_id, content, created_at, updated_at`,
    [data.transaction_type, data.transaction_id, data.admin_id, data.content]
  );
  return result.rows[0];
}

export async function dbUpdateNote(noteId: number, content: string): Promise<NoteRow> {
  const result = await pool.query<NoteRow>(
    `UPDATE transaction_internal_notes SET content = $2, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, transaction_type, transaction_id, admin_id, content, created_at, updated_at`,
    [noteId, content]
  );
  return result.rows[0];
}

export async function dbSoftDeleteNote(noteId: number): Promise<void> {
  await pool.query(
    `UPDATE transaction_internal_notes SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [noteId]
  );
}

export async function dbListNotes(
  transaction_type: string,
  transaction_id: number
): Promise<NoteRow[]> {
  const result = await pool.query<NoteRow>(
    `SELECT id, transaction_type, transaction_id, admin_id, content, created_at, updated_at
     FROM transaction_internal_notes
     WHERE transaction_type = $1 AND transaction_id = $2 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [transaction_type, transaction_id]
  );
  return result.rows;
}

export async function dbGetNoteById(noteId: number): Promise<NoteRow | null> {
  const result = await pool.query<NoteRow>(
    `SELECT id, transaction_type, transaction_id, admin_id, content, created_at, updated_at, deleted_at
     FROM transaction_internal_notes
     WHERE id = $1`,
    [noteId]
  );
  return result.rows[0] ?? null;
}
