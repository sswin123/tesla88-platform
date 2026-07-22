import pool from '@/lib/db';
import type { IEventRepository } from '../interfaces/IEventRepository';
import type { EventLogInput, EventLogRecord } from '../types/event.types';

export class EventRepository implements IEventRepository {
  async create(input: EventLogInput): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO provider_callback_logs
         (provider, action, request_method, headers, raw_body, json_body,
          ip, user_agent, response, status, processing_time, error_message, verify_result)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        input.provider,
        input.action ?? null,
        input.request_method ?? 'POST',
        input.headers ? JSON.stringify(input.headers) : null,
        input.raw_body ?? null,
        input.json_body ? JSON.stringify(input.json_body) : null,
        input.ip ?? null,
        input.user_agent ?? null,
        input.response ? JSON.stringify(input.response) : null,
        input.status ?? null,
        input.processing_time ?? null,
        input.error_message ?? null,
        input.verify_result ?? null,
      ],
    );
    return rows[0].id;
  }

  async findById(id: number): Promise<EventLogRecord | null> {
    const { rows } = await pool.query<EventLogRecord>(
      `SELECT * FROM provider_callback_logs WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByProvider(provider: string, limit = 50): Promise<EventLogRecord[]> {
    const { rows } = await pool.query<EventLogRecord>(
      `SELECT * FROM provider_callback_logs
       WHERE provider = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [provider, limit],
    );
    return rows;
  }

  async markRetryNeeded(id: number): Promise<void> {
    await pool.query(
      `UPDATE provider_callback_logs
       SET retry_needed = TRUE, retry_at = NOW()
       WHERE id = $1`,
      [id],
    );
  }
}
