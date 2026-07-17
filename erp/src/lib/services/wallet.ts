import type { PoolClient } from 'pg';

export const ADJUSTMENT_TYPES = [
  'MANUAL_DEPOSIT',
  'MANUAL_WITHDRAWAL',
  'PAYMENT_GATEWAY',
  'PROMOTION_BONUS',
  'CASHBACK',
  'REBATE',
  'REFERRAL_BONUS',
  'VIP_BONUS',
  'LOSS_CREDIT',
  'COMPENSATION',
  'CORRECTION',
  'OTHERS',
] as const;

export type AdjustmentType = typeof ADJUSTMENT_TYPES[number];

export type Direction = 'C' | 'D';

// Types that always credit; MANUAL_WITHDRAWAL always debits.
// CORRECTION and OTHERS require explicit direction from the caller.
export const TYPE_DIRECTION: Partial<Record<AdjustmentType, Direction>> = {
  MANUAL_DEPOSIT:    'C',
  MANUAL_WITHDRAWAL: 'D',
  PAYMENT_GATEWAY:   'C',
  PROMOTION_BONUS:   'C',
  CASHBACK:          'C',
  REBATE:            'C',
  REFERRAL_BONUS:    'C',
  VIP_BONUS:         'C',
  LOSS_CREDIT:       'C',
  COMPENSATION:      'C',
};

export interface AdjustWalletOpts {
  userId:             number;
  type:               AdjustmentType;
  direction:          Direction;
  amount:             number;
  gateway?:           string | null;
  referenceNumber?:   string | null;
  remark:             string;
  attachmentMediaId?: number | null;
  operatorAdminId:    number;
  ipAddress?:         string | null;
}

export interface WalletTxRow {
  id:             string;
  user_id:        number;
  type:           string;
  direction:      string;
  amount:         string;
  balance_before: string;
  balance_after:  string;
  gateway:        string | null;
  reference_number: string | null;
  remark:         string;
  created_at:     string;
}

/**
 * The single entry point for all wallet balance changes.
 * Must be called with a PoolClient that already has BEGIN active.
 * Locks the user row, validates balance for debits, updates totals,
 * and inserts a wallet_transactions record.
 */
export async function adjustWallet(
  client: PoolClient,
  opts: AdjustWalletOpts,
): Promise<WalletTxRow> {
  const {
    userId, type, direction, amount,
    gateway, referenceNumber, remark,
    attachmentMediaId, operatorAdminId, ipAddress,
  } = opts;

  const { rows: userRows } = await client.query<{ net_deposit: string }>(
    'SELECT net_deposit FROM users WHERE id = $1 FOR UPDATE',
    [userId],
  );
  if (!userRows[0]) throw new Error(`User ${userId} not found`);

  const balanceBefore = parseFloat(userRows[0].net_deposit);

  if (direction === 'D' && amount > balanceBefore) {
    throw new Error(
      `Insufficient balance: available RM ${balanceBefore.toFixed(2)}, requested RM ${amount.toFixed(2)}`,
    );
  }

  if (direction === 'C') {
    await client.query(
      'UPDATE users SET total_deposit = total_deposit + $1 WHERE id = $2',
      [amount, userId],
    );
  } else {
    await client.query(
      'UPDATE users SET total_withdraw = total_withdraw + $1 WHERE id = $2',
      [amount, userId],
    );
  }

  const balanceAfter = direction === 'C'
    ? balanceBefore + amount
    : balanceBefore - amount;

  const { rows } = await client.query<WalletTxRow>(
    `INSERT INTO wallet_transactions
       (user_id, type, direction, amount, balance_before, balance_after,
        gateway, reference_number, remark, attachment_media_id, operator_admin_id, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      userId, type, direction, amount, balanceBefore, balanceAfter,
      gateway ?? null, referenceNumber ?? null, remark,
      attachmentMediaId ?? null, operatorAdminId, ipAddress ?? null,
    ],
  );

  return rows[0];
}
