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
      api_account_token: creds['api_account_token'] ?? '',
      operator_token:    creds['operator_token']    ?? '',
      secret_key:        creds['secret_key']        ?? '',
      encrypt_key:       creds['encrypt_key']       ?? '',
      md5_key:           creds['md5_key']           ?? '',
      delimiter:         creds['delimiter']         ?? '|',
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
      game_icon_url:   config['game_icon_url']    || undefined,
      debug:           config['debug'] === 'true' || process.env.ENABLE_PROVIDER_DEBUG === 'true',
    };
    return new MegaH5Adapter(c, cfg, deps.wallet, deps.eventLogger, deps.providerRepo, deps.gpProviderId ?? 0);
  },
  // Required credentials — must all be present in brand_provider_credentials for adapter to build.
  // api_account_token: H5 Login body + all Operations API header calls.
  // operator_token:    validates inbound MEGAH5 callback HTTP header "token:".
  // secret_key / encrypt_key / md5_key: DES-CBC + MD5 signature for H5 Login QS.
  ['api_account_token', 'operator_token', 'secret_key', 'encrypt_key', 'md5_key'],
  // Required config — must all be present in brand_provider_config for adapter to build.
  // h5_game_domain: base URL for Option 2 CallGame launch URL.
  ['api_base_url', 'h5_api_domain', 'h5_game_domain', 'postfix_id', 'currency'],
  '1.0.0',
  'MegaH5',
);
