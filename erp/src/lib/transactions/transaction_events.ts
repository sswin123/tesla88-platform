export const TransactionEvent = {
  DEPOSIT_CREATED:       'DEPOSIT_CREATED',
  DEPOSIT_PROCESSING:    'DEPOSIT_PROCESSING',
  DEPOSIT_APPROVED:      'DEPOSIT_APPROVED',
  DEPOSIT_REJECTED:      'DEPOSIT_REJECTED',
  WITHDRAW_CREATED:      'WITHDRAW_CREATED',
  WITHDRAW_PROCESSING:   'WITHDRAW_PROCESSING',
  WITHDRAW_APPROVED:     'WITHDRAW_APPROVED',
  WITHDRAW_REJECTED:     'WITHDRAW_REJECTED',
  INTERNAL_NOTE_CREATED: 'INTERNAL_NOTE_CREATED',
  INTERNAL_NOTE_UPDATED: 'INTERNAL_NOTE_UPDATED',
  INTERNAL_NOTE_DELETED: 'INTERNAL_NOTE_DELETED',
  RECEIPT_UPLOADED:      'RECEIPT_UPLOADED',
  RECEIPT_VIEWED:        'RECEIPT_VIEWED',
  RECEIPT_DOWNLOADED:    'RECEIPT_DOWNLOADED',
  STATUS_CHANGED:        'STATUS_CHANGED',
} as const;

export type TransactionEventType = typeof TransactionEvent[keyof typeof TransactionEvent];

export type TransactionType = 'deposit' | 'withdrawal';

export interface TransactionAuditPayload {
  adminId: number;
  event: TransactionEventType;
  transactionType: TransactionType;
  transactionId: number;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function emitTransactionEvent(
  event: TransactionEventType,
  payload: Record<string, unknown>
): Promise<void> {
  void event;
  void payload;
}
