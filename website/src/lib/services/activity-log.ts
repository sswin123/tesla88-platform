import pool from '@/lib/db';
import type { PoolClient } from 'pg';

export type ActivityCategory =
  | 'ACCOUNT'
  | 'PROFILE'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'WALLET'
  | 'BALANCE'
  | 'PROMOTION'
  | 'REFERRAL'
  | 'TELEGRAM'
  | 'GAME_ACCOUNT'
  | 'SYSTEM';

export type ActivitySource =
  | 'WEBSITE'
  | 'ERP'
  | 'TELEGRAM'
  | 'API'
  | 'PAYMENT_GATEWAY'
  | 'SYSTEM';

export type ActivityLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export interface LogActivityInput {
  member_id:       number;
  category:        ActivityCategory;
  action:          string;
  title:           string;
  description?:    string | null;
  amount?:         number | null;
  balance_before?: number | null;
  balance_after?:  number | null;
  reference_type?: string | null;
  reference_id?:   number | null;
  operator_type?:  'MEMBER' | 'STAFF' | 'SYSTEM';
  operator_id?:    number | null;
  operator_name?:  string | null;
  source?:         ActivitySource;
  level?:          ActivityLevel;
  ip_address?:     string | null;
  device?:         string | null;
  remark?:         string | null;
  metadata?:       Record<string, unknown> | null;
  client?:         PoolClient;
}

const INSERT_SQL = `
  INSERT INTO member_activity_logs (
    member_id, category, action, title, description,
    amount, balance_before, balance_after,
    reference_type, reference_id,
    operator_type, operator_id, operator_name,
    source, level, ip_address, device, remark, metadata
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
  RETURNING activity_id, id
`;

export class ActivityLogService {
  static async log(input: LogActivityInput): Promise<string | null> {
    const {
      member_id, category, action, title,
      description, amount, balance_before, balance_after,
      reference_type, reference_id,
      operator_type = 'SYSTEM', operator_id, operator_name,
      source = 'SYSTEM', level = 'INFO',
      ip_address, device, remark, metadata,
      client: providedClient,
    } = input;

    const values = [
      member_id, category, action, title,
      description ?? null,
      amount        != null ? String(amount)         : null,
      balance_before!= null ? String(balance_before) : null,
      balance_after != null ? String(balance_after)  : null,
      reference_type ?? null,
      reference_id   ?? null,
      operator_type,
      operator_id    ?? null,
      operator_name  ?? null,
      source, level,
      ip_address  ?? null,
      device      ?? null,
      remark      ?? null,
      metadata ? JSON.stringify(metadata) : null,
    ];

    try {
      const db = providedClient ?? pool;
      const result = await db.query<{ activity_id: string; id: number }>(INSERT_SQL, values);
      return result.rows[0]?.activity_id ?? null;
    } catch (e) {
      console.error('[ActivityLog] Failed to log:', category, action, 'member:', member_id, e);
      return null;
    }
  }
}
