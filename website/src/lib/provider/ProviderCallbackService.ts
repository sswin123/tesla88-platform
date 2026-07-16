import type { CallbackRequest, CallbackResponse } from './ProviderAdapter';
import { getAdapter } from './ProviderRegistry';
import { verifySignature } from './SignatureVerifier';
import { insertCallbackLog } from './ProviderCallbackRepository';
import { getProviderConfig } from './ProviderSettingsRepository';
import { runSecurityChecks } from './SecurityGuard';
import {
  extractIdempotencyKey,
  checkIdempotency,
  updateIdempotencyLogId,
} from './IdempotencyGuard';
import { formatSuccess, type FormattedResponse } from './ResponseFormatter';

export interface ServiceResult {
  formatted:      FormattedResponse;
  providerName:   string;
  action:         string;
  verifyResult:   boolean;
  isDuplicate:    boolean;
  processingTime: number;
  blocked?:       string;   // set if security check failed (still returns 200)
  error?:         string;
  stackTrace?:    string;
}

export async function processCallback(req: CallbackRequest): Promise<ServiceResult> {
  const startMs      = Date.now();
  const providerKey  = req.provider.toUpperCase();

  // Load provider config (secrets, whitelist, response format) from DB
  const config       = await getProviderConfig(providerKey);
  const adapter      = getAdapter(providerKey);
  const providerName = adapter?.name ?? config?.displayName ?? (providerKey || 'UNKNOWN');
  const responseFormat = config?.responseFormat ?? 'JSON_SUCCESS';

  let action       = adapter ? adapter.extractAction(req) : 'unknown';
  let verifyResult = false;
  let response: CallbackResponse = { success: true };
  let isDuplicate  = false;
  let blockedReason: string | undefined;
  let error: string | undefined;
  let stackTrace: string | undefined;
  let idempotencyKey: string | null = null;
  let retryNeeded = false;

  try {
    // ── 1. Security checks ────────────────────────────────────────────────────
    const security = await runSecurityChecks(req, config);
    if (!security.allowed) {
      blockedReason = security.reason;
      // Log the blocked request but still return success to the provider
      const processingTime = Date.now() - startMs;
      void insertCallbackLog({
        provider:      providerName,
        action:        'BLOCKED',
        requestMethod: req.method,
        headers:       req.headers,
        query:         req.query,
        rawBody:       req.rawBody,
        jsonBody:      req.jsonBody,
        ip:            req.ip,
        userAgent:     req.userAgent,
        verifyResult:  false,
        response:      { blocked: blockedReason },
        status:        200,
        processingTime,
        errorMessage:  `Security: ${blockedReason}`,
      });
      return {
        formatted:      formatSuccess(responseFormat),
        providerName,
        action:         'BLOCKED',
        verifyResult:   false,
        isDuplicate:    false,
        processingTime,
        blocked:        blockedReason,
      };
    }

    // ── 2. Idempotency check ──────────────────────────────────────────────────
    idempotencyKey = extractIdempotencyKey(req);
    if (idempotencyKey) {
      const idem = await checkIdempotency(providerName, idempotencyKey);
      if (idem.isDuplicate) {
        isDuplicate = true;
        const processingTime = Date.now() - startMs;
        void insertCallbackLog({
          provider:      providerName,
          action:        `${action}_DUPLICATE`,
          requestMethod: req.method,
          headers:       req.headers,
          query:         req.query,
          rawBody:       req.rawBody,
          jsonBody:      req.jsonBody,
          ip:            req.ip,
          userAgent:     req.userAgent,
          verifyResult:  true,
          response:      { duplicate: true, originalLogId: idem.existingLogId },
          status:        200,
          processingTime,
          idempotent:    true,
        });
        return {
          formatted:      formatSuccess(responseFormat),
          providerName,
          action,
          verifyResult:   true,
          isDuplicate:    true,
          processingTime,
        };
      }
    }

    // ── 3. Signature verification ─────────────────────────────────────────────
    verifyResult = adapter ? await verifySignature(adapter, req) : true;

    // ── 4. Business logic (adapter handle) ───────────────────────────────────
    if (adapter) {
      response = await adapter.handle(req);
    }
    action = adapter ? adapter.extractAction(req) : action;

  } catch (e) {
    const err  = e instanceof Error ? e : new Error(String(e));
    error      = err.message;
    stackTrace = err.stack;
    retryNeeded = true;
    response   = { success: true };
    console.error(`[ProviderCallbackService] provider=${providerName} action=${action}`, e);
  }

  const processingTime = Date.now() - startMs;
  const formatted = formatSuccess(responseFormat);

  // ── 5. Log + update idempotency record ────────────────────────────────────
  void (async () => {
    await insertCallbackLog({
      provider:      providerName,
      action,
      requestMethod: req.method,
      headers:       req.headers,
      query:         req.query,
      rawBody:       req.rawBody,
      jsonBody:      req.jsonBody,
      ip:            req.ip,
      userAgent:     req.userAgent,
      verifyResult,
      response,
      status:        200,
      processingTime,
      errorMessage:  error,
      stackTrace,
      retryNeeded,
    });
    if (idempotencyKey) {
      // callback_log_id backfill happens asynchronously — acceptable lag
      // We don't have the log's ID here since insertCallbackLog is void;
      // this is acceptable for now (idempotency still works via the unique key)
    }
  })();

  return {
    formatted,
    providerName,
    action,
    verifyResult,
    isDuplicate,
    processingTime,
    error,
    stackTrace,
  };
}
