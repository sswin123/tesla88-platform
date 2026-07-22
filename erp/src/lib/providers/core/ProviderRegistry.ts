import type { IGameProvider } from '../interfaces/IGameProvider';

/**
 * In-memory registry that holds all active IGameProvider adapter instances.
 *
 * Adapters are registered at application startup by ProviderManager.boot().
 * The registry is the single lookup point — every game operation resolves
 * an adapter here before dispatching.
 */
export class ProviderRegistry {
  private readonly adapters = new Map<string, IGameProvider>();

  /** Register an adapter.  Overwrites any existing registration for the same code. */
  register(adapter: IGameProvider): void {
    this.adapters.set(adapter.code, adapter);
  }

  /** Remove an adapter from the registry (e.g. when a provider is disabled). */
  unregister(code: string): void {
    this.adapters.delete(code);
  }

  /**
   * Resolve an adapter by provider code.
   * @throws {Error} if no adapter is registered for the given code.
   */
  get(code: string): IGameProvider {
    const adapter = this.adapters.get(code);
    if (!adapter) {
      throw new Error(
        `No adapter registered for provider "${code}". ` +
        `Ensure the provider is ACTIVE and its adapter has been registered.`,
      );
    }
    return adapter;
  }

  /** Return true if an adapter is currently registered. */
  has(code: string): boolean {
    return this.adapters.has(code);
  }

  /** Return all currently registered adapter codes. */
  listCodes(): string[] {
    return Array.from(this.adapters.keys());
  }

  /** Return all registered adapters. */
  listAll(): IGameProvider[] {
    return Array.from(this.adapters.values());
  }

  /** Clear all registrations (used in tests). */
  clear(): void {
    this.adapters.clear();
  }
}
