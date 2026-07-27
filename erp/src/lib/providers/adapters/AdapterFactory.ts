import type { IGameProvider } from '../interfaces/IGameProvider';
import type { IProviderRepository } from '../interfaces/IProviderRepository';
import type { MasterWalletEngine } from '../core/MasterWalletEngine';
import type { EventLogger } from '../core/EventLogger';
import { Kiss918Adapter } from './kiss918/Kiss918Adapter';
import type { Kiss918Credentials, Kiss918Config } from './kiss918/Kiss918Adapter';

/**
 * NaN-safe integer parser. Returns `fallback` when `val` is absent or
 * produces NaN (e.g. "abc", "10abc").
 */
function parseIntSafe(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

export interface AdapterDeps {
  wallet: MasterWalletEngine;
  eventLogger: EventLogger;
  providerRepo: IProviderRepository;
}

/**
 * Create the correct IGameProvider adapter for a given provider code,
 * given decrypted key-value credential and config maps.
 *
 * Extend this function when new providers are added — no other file changes needed.
 *
 * @param providerCode  - uppercase provider code (e.g. "KISS918", "MEGAH5")
 * @param credentials   - decrypted key-value credential map from brand_provider_credentials
 * @param config        - key-value config map from brand_provider_config
 * @param deps          - shared platform dependencies (wallet, eventLogger, providerRepo)
 */
export function createAdapter(
  providerCode: string,
  credentials: Record<string, string>,
  config: Record<string, string>,
  deps: AdapterDeps,
): IGameProvider {
  switch (providerCode.toUpperCase()) {
    case 'KISS918':
    case '918KISS': {
      const creds: Kiss918Credentials = {
        api_token:      credentials['api_token']      ?? '',
        operator_token: credentials['operator_token'] ?? '',
        md5_key:        credentials['md5_key']        ?? '',
        secret_key:     credentials['secret_key']     ?? '',
        encrypt_key:    credentials['encrypt_key']    ?? '',
        delimiter:      credentials['delimiter']      ?? '',
      };
      const cfg: Kiss918Config = {
        api_base_url:        config['api_base_url']        ?? '',
        datafeed_url:        config['datafeed_url']         || undefined,
        h5_api_domain:       config['h5_api_domain']        ?? '',
        h5_lobby_domain:     config['h5_lobby_domain']      ?? '',
        h5_game_domain:      config['h5_game_domain']       ?? '',
        game_icon_url:       config['game_icon_url']        || undefined,
        postfix_id:          config['postfix_id']            ?? '',
        currency:            config['currency']              ?? 'MYR',
        timeout_ms:          parseIntSafe(config['timeout_ms'],          10_000),
        circuit_threshold:   parseIntSafe(config['circuit_threshold'],   5),
        circuit_cooldown_ms: parseIntSafe(config['circuit_cooldown_ms'], 30_000),
        default_lobby_url:   config['default_lobby_url']    || undefined,
        debug:
          config['debug'] === 'true' ||
          process.env.ENABLE_PROVIDER_DEBUG === 'true',
      };
      return new Kiss918Adapter(
        creds, cfg, deps.wallet, deps.eventLogger, deps.providerRepo,
      );
    }

    default:
      throw new Error(
        `AdapterFactory: no adapter implementation for provider code "${providerCode}". ` +
        `Register the adapter by adding a case to AdapterFactory.createAdapter().`,
      );
  }
}
