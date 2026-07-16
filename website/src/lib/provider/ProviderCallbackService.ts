import type { CallbackRequest, CallbackResponse } from './ProviderAdapter';
import { getAdapter } from './ProviderRegistry';
import { verifySignature } from './SignatureVerifier';
import { insertCallbackLog } from './ProviderCallbackRepository';

export interface ServiceResult {
  response:       CallbackResponse;
  providerName:   string;
  action:         string;
  verifyResult:   boolean;
  processingTime: number;
  error?:         string;
  stackTrace?:    string;
}

export async function processCallback(req: CallbackRequest): Promise<ServiceResult> {
  const startMs = Date.now();
  const providerKey = req.provider.toUpperCase();
  const adapter = getAdapter(providerKey);

  // Use a generic fallback when no matching adapter exists
  const providerName = adapter?.name ?? (providerKey || 'UNKNOWN');
  const action = adapter ? adapter.extractAction(req) : 'unknown';

  let verifyResult = false;
  let response: CallbackResponse = { success: true };
  let error: string | undefined;
  let stackTrace: string | undefined;

  try {
    verifyResult = adapter ? await verifySignature(adapter, req) : true;
    if (adapter) {
      response = await adapter.handle(req);
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    error      = err.message;
    stackTrace = err.stack;
    response   = { success: true }; // Always 200 even on error
    console.error(`[ProviderCallbackService] provider=${providerName} action=${action}`, e);
  }

  const processingTime = Date.now() - startMs;

  // Fire-and-forget log — never let it delay the response
  void insertCallbackLog({
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
  });

  return { response, providerName, action, verifyResult, processingTime, error, stackTrace };
}
