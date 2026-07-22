/**
 * Provider runtime configuration types.
 *
 * All configuration is loaded from the database at startup — nothing is
 * hard-coded in source files.  Config keys are provider-specific strings
 * agreed upon by each adapter implementation.
 */

/** Well-known configuration keys shared across most providers. */
export const CONFIG_KEY = {
  /** Base URL of the provider's API (production). */
  API_BASE_URL: 'api_base_url',

  /** Base URL for sandbox / staging environment. */
  API_BASE_URL_SANDBOX: 'api_base_url_sandbox',

  /** Lobby domain / URL (for providers with H5 lobby). */
  LOBBY_URL: 'lobby_url',

  /** H5 game domain (for direct game launch). */
  GAME_DOMAIN: 'game_domain',

  /** Default currency code for this provider integration (e.g. "MYR"). */
  CURRENCY: 'currency',

  /** Default language code (provider-specific integer or string). */
  DEFAULT_LANGUAGE: 'default_language',

  /** HTTP request timeout in milliseconds. */
  TIMEOUT_MS: 'timeout_ms',

  /** Number of automatic retries on transient HTTP errors. */
  RETRY_COUNT: 'retry_count',

  /** Base delay (ms) between retries — actual delay uses exponential backoff. */
  RETRY_DELAY_MS: 'retry_delay_ms',

  /** Whether the lobby mode is enabled (true/false string). */
  LOBBY_ENABLED: 'lobby_enabled',

  /** Whether automatic game sync is enabled (true/false string). */
  SYNC_ENABLED: 'sync_enabled',

  /** Comma-separated list of IP addresses allowed to send callbacks. */
  WHITELIST_IPS: 'whitelist_ips',

  /** Whether the provider is in maintenance window (true/false string). */
  MAINTENANCE: 'maintenance',

  /** Currency amount multiplier (e.g. "1000" for IDR ÷ 1000 display). */
  CURRENCY_MULTIPLIER: 'currency_multiplier',
} as const;

export type ConfigKey = (typeof CONFIG_KEY)[keyof typeof CONFIG_KEY];

/** Well-known credential keys shared across most providers. */
export const CREDENTIAL_KEY = {
  /** Primary API access token sent in request headers. */
  API_TOKEN: 'api_token',

  /** Secret key used for signature generation. */
  SECRET_KEY: 'secret_key',

  /** MD5 signing key (918KISS / similar providers). */
  MD5_KEY: 'md5_key',

  /** DES encryption key for login token generation. */
  ENCRYPT_KEY: 'encrypt_key',

  /** Delimiter character used in signature construction. */
  DELIMITER: 'delimiter',

  /** HMAC secret (Evolution and similar providers). */
  HMAC_SECRET: 'hmac_secret',

  /** RSA private key (PEM string) for providers requiring asymmetric signing. */
  RSA_PRIVATE_KEY: 'rsa_private_key',

  /** OPERATOR API access token sent to us by the provider in callback headers. */
  OPERATOR_TOKEN: 'operator_token',

  /** PostfixID appended to account identifiers sent to this provider. */
  POSTFIX_ID: 'postfix_id',
} as const;

export type CredentialKey = (typeof CREDENTIAL_KEY)[keyof typeof CREDENTIAL_KEY];
