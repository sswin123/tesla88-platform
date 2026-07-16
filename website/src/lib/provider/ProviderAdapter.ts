// Base interface all provider adapters must implement.
// To add a new provider: create a class that implements this, register it in ProviderRegistry.

export interface CallbackRequest {
  provider: string;
  method:   'GET' | 'POST';
  headers:  Record<string, string>;
  query:    Record<string, string>;
  rawBody:  string;
  jsonBody: unknown;
  ip:       string;
  userAgent: string;
}

export interface CallbackResponse {
  success:    boolean;
  data?:      unknown;
  error?:     string;
}

export interface ProviderAdapter {
  readonly name: string;

  // Extract provider-specific action name from the request (e.g. 'balance', 'transfer', 'bet')
  extractAction(req: CallbackRequest): string;

  // Verify the request signature. Returns true for now; implement per-provider later.
  verifySignature(req: CallbackRequest): Promise<boolean>;

  // Process the callback. Currently a no-op; implement per-provider when integrating.
  handle(req: CallbackRequest): Promise<CallbackResponse>;
}

// Default no-op implementation. Concrete adapters can extend and override selectively.
export abstract class BaseProviderAdapter implements ProviderAdapter {
  abstract readonly name: string;

  extractAction(req: CallbackRequest): string {
    const body = req.jsonBody as Record<string, unknown> | null;
    return (
      (req.query['action'] as string) ||
      (body && typeof body['action'] === 'string' ? body['action'] : '') ||
      (body && typeof body['method'] === 'string' ? body['method'] : '') ||
      'unknown'
    );
  }

  async verifySignature(_req: CallbackRequest): Promise<boolean> {
    // TODO: implement MD5/SHA256/HMAC/RSA per provider spec
    return true;
  }

  async handle(_req: CallbackRequest): Promise<CallbackResponse> {
    // TODO: implement wallet/balance/transfer/bet logic per provider spec
    return { success: true };
  }
}
