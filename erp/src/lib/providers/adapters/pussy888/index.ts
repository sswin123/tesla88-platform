import { AdapterRegistry } from '../AdapterRegistry';
import { Pussy888Adapter } from './Pussy888Adapter';
import { PUSSY888_API_URL, PUSSY888_API2_URL } from './constants';
import type { Pussy888Credentials, Pussy888Config } from './types';

function toInt(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

AdapterRegistry.register(
  'PUSSY888APP',
  (creds, config, deps) => {
    const c: Pussy888Credentials = {
      agent:      creds['agent']      ?? '',
      authcode:   creds['authcode']   ?? '',
      secret_key: creds['secret_key'] ?? '',
    };
    const cfg: Pussy888Config = {
      api_base_url:        config['api_base_url']        || PUSSY888_API_URL,
      api_base_url2:       config['api_base_url2']       || PUSSY888_API2_URL,
      currency:            config['currency']             ?? 'MYR',
      timeout_ms:          toInt(config['timeout_ms'],     15_000),
      download_url_android: config['download_url_android'] || undefined,
      download_url_ios:    config['download_url_ios']    || undefined,
      debug: config['debug'] === 'true' || process.env.ENABLE_PROVIDER_DEBUG === 'true',
    };
    return new Pussy888Adapter(c, cfg, deps.wallet, deps.eventLogger, deps.providerRepo);
  },
  ['agent', 'authcode', 'secret_key'],
  ['api_base_url', 'currency'],
  '1.0.0',
  'Pussy888App',
);
