// Identifies the provider from the incoming request.
// Priority: ?provider= query param → X-Provider header → body field → 'UNKNOWN'
export function resolveProvider(
  query:   Record<string, string>,
  headers: Record<string, string>,
  body:    unknown
): string {
  if (query['provider']) return query['provider'].toUpperCase();
  if (headers['x-provider']) return headers['x-provider'].toUpperCase();

  if (body && typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    const fromBody =
      (typeof b['provider'] === 'string' ? b['provider'] : '') ||
      (typeof b['operator'] === 'string' ? b['operator'] : '') ||
      (typeof b['operatorId'] === 'string' ? b['operatorId'] : '');
    if (fromBody) return fromBody.toUpperCase();
  }

  return 'UNKNOWN';
}
