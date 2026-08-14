export interface Pussy888Credentials {
  /** Agent/partner code, e.g. PSYA333 */
  agent: string;
  /** API authentication code — sent in all requests as ?authcode= */
  authcode: string;
  /** Secret key — only used locally for MD5 signature, never transmitted */
  secret_key: string;
}

export interface Pussy888Config {
  /** Primary API base URL, e.g. http://api.pussy888.com */
  api_base_url:  string;
  /** Fallback API base URL, e.g. http://api2.pussy888.com */
  api_base_url2: string;
  /** Currency code, e.g. MYR */
  currency:      string;
  /** HTTP request timeout in milliseconds (default 15000) */
  timeout_ms:    number;
  /** Android app download URL (shown in launch session_token) */
  download_url_android?: string;
  /** iOS app download URL */
  download_url_ios?: string;
  /** Enable verbose API trace logging */
  debug: boolean;
}

export interface ProviderAccountRow {
  id:                number;
  provider_code:     string;
  user_id:           number;
  provider_login_id: string;
  provider_password: string;
  provider_user_id:  number | null;
  extra:             Record<string, unknown>;
  created_at:        string;
  updated_at:        string;
}
