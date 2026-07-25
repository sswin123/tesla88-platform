import { logAudit } from '@/lib/repositories/audit_repo';
import type { TransactionAuditPayload } from './transaction_events';

export async function recordTransactionAudit(payload: TransactionAuditPayload): Promise<void> {
  await logAudit({
    admin_id:    payload.adminId,
    action:      payload.event,
    target_type: payload.transactionType,
    target_id:   payload.transactionId,
    description: payload.description,
    new_value:   payload.metadata ?? null,
  });
}
