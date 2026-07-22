import pool from '@/lib/db';
import type { IHealthRepository } from '../interfaces/IHealthRepository';
import type { HealthCheckRecord, HealthCheckResult } from '../types/health.types';

export class HealthRepository implements IHealthRepository {
  async record(providerId: number, result: HealthCheckResult): Promise<void> {
    await pool.query(
      `INSERT INTO gp_health_checks (provider_id, status, latency_ms, error_message, checked_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        providerId,
        result.status,
        result.latency_ms ?? null,
        result.error_message ?? null,
        result.checked_at,
      ],
    );
  }

  async findRecent(providerId: number, limit = 20): Promise<HealthCheckRecord[]> {
    const { rows } = await pool.query<HealthCheckRecord>(
      `SELECT * FROM gp_health_checks
       WHERE provider_id = $1
       ORDER BY checked_at DESC
       LIMIT $2`,
      [providerId, limit],
    );
    return rows;
  }

  async averageLatency(providerId: number, last = 20): Promise<number | null> {
    const { rows } = await pool.query<{ avg: string | null }>(
      `SELECT AVG(latency_ms) AS avg
       FROM (
         SELECT latency_ms FROM gp_health_checks
         WHERE provider_id = $1 AND latency_ms IS NOT NULL
         ORDER BY checked_at DESC
         LIMIT $2
       ) sub`,
      [providerId, last],
    );
    return rows[0]?.avg != null ? parseFloat(rows[0].avg) : null;
  }

  async purgeOlderThan(days: number): Promise<number> {
    const { rowCount } = await pool.query(
      `DELETE FROM gp_health_checks WHERE checked_at < NOW() - ($1 || ' days')::INTERVAL`,
      [days],
    );
    return rowCount ?? 0;
  }
}
