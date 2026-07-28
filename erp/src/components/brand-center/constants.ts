export const PROVIDER_STATUS = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  MAINTENANCE: 'MAINTENANCE',
  TESTING: 'TESTING',
} as const;
export type ProviderStatus = typeof PROVIDER_STATUS[keyof typeof PROVIDER_STATUS];

export const HEALTH_STATUS = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  DOWN: 'DOWN',
  UNKNOWN: 'UNKNOWN',
} as const;
export type HealthStatus = typeof HEALTH_STATUS[keyof typeof HEALTH_STATUS];

export const WALLET_TYPES = ['SEAMLESS', 'TRANSFER'] as const;
export const ENVIRONMENTS = ['PRODUCTION', 'SANDBOX'] as const;

// Provider credential templates — keys expected for each provider
// Used to calculate completion percentage
export const CREDENTIAL_TEMPLATES: Record<string, string[]> = {
  KISS918: ['username', 'password', 'api_url'],
  MEGAH5: ['api_key', 'secret', 'api_url'],
  PGSOFT: ['operator_token', 'secret_key'],
  JILI: ['api_key', 'agent_id'],
  CQ9: ['agent_token', 'agent_id', 'api_url'],
};

export const CONFIG_TEMPLATES: Record<string, string[]> = {
  KISS918: ['lobby_url', 'currency'],
  MEGAH5: ['lobby_url', 'currency', 'language'],
  PGSOFT: ['lobby_url', 'currency', 'language'],
  JILI: ['lobby_url', 'currency'],
  CQ9: ['lobby_url', 'currency', 'language'],
};
