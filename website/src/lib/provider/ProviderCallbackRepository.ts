import pool from '@/lib/db';

export interface CallbackLogEntry {
  provider:       string;
  action?:        string;
  requestMethod:  string;
  headers:        Record<string, string>;
  query:          Record<string, string>;
  rawBody:        string;
  jsonBody:       unknown;
  ip:             string;
  userAgent:      string;
  signature?:     string;
  verifyResult?:  boolean;
  response?:      unknown;
  status?:        number;
  processingTime?: number;
  errorMessage?:  string;
  stackTrace?:    string;
}

export async function insertCallbackLog(entry: CallbackLogEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO provider_callback_logs
         (provider, action, request_method, headers, query, raw_body, json_body,
          ip, user_agent, signature, verify_result, response, status,
          processing_time, error_message, stack_trace)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        entry.provider,
        entry.action ?? null,
        entry.requestMethod,
        JSON.stringify(entry.headers),
        JSON.stringify(entry.query),
        entry.rawBody,
        entry.jsonBody ? JSON.stringify(entry.jsonBody) : null,
        entry.ip,
        entry.userAgent,
        entry.signature ?? null,
        entry.verifyResult ?? null,
        entry.response ? JSON.stringify(entry.response) : null,
        entry.status ?? null,
        entry.processingTime ?? null,
        entry.errorMessage ?? null,
        entry.stackTrace ?? null,
      ]
    );
  } catch (e) {
    // Never let logging failures propagate to the caller — always return 200 to providers
    console.error('[ProviderCallbackRepository] log insert failed:', e);
  }
}
