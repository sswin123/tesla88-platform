import { AdapterRegistry } from '../AdapterRegistry';
import { Kiss918Adapter } from './Kiss918Adapter';
import type { Kiss918Credentials, Kiss918Config } from './Kiss918Adapter';

function p(v: string | undefined, fallback: number) {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

AdapterRegistry.register(
  '918KISS',
  (creds, config, deps) => {
    const c: Kiss918Credentials = {
      api_token:      creds['api_token']      ?? '',
      operator_token: creds['operator_token'] ?? '',
      md5_key:        creds['md5_key']        ?? '',
      secret_key:     creds['secret_key']     ?? '',
      encrypt_key:    creds['encrypt_key']    ?? '',
      delimiter:      creds['delimiter']      ?? '',
    };
    const cfg: Kiss918Config = {
      api_base_url:        config['api_base_url']        ?? '',
      h5_api_domain:       config['h5_api_domain']       ?? '',
      h5_lobby_domain:     config['h5_lobby_domain']     ?? '',
      h5_game_domain:      config['h5_game_domain']      ?? '',
      postfix_id:          config['postfix_id']           ?? '',
      currency:            config['currency']             ?? 'MYR',
      timeout_ms:          p(config['timeout_ms'],          10_000),
      circuit_threshold:   p(config['circuit_threshold'],   5),
      circuit_cooldown_ms: p(config['circuit_cooldown_ms'], 30_000),
      datafeed_url:        config['datafeed_url']         || undefined,
      game_icon_url:       config['game_icon_url']        || undefined,
      default_lobby_url:   config['default_lobby_url']    || undefined,
      debug:               config['debug'] === 'true' || process.env.ENABLE_PROVIDER_DEBUG === 'true',
    };
    return new Kiss918Adapter(c, cfg, deps.wallet, deps.eventLogger, deps.providerRepo);
  },
  ['api_token', 'operator_token', 'md5_key', 'secret_key', 'encrypt_key', 'delimiter'],
  ['api_base_url', 'h5_api_domain', 'h5_lobby_domain', 'postfix_id', 'currency'],
  '1.0.0',
  '918KISS',
);

// Also register under the alias 'KISS918'
AdapterRegistry.register(
  'KISS918',
  (creds, config, deps) => {
    const c: Kiss918Credentials = {
      api_token:      creds['api_token']      ?? '',
      operator_token: creds['operator_token'] ?? '',
      md5_key:        creds['md5_key']        ?? '',
      secret_key:     creds['secret_key']     ?? '',
      encrypt_key:    creds['encrypt_key']    ?? '',
      delimiter:      creds['delimiter']      ?? '',
    };
    const cfg: Kiss918Config = {
      api_base_url:        config['api_base_url']        ?? '',
      h5_api_domain:       config['h5_api_domain']       ?? '',
      h5_lobby_domain:     config['h5_lobby_domain']     ?? '',
      h5_game_domain:      config['h5_game_domain']      ?? '',
      postfix_id:          config['postfix_id']           ?? '',
      currency:            config['currency']             ?? 'MYR',
      timeout_ms:          p(config['timeout_ms'],          10_000),
      circuit_threshold:   p(config['circuit_threshold'],   5),
      circuit_cooldown_ms: p(config['circuit_cooldown_ms'], 30_000),
      datafeed_url:        config['datafeed_url']         || undefined,
      game_icon_url:       config['game_icon_url']        || undefined,
      default_lobby_url:   config['default_lobby_url']    || undefined,
      debug:               config['debug'] === 'true' || process.env.ENABLE_PROVIDER_DEBUG === 'true',
    };
    return new Kiss918Adapter(c, cfg, deps.wallet, deps.eventLogger, deps.providerRepo);
  },
  ['api_token', 'operator_token', 'md5_key', 'secret_key', 'encrypt_key', 'delimiter'],
  ['api_base_url', 'h5_api_domain', 'h5_lobby_domain', 'postfix_id', 'currency'],
  '1.0.0',
  '918KISS (alias)',
);
