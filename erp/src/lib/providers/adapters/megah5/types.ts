// erp/src/lib/providers/adapters/megah5/types.ts

/** Credentials loaded from brand_provider_credentials. */
export interface MegaH5Credentials {
  /** Outbound API access token (sent by us in API calls). key = 'api_token' */
  api_token: string;
  /** Inbound operator token (sent by MEGAH5 in callback headers). key = 'operator_token' */
  operator_token: string;
  /** SecretKey used in H5 Login MD5 signature. key = 'secret_key' */
  secret_key: string;
  /** DES-CBC EncryptKey (8 bytes) for H5 Login QS encryption. key = 'encrypt_key' */
  encrypt_key: string;
  /** Md5EncryptKey used in H5 Login MD5 signature. key = 'md5_key' */
  md5_key: string;
  /** Field delimiter in QS string (e.g. "|" or "&"). key = 'delimiter' */
  delimiter: string;
}

/** Configuration loaded from brand_provider_config. */
export interface MegaH5Config {
  /** Operations API base URL. key = 'api_base_url' */
  api_base_url: string;
  /** H5 API domain for /api/Acc/Login and /api/Game/GameList. key = 'h5_api_domain' */
  h5_api_domain: string;
  /** H5 Lobby launch domain. key = 'h5_lobby_domain' */
  h5_lobby_domain: string;
  /** H5 Game launch domain. key = 'h5_game_domain' */
  h5_game_domain: string;
  /** PostfixID appended to player accountIDs. key = 'postfix_id' */
  postfix_id: string;
  /** Default currency. key = 'currency'. Default: 'MYR' */
  currency: string;
  /** HTTP request timeout in ms. key = 'timeout_ms'. Default: 10_000 */
  timeout_ms: number;
  /** DataFeed API base URL (optional). key = 'datafeed_url' */
  datafeed_url?: string;
  /** Enable verbose debug logging. Derived from env ENABLE_PROVIDER_DEBUG. */
  debug: boolean;
}
