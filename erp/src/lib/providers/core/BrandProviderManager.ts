import type { IGameProvider } from '../interfaces/IGameProvider';
import type { IProviderRepository } from '../interfaces/IProviderRepository';
import type { MasterWalletEngine } from './MasterWalletEngine';
import type { EventLogger } from './EventLogger';
import { BrandProviderRepository } from '../repositories/BrandProviderRepository';
import { createAdapter } from '../adapters/AdapterFactory';

/** Function type for decrypting an AES-256-GCM credential value. */
type DecryptFn = (ciphertext: string) => string;

/**
 * BrandProviderManager — SaaS-aware runtime adapter resolver.
 *
 * Replaces the "register adapters at startup" pattern with on-demand
 * instantiation: when a brand-provider pair is needed, credentials are
 * loaded from brand_provider_credentials, decrypted, and the appropriate
 * adapter is constructed.
 *
 * Adapter instances are cached by "brandCode:providerCode" key so the
 * same instance is reused across requests. Call invalidate() or
 * invalidateAll() after credential changes.
 *
 * The existing ProviderManager and gaming.ts singleton are NOT affected.
 */
export class BrandProviderManager {
  private readonly cache = new Map<string, IGameProvider>();

  constructor(
    private readonly brandProviderRepo: BrandProviderRepository,
    private readonly wallet: MasterWalletEngine,
    private readonly eventLogger: EventLogger,
    private readonly providerRepo: IProviderRepository,
    private readonly decrypt: DecryptFn,
  ) {}

  /** Cache key format: "BRANDCODE:PROVIDERCODE" */
  private key(brandCode: string, providerCode: string): string {
    return `${brandCode.toUpperCase()}:${providerCode.toUpperCase()}`;
  }

  /**
   * Resolve an adapter for the given brand + provider.
   * Returns a cached instance if available; otherwise loads credentials from
   * brand_provider_credentials, decrypts them, and constructs the adapter.
   *
   * @throws if the brand-provider pair is not found or not ACTIVE
   */
  async getAdapter(brandCode: string, providerCode: string): Promise<IGameProvider> {
    const cacheKey = this.key(brandCode, providerCode);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const bp = await this.brandProviderRepo.findActive(
      brandCode.toUpperCase(),
      providerCode.toUpperCase(),
    );
    if (!bp) {
      throw new Error(
        `BrandProviderManager: no active configuration found for ${cacheKey}. ` +
        `Ensure the brand exists, the provider is enabled, and status is ACTIVE.`,
      );
    }

    // Load and decrypt credentials
    const rawCreds = await this.brandProviderRepo.getCredentials(bp.id);
    const credentials: Record<string, string> = {};
    for (const row of rawCreds) {
      credentials[row.key] = row.is_encrypted
        ? this.decrypt(row.value)
        : row.value;
    }

    // Load config (never encrypted)
    const rawCfg = await this.brandProviderRepo.getConfig(bp.id);
    const config: Record<string, string> = {};
    for (const row of rawCfg) config[row.key] = row.value;

    const adapter = createAdapter(providerCode, credentials, config, {
      wallet: this.wallet,
      eventLogger: this.eventLogger,
      providerRepo: this.providerRepo,
    });

    this.cache.set(cacheKey, adapter);
    return adapter;
  }

  /**
   * Invalidate the cached adapter for a specific brand-provider pair.
   * Call after credential or config changes so the next request re-loads them.
   */
  invalidate(brandCode: string, providerCode: string): void {
    this.cache.delete(this.key(brandCode, providerCode));
  }

  /** Invalidate all cached adapters. */
  invalidateAll(): void {
    this.cache.clear();
  }

  /** Return the current cache size (for monitoring/debug). */
  get cacheSize(): number {
    return this.cache.size;
  }
}
