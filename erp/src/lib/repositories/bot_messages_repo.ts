import pool from '@/lib/db';

export interface BotMessageRow {
  message_key: string;
  category: string;
  description: string;
  language_code: string;
  content: string;
  seed_content: string;
  updated_by: string | null;
  updated_at: string;
  translation_id: number;
}

export interface BotMessageHistoryRow {
  id: number;
  translation_id: number;
  language_code: string;
  old_content: string;
  changed_by: string | null;
  changed_at: string;
  restored_from_version: number | null;
}

export interface BotButtonRow {
  id: number;
  group_key: string;
  label: string;
  language_code: string;
  button_payload: Record<string, unknown>;
  row_order: number;
  column_order: number;
  is_active: boolean;
  updated_at: string;
}

export async function listBotMessages(opts: {
  category?: string;
  language?: string;
  search?: string;
}): Promise<BotMessageRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (opts.category) {
    conditions.push(`k.category = $${i++}`);
    params.push(opts.category);
  }
  if (opts.language) {
    conditions.push(`t.language_code = $${i++}`);
    params.push(opts.language);
  }
  if (opts.search) {
    conditions.push(`(k.message_key ILIKE $${i} OR t.content ILIKE $${i})`);
    params.push(`%${opts.search}%`);
    i++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const r = await pool.query<BotMessageRow>(
    `SELECT
       k.message_key,
       k.category,
       k.description,
       t.language_code,
       t.content,
       t.seed_content,
       t.updated_by,
       t.updated_at::text AS updated_at,
       t.id AS translation_id
     FROM bot_message_keys k
     JOIN bot_message_translations t ON t.key_id = k.id
     ${where}
     ORDER BY k.category, k.message_key, t.language_code`,
    params
  );
  return r.rows;
}

export async function updateBotMessage(
  messageKey: string,
  languageCode: string,
  content: string,
  updatedBy: string
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE bot_message_translations t
     SET content = $3, updated_by = $4
     FROM bot_message_keys k
     WHERE t.key_id = k.id
       AND k.message_key = $1
       AND t.language_code = $2`,
    [messageKey, languageCode, content, updatedBy]
  );
  if ((r.rowCount ?? 0) === 0) return false;

  await pool.query(
    `UPDATE cache_versions SET version = version + 1, updated_at = NOW()
     WHERE component = 'bot_messages'`
  );
  return true;
}

export async function resetBotMessage(
  messageKey: string,
  languageCode: string,
  updatedBy: string
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE bot_message_translations t
     SET content = t.seed_content, updated_by = $3
     FROM bot_message_keys k
     WHERE t.key_id = k.id
       AND k.message_key = $1
       AND t.language_code = $2`,
    [messageKey, languageCode, updatedBy]
  );
  if ((r.rowCount ?? 0) === 0) return false;

  await pool.query(
    `UPDATE cache_versions SET version = version + 1, updated_at = NOW()
     WHERE component = 'bot_messages'`
  );
  return true;
}

export async function getBotMessageHistory(
  messageKey: string,
  languageCode?: string
): Promise<BotMessageHistoryRow[]> {
  const params: unknown[] = [messageKey];
  let langFilter = '';
  if (languageCode) {
    langFilter = `AND t.language_code = $2`;
    params.push(languageCode);
  }

  const r = await pool.query<BotMessageHistoryRow>(
    `SELECT
       h.id,
       h.translation_id,
       h.language_code,
       h.old_content,
       h.changed_by,
       h.changed_at::text AS changed_at,
       h.restored_from_version
     FROM bot_message_history h
     JOIN bot_message_translations t ON t.id = h.translation_id
     JOIN bot_message_keys k ON k.id = t.key_id
     WHERE k.message_key = $1
     ${langFilter}
     ORDER BY h.changed_at DESC
     LIMIT 20`,
    params
  );
  return r.rows;
}

export async function restoreBotMessage(
  messageKey: string,
  historyId: number,
  restoredBy: string
): Promise<boolean> {
  const histRow = await pool.query<{
    old_content: string;
    translation_id: number;
    language_code: string;
  }>(
    `SELECT h.old_content, h.translation_id, t.language_code
     FROM bot_message_history h
     JOIN bot_message_translations t ON t.id = h.translation_id
     JOIN bot_message_keys k ON k.id = t.key_id
     WHERE h.id = $1 AND k.message_key = $2`,
    [historyId, messageKey]
  );

  if (histRow.rows.length === 0) return false;

  const { old_content, translation_id } = histRow.rows[0];

  await pool.query(
    `UPDATE bot_message_translations
     SET content = $1, updated_by = $2
     WHERE id = $3`,
    [old_content, restoredBy, translation_id]
  );

  await pool.query(
    `UPDATE cache_versions SET version = version + 1, updated_at = NOW()
     WHERE component = 'bot_messages'`
  );

  return true;
}

export async function listBotButtons(groupKey?: string): Promise<BotButtonRow[]> {
  const params: unknown[] = [];
  let where = '';
  if (groupKey) {
    where = 'WHERE group_key = $1';
    params.push(groupKey);
  }

  const r = await pool.query<BotButtonRow>(
    `SELECT id, group_key, label, language_code, button_payload,
            row_order, column_order, is_active,
            updated_at::text AS updated_at
     FROM bot_buttons
     ${where}
     ORDER BY group_key, row_order, column_order`,
    params
  );
  return r.rows;
}

export async function updateBotButton(
  id: number,
  updates: { label?: string; is_active?: boolean; row_order?: number; column_order?: number }
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (updates.label !== undefined) { sets.push(`label = $${i++}`); params.push(updates.label); }
  if (updates.is_active !== undefined) { sets.push(`is_active = $${i++}`); params.push(updates.is_active); }
  if (updates.row_order !== undefined) { sets.push(`row_order = $${i++}`); params.push(updates.row_order); }
  if (updates.column_order !== undefined) { sets.push(`column_order = $${i++}`); params.push(updates.column_order); }

  if (sets.length === 0) return false;

  params.push(id);
  const r = await pool.query(
    `UPDATE bot_buttons SET ${sets.join(', ')} WHERE id = $${i}`,
    params
  );

  if ((r.rowCount ?? 0) === 0) return false;

  await pool.query(
    `UPDATE cache_versions SET version = version + 1, updated_at = NOW()
     WHERE component = 'bot_buttons'`
  );

  return true;
}
