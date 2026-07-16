import type { CallbackRequest, ProviderAdapter } from './ProviderAdapter';

// Unified signature verifier — delegates to the adapter's implementation.
// Returns true until the provider-specific logic is implemented.
export async function verifySignature(
  adapter: ProviderAdapter,
  req: CallbackRequest
): Promise<boolean> {
  try {
    return await adapter.verifySignature(req);
  } catch {
    return false;
  }
}
