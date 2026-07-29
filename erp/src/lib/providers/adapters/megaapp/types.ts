// erp/src/lib/providers/adapters/megaapp/types.ts

/**
 * Secrets stored in brand_provider_credentials (encrypted at rest).
 * Fill these in ERP → Provider Registry → MEGAAPP → Credentials.
 */
export interface MegaAppCredentials {
  secret_code:    string;  // API 密钥 (secretCode)，e.g. "FLpK/PCAWbzoAv2ofbNMaR5nIIk="
  sn:             string;  // 厅代码，4 chars，e.g. "ld00"
  agent_login_id: string;  // 代理账号，e.g. "Mega1-7238"
}

/**
 * Non-secret runtime settings stored in brand_provider_config.
 * Fill these in ERP → Provider Registry → MEGAAPP → Configuration.
 */
export interface MegaAppConfig {
  api_base_url:          string;   // JSON-RPC endpoint
  currency:              string;   // Default currency
  timeout_ms:            number;   // Request timeout, default 15000
  password_length:       number;   // Generated password length, default 10
  download_url_android?: string;   // APK download link (Android)
  download_url_ios?:     string;   // App Store link (iOS)
  apk_version?:          string;   // Display version e.g. "8.8.8"
  apk_name?:             string;   // Display name e.g. "MEGA888"
  debug:                 boolean;
}

/**
 * Row shape for provider_accounts table.
 */
export interface ProviderAccountRow {
  id:                 number;
  provider_code:      string;
  user_id:            number;
  provider_login_id:  string;
  provider_password:  string;
  provider_user_id:   number | null;
  extra:              Record<string, unknown>;
  created_at:         string;
  updated_at:         string;
}
