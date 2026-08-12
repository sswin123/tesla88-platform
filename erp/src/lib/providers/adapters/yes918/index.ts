import { AdapterRegistry } from '../AdapterRegistry';
import { Yes918Adapter } from './Yes918Adapter';
import type { Yes918Credentials, Yes918Config } from './Yes918Adapter';

function toInt(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

AdapterRegistry.register(
  'YES918',
  (creds, config, deps) => {
    const c: Yes918Credentials = {
      authcode:   creds['authcode']   ?? '',
      secret_key: creds['secret_key'] ?? '',
    };
    const cfg: Yes918Config = {
      api_base_url:         config['api_base_url']         || 'https://api.yes918.com/ashx',
      agent_username:       config['agent_username']       ?? '',
      timeout_ms:           toInt(config['timeout_ms'], 15_000),
      password_length:      toInt(config['password_length'], 10),
      password_mode:        config['password_mode'] === 'fixed' ? 'fixed' : 'random',
      fixed_password:       config['fixed_password'] || undefined,
      download_url_android: config['download_url_android'] || undefined,
      download_url_ios:     config['download_url_ios']     || undefined,
    };
    return new Yes918Adapter(c, cfg, deps.wallet, deps.eventLogger, deps.providerRepo);
  },
  ['authcode', 'secret_key'],
  ['api_base_url', 'agent_username'],
  '1.0.0',
  '918KISS (Yes918)',
);
