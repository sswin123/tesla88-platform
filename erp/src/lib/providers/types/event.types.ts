/**
 * Event log types.
 * Maps to the provider_callback_logs table (migration 054).
 */

export type EventLogStatus = 'SUCCESS' | 'FAILED' | 'DUPLICATE' | 'INVALID';

/** Input for writing an event log entry. */
export interface EventLogInput {
  provider: string;
  action: string;
  request_method?: string;
  headers?: Record<string, string | string[] | undefined>;
  raw_body?: string | null;
  json_body?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
  response?: Record<string, unknown> | null;
  status?: number | null;
  processing_time?: number | null;
  error_message?: string | null;
  verify_result?: boolean | null;
}

/** A read event log record. */
export interface EventLogRecord {
  id: number;
  provider: string;
  action: string | null;
  request_method: string;
  headers: Record<string, unknown> | null;
  raw_body: string | null;
  json_body: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  response: Record<string, unknown> | null;
  status: number | null;
  processing_time: number | null;
  error_message: string | null;
  verify_result: boolean | null;
  created_at: string;
}
