import pool from '@/lib/db';
import type { CallbackRequest } from './ProviderAdapter';

// Fields commonly used as transaction identifiers across providers
const ID_FIELDS = [
  'transactionId', 'transaction_id', 'txId', 'tx_id',
  'referenceId',   'reference_id',   'refId',
  'orderId',       'order_id',
  'callbackId',    'callback_id',
  'nonce',         'requestId',      'request_id',
  'transferId',    'transfer_id',    'betId', 'bet_id',
];

export function extractIdempotencyKey(req: CallbackRequest): string | null {
  if (!req.jsonBody || typeof req.jsonBody !== 'object') return null;
  const body = req.jsonBody as Record<string, unknown>;
  for (const field of ID_FIELDS) {
    const val = body[field];
    if (val !== undefined && val !== null && val !== '') {
      return String(val);
    }
  }
  return null;
}

export interface IdempotencyResult {
  isDuplicate: boolean;
  existingLogId?: number;
}

// Returns isDuplicate=true if this (provider, key) was seen before.
// On first call: inserts the record and returns isDuplicate=false.
// On subsequent calls: returns isDuplicate=true with the original log ID.
export async function checkIdempotency(
  provider: string,
  idempotencyKey: string
): Promise<IdempotencyResult> {
  try {
    const r = await pool.query<{ callback_log_id: number | null; is_new: boolean }>(
      `WITH ins AS (
         INSERT INTO provider_callback_idempotency (provider, idempotency_key)
         VALUES ($1, $2)
         ON CONFLICT (provider, idempotency_key) DO NOTHING
         RETURNING callback_log_id, true AS is_new
       )
       SELECT callback_log_id, is_new FROM ins
       UNION ALL
       SELECT callback_log_id, false AS is_new
         FROM provider_callback_idempotency
        WHERE provider = $1 AND idempotency_key = $2
        LIMIT 1`,
      [provider, idempotencyKey]
    );
    const row = r.rows[0];
    if (!row || row.is_new) return { isDuplicate: false };
    return { isDuplicate: true, existingLogId: row.callback_log_id ?? undefined };
  } catch {
    // If idempotency check fails, allow the request through (don't block callbacks)
    return { isDuplicate: false };
  }
}

export async function updateIdempotencyLogId(
  provider: string,
  idempotencyKey: string,
  logId: number
): Promise<void> {
  try {
    await pool.query(
      `UPDATE provider_callback_idempotency SET callback_log_id = $1
       WHERE provider = $2 AND idempotency_key = $3`,
      [logId, provider, idempotencyKey]
    );
  } catch { /* non-critical */ }
}
