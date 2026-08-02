/**
 * Provider key helpers — derive required keys from AdapterRegistry.
 *
 * The AdapterRegistry is the single source of truth for required
 * credential and config keys.  This module re-exports utility accessors
 * so callers don't need to import AdapterRegistry directly.
 *
 * Adding a new provider's required keys: add them to the register() call
 * in adapters/{code}/index.ts.  No change needed here.
 */

// Import adapters/index.ts to ensure registrations are loaded before queries.
import '../adapters/index';
import { AdapterRegistry } from '../adapters/AdapterRegistry';

/** Required credential keys for a provider (empty array if not registered). */
export function getRequiredCredentialKeys(providerCode: string): string[] {
  return AdapterRegistry.getRequiredCredentials(providerCode.toUpperCase());
}

/** Required config keys for a provider (empty array if not registered). */
export function getRequiredConfigKeys(providerCode: string): string[] {
  return AdapterRegistry.getRequiredConfig(providerCode.toUpperCase());
}

/** URL-type config keys — used by Connection Test for reachability checks. */
export const URL_CONFIG_KEYS: Array<{ key: string; label: string }> = [
  { key: 'api_base_url',    label: 'API Base URL'   },
  { key: 'h5_api_domain',   label: 'H5 API URL'     },
  { key: 'h5_lobby_domain', label: 'H5 Lobby URL'   },
  { key: 'h5_game_domain',  label: 'H5 Game URL'    },
  { key: 'datafeed_url',    label: 'DataFeed URL'   },
];

/** All known credential keys with human-readable labels. */
export const CREDENTIAL_KEY_LABELS: Record<string, string> = {
  api_token:      'Access Token',
  operator_token: 'Operator Token',
  secret_key:     'SecretKey',
  md5_key:        'Md5EncryptKey',
  encrypt_key:    'EncryptKey',
  delimiter:      'Delimiter',
  secret_code:    'Secret Code',
  sn:             'SN',
  agent_login_id: 'Agent Login ID',
};

// Legacy named exports for existing import sites
export const REQUIRED_CREDENTIAL_KEYS: Record<string, string[]> = new Proxy({} as Record<string, string[]>, {
  get(_target, prop: string) { return AdapterRegistry.getRequiredCredentials(prop.toUpperCase()); },
});

export const REQUIRED_CONFIG_KEYS: Record<string, string[]> = new Proxy({} as Record<string, string[]>, {
  get(_target, prop: string) { return AdapterRegistry.getRequiredConfig(prop.toUpperCase()); },
});
