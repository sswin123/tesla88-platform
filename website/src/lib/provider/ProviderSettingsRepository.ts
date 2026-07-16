import pool from '@/lib/db';

export interface ProviderConfig {
  id:               number;
  provider:         string;
  displayName:      string;
  enabled:          boolean;
  agentId:          string | null;
  secretKey:        string | null;
  callbackSecret:   string | null;
  signatureType:    string;
  signatureVersion: string;
  walletType:       string;
  currency:         string;
  apiUrl:           string | null;
  whitelistIps:     string[];
  responseFormat:   string;
}

// 30-second in-process cache avoids a DB hit on every callback
const cache = new Map<string, { config: ProviderConfig; expiresAt: number }>();
const TTL = 30_000;

export function invalidateCache(provider: string): void {
  cache.delete(provider.toUpperCase());
}

export async function getProviderConfig(provider: string): Promise<ProviderConfig | null> {
  const key = provider.toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.config;

  try {
    const r = await pool.query<{
      id: number; provider: string; display_name: string; enabled: boolean;
      agent_id: string | null; secret_key: string | null; callback_secret: string | null;
      signature_type: string; signature_version: string; wallet_type: string;
      currency: string; api_url: string | null; whitelist_ips: string | null;
      response_format: string;
    }>(
      `SELECT id, provider, display_name, enabled, agent_id, secret_key, callback_secret,
              signature_type, signature_version, wallet_type, currency, api_url,
              whitelist_ips, response_format
       FROM provider_settings WHERE provider = $1 LIMIT 1`,
      [key]
    );
    if (!r.rows[0]) return null;
    const row = r.rows[0];
    const config: ProviderConfig = {
      id:               row.id,
      provider:         row.provider,
      displayName:      row.display_name || row.provider,
      enabled:          row.enabled,
      agentId:          row.agent_id,
      secretKey:        row.secret_key,
      callbackSecret:   row.callback_secret,
      signatureType:    row.signature_type || 'MD5',
      signatureVersion: row.signature_version || 'v1',
      walletType:       row.wallet_type || 'SEAMLESS',
      currency:         row.currency || 'MYR',
      apiUrl:           row.api_url,
      whitelistIps:     row.whitelist_ips
        ? row.whitelist_ips.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      responseFormat:   row.response_format || 'JSON_SUCCESS',
    };
    cache.set(key, { config, expiresAt: Date.now() + TTL });
    return config;
  } catch {
    return null;
  }
}
