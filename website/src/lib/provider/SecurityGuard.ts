import pool from '@/lib/db';
import type { CallbackRequest } from './ProviderAdapter';
import type { ProviderConfig } from './ProviderSettingsRepository';

export interface SecurityResult {
  allowed:  boolean;
  reason?:  string;
}

const MAX_BODY_BYTES        = 65_536; // 64 KB
const TIMESTAMP_DRIFT_SEC   = 300;    // ±5 minutes
const RATE_LIMIT_PER_MIN    = 300;    // per IP per minute (DB-backed)

// Timestamp field names checked across providers
const TIMESTAMP_FIELDS = ['timestamp', 'ts', 'time', 'requestTime', 'request_time', 'signTime', 'nonce_time'];

export async function runSecurityChecks(
  req:    CallbackRequest,
  config: ProviderConfig | null
): Promise<SecurityResult> {

  // 1. Request size (raw body length, checked before parsing)
  if (req.rawBody.length > MAX_BODY_BYTES) {
    return { allowed: false, reason: `request body exceeds ${MAX_BODY_BYTES} bytes` };
  }

  // 2. IP whitelist (only enforced when provider has explicit whitelist entries)
  if (config?.whitelistIps.length) {
    if (!config.whitelistIps.includes(req.ip)) {
      return { allowed: false, reason: `IP ${req.ip} not in provider whitelist` };
    }
  }

  // 3. Timestamp drift (skip if no timestamp field present)
  const bodyObj = req.jsonBody && typeof req.jsonBody === 'object'
    ? req.jsonBody as Record<string, unknown>
    : null;
  if (bodyObj) {
    for (const field of TIMESTAMP_FIELDS) {
      const raw = bodyObj[field];
      if (raw === undefined || raw === null) continue;
      const ts = Number(raw);
      if (isNaN(ts)) break;
      // Accept both Unix seconds and milliseconds
      const unixSec = ts > 1e12 ? ts / 1000 : ts;
      const driftSec = Math.abs(Date.now() / 1000 - unixSec);
      if (driftSec > TIMESTAMP_DRIFT_SEC) {
        return { allowed: false, reason: `timestamp drift ${Math.round(driftSec)}s exceeds ${TIMESTAMP_DRIFT_SEC}s` };
      }
      break;
    }
  }

  // 4. Rate limit — count requests from this IP in the last 60 seconds
  //    Uses provider_callback_logs for counting without Redis dependency.
  try {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM provider_callback_logs
       WHERE ip = $1 AND created_at >= NOW() - INTERVAL '60 seconds'`,
      [req.ip]
    );
    const count = parseInt(r.rows[0]?.count ?? '0', 10);
    if (count >= RATE_LIMIT_PER_MIN) {
      return { allowed: false, reason: `rate limit exceeded (${count} req/min from ${req.ip})` };
    }
  } catch {
    // If rate limit check fails, allow through — don't block legitimate callbacks
  }

  return { allowed: true };
}
