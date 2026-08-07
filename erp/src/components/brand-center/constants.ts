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
