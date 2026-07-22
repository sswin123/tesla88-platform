import pool from '@/lib/db';
import type { IProviderRepository } from '../interfaces/IProviderRepository';
import type {
  ConfigRecord,
  CredentialRecord,
  ProviderInput,
  ProviderPlayerInput,
  ProviderPlayerRecord,
  ProviderRecord,
} from '../types/provider.types';

export class ProviderRepository implements IProviderRepository {
  // ── gp_providers ──────────────────────────────────────────────────────────

  async findAll(): Promise<ProviderRecord[]> {
    const { rows } = await pool.query<ProviderRecord>(
      `SELECT * FROM gp_providers ORDER BY priority ASC, code ASC`,
    );
    return rows;
  }

  async findByCode(code: string): Promise<ProviderRecord | null> {
    const { rows } = await pool.query<ProviderRecord>(
      `SELECT * FROM gp_providers WHERE code = $1`,
      [code],
    );
    return rows[0] ?? null;
  }

  async findById(id: number): Promise<ProviderRecord | null> {
    const { rows } = await pool.query<ProviderRecord>(
      `SELECT * FROM gp_providers WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findActive(): Promise<ProviderRecord[]> {
    const { rows } = await pool.query<ProviderRecord>(
      `SELECT * FROM gp_providers WHERE status = 'ACTIVE' ORDER BY priority ASC, code ASC`,
    );
    return rows;
  }

  async create(input: ProviderInput): Promise<ProviderRecord> {
    const { rows } = await pool.query<ProviderRecord>(
      `INSERT INTO gp_providers
         (code, name, display_name, version, priority, status, environment,
          wallet_type, capabilities, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        input.code,
        input.name,
        input.display_name,
        input.version ?? '1.0.0',
        input.priority ?? 100,
        input.status ?? 'DISABLED',
        input.environment ?? 'PRODUCTION',
        input.wallet_type ?? 'SEAMLESS',
        JSON.stringify(input.capabilities ?? []),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return rows[0];
  }

  async update(id: number, patch: Partial<ProviderInput>): Promise<ProviderRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    const allowed = [
      'code', 'name', 'display_name', 'version', 'priority', 'status',
      'environment', 'wallet_type', 'capabilities', 'metadata',
    ] as const;

    for (const key of allowed) {
      if (key in patch) {
        const val = patch[key as keyof ProviderInput];
        fields.push(`${key} = $${i++}`);
        values.push(
          typeof val === 'object' && val !== null ? JSON.stringify(val) : val,
        );
      }
    }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query<ProviderRecord>(
      `UPDATE gp_providers SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  }

  async updateHealthStatus(
    id: number,
    status: string,
    checkedAt: Date,
    lastSuccessAt?: Date,
  ): Promise<void> {
    if (lastSuccessAt) {
      await pool.query(
        `UPDATE gp_providers
         SET health_status = $1, health_checked_at = $2, last_success_at = $3, updated_at = NOW()
         WHERE id = $4`,
        [status, checkedAt.toISOString(), lastSuccessAt.toISOString(), id],
      );
    } else {
      await pool.query(
        `UPDATE gp_providers
         SET health_status = $1, health_checked_at = $2, updated_at = NOW()
         WHERE id = $3`,
        [status, checkedAt.toISOString(), id],
      );
    }
  }

  // ── gp_credentials ────────────────────────────────────────────────────────

  async getCredentials(providerId: number): Promise<CredentialRecord[]> {
    const { rows } = await pool.query<CredentialRecord>(
      `SELECT * FROM gp_credentials WHERE provider_id = $1 ORDER BY key ASC`,
      [providerId],
    );
    return rows;
  }

  async setCredential(
    providerId: number,
    key: string,
    value: string,
    isEncrypted = true,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO gp_credentials (provider_id, key, value, is_encrypted, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (provider_id, key) DO UPDATE
       SET value = EXCLUDED.value, is_encrypted = EXCLUDED.is_encrypted, updated_at = NOW()`,
      [providerId, key, value, isEncrypted],
    );
  }

  async deleteCredential(providerId: number, key: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `DELETE FROM gp_credentials WHERE provider_id = $1 AND key = $2`,
      [providerId, key],
    );
    return (rowCount ?? 0) > 0;
  }

  // ── gp_config ─────────────────────────────────────────────────────────────

  async getConfig(providerId: number): Promise<ConfigRecord[]> {
    const { rows } = await pool.query<ConfigRecord>(
      `SELECT * FROM gp_config WHERE provider_id = $1 ORDER BY key ASC`,
      [providerId],
    );
    return rows;
  }

  async setConfig(providerId: number, key: string, value: string): Promise<void> {
    await pool.query(
      `INSERT INTO gp_config (provider_id, key, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (provider_id, key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = NOW()`,
      [providerId, key, value],
    );
  }

  async deleteConfig(providerId: number, key: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `DELETE FROM gp_config WHERE provider_id = $1 AND key = $2`,
      [providerId, key],
    );
    return (rowCount ?? 0) > 0;
  }

  // ── gp_players ────────────────────────────────────────────────────────────

  async findPlayer(providerId: number, userId: number): Promise<ProviderPlayerRecord | null> {
    const { rows } = await pool.query<ProviderPlayerRecord>(
      `SELECT * FROM gp_players WHERE provider_id = $1 AND user_id = $2`,
      [providerId, userId],
    );
    return rows[0] ?? null;
  }

  async createPlayer(input: ProviderPlayerInput): Promise<ProviderPlayerRecord> {
    const { rows } = await pool.query<ProviderPlayerRecord>(
      `INSERT INTO gp_players
         (provider_id, user_id, provider_account_id, currency,
          provider_player_id, is_registered, registered_at, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        input.provider_id,
        input.user_id,
        input.provider_account_id,
        input.currency,
        input.provider_player_id ?? null,
        input.is_registered ?? false,
        input.registered_at ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return rows[0];
  }

  async updatePlayer(
    id: number,
    patch: Partial<ProviderPlayerInput>,
  ): Promise<ProviderPlayerRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    const allowed = [
      'provider_player_id', 'provider_account_id', 'currency',
      'is_registered', 'registered_at', 'metadata',
    ] as const;

    for (const key of allowed) {
      if (key in patch) {
        const val = patch[key as keyof ProviderPlayerInput];
        fields.push(`${key} = $${i++}`);
        values.push(
          key === 'metadata' && val !== null && typeof val === 'object'
            ? JSON.stringify(val)
            : val ?? null,
        );
      }
    }

    if (fields.length === 0) {
      const { rows } = await pool.query<ProviderPlayerRecord>(
        `SELECT * FROM gp_players WHERE id = $1`,
        [id],
      );
      return rows[0] ?? null;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query<ProviderPlayerRecord>(
      `UPDATE gp_players SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  }
}
