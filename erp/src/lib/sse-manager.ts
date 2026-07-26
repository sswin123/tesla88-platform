// erp/src/lib/sse-manager.ts
// Module-level singleton SSE manager.
// Deduplicates EventSource connections: multiple subscribers on the same URL
// share one underlying connection. The connection closes when all subscribers unsubscribe.

type MessageHandler = (event: MessageEvent) => void;

interface ManagedConnection {
  es: EventSource;
  handlers: Set<MessageHandler>;
}

// Module-level singleton — survives React re-renders and component unmounts.
const connections = new Map<string, ManagedConnection>();

/**
 * Subscribe to an SSE URL. Returns an unsubscribe function.
 * Multiple subscribers on the same URL share one EventSource connection.
 * The EventSource is closed when all subscribers have unsubscribed.
 *
 * Usage (mirrors EventSource pattern):
 *   useEffect(() => {
 *     return subscribeSSE('/api/livechat/stream', (e) => { ... });
 *   }, []);
 */
export function subscribeSSE(url: string, handler: MessageHandler): () => void {
  let conn = connections.get(url);

  if (!conn) {
    const es = new EventSource(url);
    conn = { es, handlers: new Set() };
    connections.set(url, conn);

    es.onmessage = (e: MessageEvent) => {
      const c = connections.get(url);
      if (!c) return;
      c.handlers.forEach((h) => {
        try { h(e); } catch { /* isolate per-handler errors */ }
      });
    };

    es.onerror = () => {
      // EventSource auto-reconnects on transient errors per browser spec (RFC 7934).
      // Only clean up the Map entry when the connection is permanently closed
      // (readyState CLOSED means the server rejected or the URL is invalid).
      if (es.readyState === EventSource.CLOSED) {
        connections.delete(url);
      }
    };
  }

  conn.handlers.add(handler);

  return () => {
    const c = connections.get(url);
    if (!c) return;
    c.handlers.delete(handler);
    if (c.handlers.size === 0) {
      c.es.close();
      connections.delete(url);
    }
  };
}

/** For testing only — reset all connections. */
export function _resetSSEManager(): void {
  connections.forEach((c) => c.es.close());
  connections.clear();
}

/** Returns the number of active SSE connections. Useful for debugging. */
export function getActiveSSECount(): number {
  return connections.size;
}
