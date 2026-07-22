/**
 * Provider Registry types.
 * Represents a game provider as stored in the gp_providers table.
 */

export type ProviderStatus = 'ACTIVE' | 'DISABLED' | 'MAINTENANCE' | 'DEPRECATED';
export type ProviderEnvironment = 'PRODUCTION' | 'SANDBOX';
export type ProviderWalletType = 'SEAMLESS' | 'TRANSFER';
export type ProviderHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

/** A provider row as returned from the database. */
export interface ProviderRecord {
  id: number;
  code: string;
  name: string;
  display_name: string;
  version: string;
  priority: number;
  status: ProviderStatus;
  environment: ProviderEnvironment;
  wallet_type: ProviderWalletType;
  /** Array of ProviderCapability strings stored as JSONB. */
  capabilities: string[];
  health_status: ProviderHealthStatus;
  health_checked_at: string | null;
  last_success_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Input shape for creating or updating a provider. */
export interface ProviderInput {
  code: string;
  name: string;
  display_name: string;
  version?: string;
  priority?: number;
  status?: ProviderStatus;
  environment?: ProviderEnvironment;
  wallet_type?: ProviderWalletType;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

/** A single encrypted or plain-text credential entry. */
export interface CredentialRecord {
  id: number;
  provider_id: number;
  key: string;
  /** Raw value — decryption is handled by SecurityService before use. */
  value: string;
  is_encrypted: boolean;
  updated_at: string;
}

/** Decrypted credentials resolved by ProviderManager at startup. */
export type ProviderCredentials = Record<string, string>;

/** A single config entry (non-secret). */
export interface ConfigRecord {
  id: number;
  provider_id: number;
  key: string;
  value: string;
  updated_at: string;
}

/** Resolved config map for a provider. */
export type ProviderConfig = Record<string, string>;

/** Full resolved provider with credentials + config, used by adapters. */
export interface ResolvedProvider {
  record: ProviderRecord;
  credentials: ProviderCredentials;
  config: ProviderConfig;
}

/** Provider player account mapping. */
export interface ProviderPlayerRecord {
  id: number;
  provider_id: number;
  user_id: number;
  provider_player_id: string | null;
  provider_account_id: string;
  currency: string;
  is_registered: boolean;
  registered_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProviderPlayerInput {
  provider_id: number;
  user_id: number;
  provider_account_id: string;
  currency: string;
  provider_player_id?: string | null;
  is_registered?: boolean;
  registered_at?: string | null;
  metadata?: Record<string, unknown>;
}
