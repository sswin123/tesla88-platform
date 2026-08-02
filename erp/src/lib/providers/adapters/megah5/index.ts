import { AdapterRegistry } from '../AdapterRegistry';
import { MegaH5Adapter } from './MegaH5Adapter';
import type { MegaH5Credentials, MegaH5Config } from './types';

function p(v: string | undefined, fallback: number) {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

AdapterRegistry.register(
  'MEGAH5',
  (creds, config, deps) => {
    const c: MegaH5Credentials = {
      api_token:      creds['api_token']      ?? '',
      operator_token: creds['operator_token'] ?? '',
      secret_key:     creds['secret_key']     ?? '',
      encrypt_key:    creds['encrypt_key']    ?? '',
      md5_key:        creds['md5_key']        ?? '',
      delimiter:      creds['delimiter']      ?? '|',
    };
    const cfg: MegaH5Config = {
      api_base_url:    config['api_base_url']    ?? '',
      h5_api_domain:   config['h5_api_domain']   ?? '',
      h5_lobby_domain: config['h5_lobby_domain'] ?? '',
      h5_game_domain:  config['h5_game_domain']  ?? '',
      postfix_id:      config['postfix_id']       ?? '',
      currency:        config['currency']         ?? 'MYR',
      timeout_ms:      p(config['timeout_ms'],      10_000),
      datafeed_url:    config['datafeed_url']     || undefined,
      debug:           config['debug'] === 'true' || process.env.ENABLE_PROVIDER_DEBUG === 'true',
    };
    return new MegaH5Adapter(c, cfg, deps.wallet, deps.eventLogger, deps.providerRepo, deps.gpProviderId ?? 0);
  },
  ['api_token', 'operator_token', 'secret_key', 'encrypt_key', 'md5_key', 'delimiter'],
  ['api_base_url', 'h5_api_domain', 'h5_lobby_domain', 'postfix_id', 'currency'],
  '1.0.0',
  'MegaH5',
);
