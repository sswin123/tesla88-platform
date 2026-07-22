import type {
  ConfigRecord,
  CredentialRecord,
  ProviderInput,
  ProviderPlayerInput,
  ProviderPlayerRecord,
  ProviderRecord,
} from '../types/provider.types';

/**
 * Data access contract for gp_providers, gp_credentials, gp_config,
 * and gp_players tables.
 */
export interface IProviderRepository {
  // ── gp_providers ──────────────────────────────────────────────────────────

  findAll(): Promise<ProviderRecord[]>;

  findByCode(code: string): Promise<ProviderRecord | null>;

  findById(id: number): Promise<ProviderRecord | null>;

  findActive(): Promise<ProviderRecord[]>;

  create(input: ProviderInput): Promise<ProviderRecord>;

  update(id: number, patch: Partial<ProviderInput>): Promise<ProviderRecord | null>;

  updateHealthStatus(
    id: number,
    status: string,
    checkedAt: Date,
    lastSuccessAt?: Date,
  ): Promise<void>;

  // ── gp_credentials ────────────────────────────────────────────────────────

  getCredentials(providerId: number): Promise<CredentialRecord[]>;

  setCredential(providerId: number, key: string, value: string, isEncrypted?: boolean): Promise<void>;

  deleteCredential(providerId: number, key: string): Promise<boolean>;

  // ── gp_config ─────────────────────────────────────────────────────────────

  getConfig(providerId: number): Promise<ConfigRecord[]>;

  setConfig(providerId: number, key: string, value: string): Promise<void>;

  deleteConfig(providerId: number, key: string): Promise<boolean>;

  // ── gp_players ────────────────────────────────────────────────────────────

  findPlayer(providerId: number, userId: number): Promise<ProviderPlayerRecord | null>;

  createPlayer(input: ProviderPlayerInput): Promise<ProviderPlayerRecord>;

  updatePlayer(
    id: number,
    patch: Partial<ProviderPlayerInput>,
  ): Promise<ProviderPlayerRecord | null>;
}
