/**
 * AdapterFactory — thin proxy over AdapterRegistry.
 *
 * This file exists only for backwards-compatibility with import sites that
 * already call `createAdapter(...)`.  All real logic lives in AdapterRegistry.
 *
 * Do NOT add provider-specific code here.  Register new adapters in
 * adapters/index.ts (one import line) + adapters/{code}/index.ts.
 */

// Ensure all adapters are registered before any call to createAdapter().
import './index';

export { AdapterRegistry } from './AdapterRegistry';
export type { AdapterDeps, AdapterMeta } from './AdapterRegistry';

import { AdapterRegistry } from './AdapterRegistry';
import type { AdapterDeps } from './AdapterRegistry';
import type { IGameProvider } from '../interfaces/IGameProvider';

/**
 * Create an adapter for the given provider code.
 * Delegates to AdapterRegistry — the adapter must be registered first.
 *
 * @throws if the provider code is not registered.
 */
export function createAdapter(
  providerCode: string,
  credentials:  Record<string, string>,
  config:       Record<string, string>,
  deps:         AdapterDeps,
): IGameProvider {
  return AdapterRegistry.create(providerCode, credentials, config, deps);
}
