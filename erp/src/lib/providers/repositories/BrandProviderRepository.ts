import pool from '@/lib/db';

export interface BrandProviderRecord {
  id: number;               // brand_providers.id
  brand_id: number;
  provider_id: number;
  brand_code: string;
  provider_code: string;
  provider_name: string;
  status: string;
  wallet_type: string;
  environment: string;
  currency: string;
  health_status: string;
}

export interface RawCredentialRow {
  key: string;
  value: string;
  is_encrypted: boolean;
}

export interface RawConfigRow {
  key: string;
  value: string;
}

export class BrandProviderRepository {
  /**
   * Find the brand_providers row for any status — used by Connection Test
   * so admins can test before activating a provider.
   */
  async findByBrandAndProvider(brandCode: string, providerCode: string): Promise<BrandProviderRecord | null> {
    const { rows } = await pool.query<BrandProviderRecord>(
      `SELECT
         bp.id, bp.brand_id, bp.provider_id,
         b.code  AS brand_code,
         p.code  AS provider_code,
         p.name  AS provider_name,
         bp.status, bp.wallet_type, bp.environment, bp.currency, bp.health_status
       FROM brand_providers bp
       JOIN brands        b ON b.id = bp.brand_id
       JOIN gp_providers  p ON p.id = bp.provider_id
       WHERE b.code = $1 AND p.code = $2
       LIMIT 1`,
      [brandCode, providerCode],
    );
    return rows[0] ?? null;
  }

  /**
   * Find the brand_providers row for a given (brandCode, providerCode) pair.
   * Returns null if brand doesn't exist or provider isn't enabled for brand.
   * ACTIVE and TESTING are both treated as live — TESTING allows UAT without
   * a separate environment while keeping the status visible in the UI.
   * DISABLED / MAINTENANCE / DEPRECATED cannot serve requests.
   */
  async findActive(brandCode: string, providerCode: string): Promise<BrandProviderRecord | null> {
    const { rows } = await pool.query<BrandProviderRecord>(
      `SELECT
         bp.id, bp.brand_id, bp.provider_id,
         b.code  AS brand_code,
         p.code  AS provider_code,
         p.name  AS provider_name,
         bp.status, bp.wallet_type, bp.environment, bp.currency, bp.health_status
       FROM brand_providers bp
       JOIN brands        b ON b.id = bp.brand_id
       JOIN gp_providers  p ON p.id = bp.provider_id
       WHERE b.code = $1 AND p.code = $2 AND bp.status IN ('ACTIVE', 'TESTING')
       ORDER BY (bp.status = 'ACTIVE') DESC
       LIMIT 1`,
      [brandCode, providerCode],
    );
    return rows[0] ?? null;
  }

  /** Return raw credential rows (NOT decrypted) for a brand_providers.id. */
  async getCredentials(brandProviderId: number): Promise<RawCredentialRow[]> {
    const { rows } = await pool.query<RawCredentialRow>(
      `SELECT key, value, is_encrypted
       FROM brand_provider_credentials
       WHERE brand_provider_id = $1
       ORDER BY key ASC`,
      [brandProviderId],
    );
    return rows;
  }

  /** Return raw config rows for a brand_providers.id. */
  async getConfig(brandProviderId: number): Promise<RawConfigRow[]> {
    const { rows } = await pool.query<RawConfigRow>(
      `SELECT key, value
       FROM brand_provider_config
       WHERE brand_provider_id = $1
       ORDER BY key ASC`,
      [brandProviderId],
    );
    return rows;
  }
}
