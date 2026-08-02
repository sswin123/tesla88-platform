import type { IGameProvider } from '../interfaces/IGameProvider';

export interface AdapterDeps {
  wallet:        import('../core/MasterWalletEngine').MasterWalletEngine;
  eventLogger:   import('../core/EventLogger').EventLogger;
  providerRepo:  import('../interfaces/IProviderRepository').IProviderRepository;
}

type AdapterFactoryFn = (
  credentials: Record<string, string>,
  config:      Record<string, string>,
  deps:        AdapterDeps,
) => IGameProvider;

export interface AdapterMeta {
  /** Uppercase provider code (e.g. "MEGAH5"). */
  code:                string;
  /** Semver adapter version — shown in Overview Runtime panel. */
  version:             string;
  /** Human-readable name. */
  displayName:         string;
  /** Keys that MUST be present in brand_provider_credentials. */
  requiredCredentials: string[];
  /** Keys that MUST be present in brand_provider_config. */
  requiredConfig:      string[];
  factory:             AdapterFactoryFn;
}

/**
 * AdapterRegistry — the Plugin System for Game Provider Adapters.
 *
 * Adapters self-register by calling AdapterRegistry.register() from their
 * own index.ts file.  The framework (BrandProviderManager, RuntimeSnapshot,
 * health checks) never imports concrete adapter classes — it only calls
 * AdapterRegistry.create() and queries metadata via getRequiredCredentials()
 * / getRequiredConfig() / getVersion().
 *
 * Adding a new provider (e.g. JILI) without modifying the framework:
 *   1. Create  src/lib/providers/adapters/jili/index.ts  and call
 *      AdapterRegistry.register('JILI', factory, requiredCreds, requiredCfg)
 *   2. Add one import to  src/lib/providers/adapters/index.ts
 *   ↳ Framework core (BrandProviderManager, snapshot, health) unchanged.
 */
export class AdapterRegistry {
  private static readonly entries = new Map<string, AdapterMeta>();

  /**
   * Register an adapter.  Call this exactly once per provider code, from
   * the adapter's own index.ts file.
   *
   * @param code               Uppercase provider code (e.g. 'MEGAH5')
   * @param factory            Function that instantiates the adapter
   * @param requiredCredentials Credential keys that must be present for the adapter to work
   * @param requiredConfig      Config keys that must be present
   * @param version             Adapter semver version string
   * @param displayName         Human-readable provider name
   */
  static register(
    code:                string,
    factory:             AdapterFactoryFn,
    requiredCredentials: string[] = [],
    requiredConfig:      string[] = [],
    version              = '1.0.0',
    displayName          = code,
  ): void {
    const upper = code.toUpperCase();
    if (this.entries.has(upper)) {
      // Tolerate double-registration in Next.js hot-reload (module re-evaluation)
      return;
    }
    this.entries.set(upper, { code: upper, version, displayName, requiredCredentials, requiredConfig, factory });
  }

  /**
   * Create an adapter instance.
   * @throws if `code` is not registered.
   */
  static create(
    code:        string,
    credentials: Record<string, string>,
    config:      Record<string, string>,
    deps:        AdapterDeps,
  ): IGameProvider {
    const meta = this.entries.get(code.toUpperCase());
    if (!meta) {
      const known = Array.from(this.entries.keys()).join(', ') || '(none registered)';
      throw new Error(
        `AdapterRegistry: no adapter registered for "${code}". ` +
        `Registered providers: ${known}. ` +
        `To add a new provider: create adapters/{code}/index.ts and import it from adapters/index.ts.`,
      );
    }
    return meta.factory(credentials, config, deps);
  }

  /** True if an adapter is registered for this code. */
  static isRegistered(code: string): boolean {
    return this.entries.has(code.toUpperCase());
  }

  /** Required credential keys for this provider (empty array if unknown). */
  static getRequiredCredentials(code: string): string[] {
    return this.entries.get(code.toUpperCase())?.requiredCredentials ?? [];
  }

  /** Required config keys for this provider (empty array if unknown). */
  static getRequiredConfig(code: string): string[] {
    return this.entries.get(code.toUpperCase())?.requiredConfig ?? [];
  }

  /** Adapter version string ('0.0.0' if unknown). */
  static getVersion(code: string): string {
    return this.entries.get(code.toUpperCase())?.version ?? '0.0.0';
  }

  /** Human-readable display name. */
  static getDisplayName(code: string): string {
    return this.entries.get(code.toUpperCase())?.displayName ?? code;
  }

  /** Full metadata for a provider. */
  static getMeta(code: string): AdapterMeta | undefined {
    return this.entries.get(code.toUpperCase());
  }

  /** All registered provider codes. */
  static getRegisteredCodes(): string[] {
    return Array.from(this.entries.keys());
  }

  /** All registered adapter metadata (for admin dashboard). */
  static getAll(): Omit<AdapterMeta, 'factory'>[] {
    return Array.from(this.entries.values()).map(({ factory: _f, ...rest }) => rest);
  }
}
