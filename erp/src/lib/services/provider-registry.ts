/**
 * ProviderRegistryService — Gaming Provider Framework Phase 3
 *
 * Single Source Of Truth for all provider data in the ERP.
 *
 * ARCHITECTURE RULE:
 *   Any code that needs display_name, wallet_type, metadata, or capabilities
 *   for a provider MUST go through this service — never query gp_providers directly
 *   outside of this file (except in callback route protocol-entry SQL, which are
 *   Allowed Hardcodes per migration 093 notes).
 *
 * Cache:
 *   Module-level singleton with 5-minute TTL.
 *   Node.js is single-threaded — Map is safe without locking.
 *   Stale-on-error: if the DB is unreachable, the last cached value is returned
 *   rather than throwing, so calling code is never blocked by a registry outage.
 *
 * Invalidation:
 *   Call providerRegistry.invalidate(code) after updating gp_providers credentials
 *   or config so the next lookup fetches fresh data.
 */

import pool from '@/lib/db';
import type { ProviderRecord } from '@/lib/providers/types/provider.types';
import type { ProviderMetadata } from '@/lib/providers/types/metadata.types';

// ─── Cache internals ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  record: ProviderRecord;
  expiresAt: number;
}

const SELECT_PROVIDER_SQL = `
  SELECT
    id, code, name, display_name, version, priority,
    status, environment, wallet_type,
    capabilities, health_status, health_checked_at,
    last_success_at, metadata, created_at, updated_at
  FROM gp_providers
  WHERE UPPER(code) = $1
  LIMIT 1
`;

// ─── ProviderRegistryService ──────────────────────────────────────────────────

class ProviderRegistryService {
  private readonly cache = new Map<string, CacheEntry>();

  private cacheKey(code: string): string {
    return code.toUpperCase();
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }

  private store(record: ProviderRecord): void {
    this.cache.set(this.cacheKey(record.code), {
      record,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  /**
   * Look up a provider by code. Returns null if the provider does not exist
   * in gp_providers (not configured, or wrong code).
   *
   * Never throws — on DB error, returns the stale cached entry if available,
   * otherwise null.
   */
  async getProvider(code: string): Promise<ProviderRecord | null> {
    const key = this.cacheKey(code);
    const cached = this.cache.get(key);

    if (cached && !this.isExpired(cached)) return cached.record;

    try {
      const result = await pool.query<ProviderRecord>(SELECT_PROVIDER_SQL, [key]);
      const record = result.rows[0] ?? null;
      if (record) this.store(record);
      return record;
    } catch (err) {
      console.error('[ProviderRegistry] getProvider DB error:', code, err);
      return cached?.record ?? null; // return stale if available
    }
  }

  /**
   * Resolve a provider code to its human-readable display_name.
   * Falls back to the provider code itself if the provider is not found.
   *
   * @example
   *   await providerRegistry.getDisplayName('MEGAAPP')  // 'MEGA888(APP)'
   *   await providerRegistry.getDisplayName('UNKNOWN')  // 'UNKNOWN'  (fallback)
   */
  async getDisplayName(code: string): Promise<string> {
    const provider = await this.getProvider(code);
    return provider?.display_name ?? code;
  }

  /**
   * Return the typed metadata for a provider.
   * Falls back to an empty object if the provider is not found.
   */
  async getMetadata(code: string): Promise<ProviderMetadata> {
    const provider = await this.getProvider(code);
    return (provider?.metadata ?? {}) as ProviderMetadata;
  }

  /**
   * Return the wallet_type for a provider ('SEAMLESS' | 'TRANSFER').
   * Falls back to 'SEAMLESS' — the safer default (no float movement).
   */
  async getWalletType(code: string): Promise<'SEAMLESS' | 'TRANSFER'> {
    const provider = await this.getProvider(code);
    return provider?.wallet_type ?? 'SEAMLESS';
  }

  /**
   * Return the raw capabilities array for a provider.
   * Falls back to [] if the provider is not found.
   */
  async getCapabilities(code: string): Promise<string[]> {
    const provider = await this.getProvider(code);
    return provider?.capabilities ?? [];
  }

  /**
   * Evict a single provider from the cache.
   * Call this after updating gp_providers credentials, config, or metadata.
   */
  invalidate(code: string): void {
    this.cache.delete(this.cacheKey(code));
  }

  /** Evict all providers from the cache. */
  invalidateAll(): void {
    this.cache.clear();
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/**
 * Module-level singleton. Import and use directly:
 *   import { providerRegistry } from '@/lib/services/provider-registry';
 *   const name = await providerRegistry.getDisplayName('MEGAAPP');
 */
export const providerRegistry = new ProviderRegistryService();
