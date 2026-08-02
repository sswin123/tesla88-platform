import { AdapterRegistry } from '../AdapterRegistry';
import { MegaAppAdapter } from './MegaAppAdapter';
import type { MegaAppCredentials, MegaAppConfig } from './types';

function p(v: string | undefined, fallback: number) {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

AdapterRegistry.register(
  'MEGAAPP',
  (creds, config, deps) => {
    const c: MegaAppCredentials = {
      secret_code:    creds['secret_code']    ?? '',
      sn:             creds['sn']             ?? '',
      agent_login_id: creds['agent_login_id'] ?? '',
    };
    const cfg: MegaAppConfig = {
      api_base_url:          config['api_base_url']          ?? '',
      currency:              config['currency']               ?? 'MYR',
      timeout_ms:            p(config['timeout_ms'],           15_000),
      password_mode:         config['password_mode'] === 'fixed' ? 'fixed' : 'random',
      password_length:       p(config['password_length'],      10),
      fixed_password:        config['fixed_password']        || undefined,
      download_url_android:  config['download_url_android']  || undefined,
      download_url_ios:      config['download_url_ios']      || undefined,
      apk_version:           config['apk_version']           || undefined,
      apk_name:              config['apk_name']              || undefined,
      debug:                 config['debug'] === 'true' || process.env.ENABLE_PROVIDER_DEBUG === 'true',
    };
    return new MegaAppAdapter(c, cfg, deps.wallet, deps.eventLogger, deps.providerRepo);
  },
  ['secret_code', 'sn', 'agent_login_id'],
  ['api_base_url', 'currency'],
  '1.0.0',
  'MegaApp',
);
