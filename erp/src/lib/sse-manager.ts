// erp/src/lib/sse-manager.ts
//
// Unified SSE Manager — single source of truth for all EventSource connections.
//
// Features:
//   • Deduplication  — multiple subscribers share one underlying EventSource
//   • Auto-reconnect — exponential backoff on any error (502, 503, ECONNREFUSED, etc.)
//   • Status events  — subscribers can watch connecting / connected / reconnecting / closed
//   • Heartbeat      — server can send `event: ping` to confirm the link is alive
//   • Graceful close — connection is closed only when all subscribers unsubscribe
//
// Reconnect backoff schedule (ms): 1 000 → 2 000 → 5 000 → 10 000 (capped)
// Resets to 1 000 on first successful message.

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';
export type MessageHandler   = (event: MessageEvent) => void;
export type StatusHandler    = (status: ConnectionStatus) => void;

// ── Backoff schedule ──────────────────────────────────────────────────────────
const BACKOFF_SCHEDULE_MS = [1_000, 2_000, 5_000, 10_000] as const;
function backoffMs(step: number): number {
  return BACKOFF_SCHEDULE_MS[Math.min(step, BACKOFF_SCHEDULE_MS.length - 1)];
}

// ── Internal connection record ────────────────────────────────────────────────
interface ManagedConn {
  url:            string;
  es:             EventSource | null;
  handlers:       Set<MessageHandler>;
  statusHandlers: Set<StatusHandler>;
  backoffStep:    number;
  retryTimer:     ReturnType<typeof setTimeout> | null;
  destroyed:      boolean;
  status:         ConnectionStatus;
}

// Module-level singleton — survives React re-renders.
const connections = new Map<string, ManagedConn>();

// ── Internal helpers ──────────────────────────────────────────────────────────

function setStatus(conn: ManagedConn, status: ConnectionStatus): void {
  conn.status = status;
  conn.statusHandlers.forEach(h => { try { h(status); } catch { /* isolate */ } });
}

function openEventSource(conn: ManagedConn): void {
  if (conn.destroyed) return;

  const es = new EventSource(conn.url);
  conn.es = es;

  // Standard messages
  es.onmessage = (e: MessageEvent) => {
    if (conn.destroyed) return;
    // Successful message → reset backoff, mark connected
    if (conn.status !== 'connected') {
      conn.backoffStep = 0;
      setStatus(conn, 'connected');
    }
    conn.handlers.forEach(h => { try { h(e); } catch { /* isolate */ } });
  };

  // Server heartbeat (event: ping) — keeps proxy / firewall from killing idle streams
  es.addEventListener('ping', () => {
    if (conn.status !== 'connected') {
      conn.backoffStep = 0;
      setStatus(conn, 'connected');
    }
  });

  // Any error: connection refused, 502, 503, network loss, server restart…
  // EventSource spec: on error, readyState transitions to CLOSED.
  // The browser will NOT auto-reconnect when readyState is CLOSED — we must do it.
  es.onerror = () => {
    es.close();
    conn.es = null;

    if (conn.destroyed || conn.handlers.size === 0) {
      setStatus(conn, 'closed');
      return;
    }

    scheduleReconnect(conn);
  };
}

function scheduleReconnect(conn: ManagedConn): void {
  if (conn.retryTimer !== null) return; // already scheduled

  const delay = backoffMs(conn.backoffStep);
  conn.backoffStep += 1;
  setStatus(conn, 'reconnecting');

  conn.retryTimer = setTimeout(() => {
    conn.retryTimer = null;
    if (conn.destroyed || conn.handlers.size === 0) {
      setStatus(conn, 'closed');
      return;
    }
    setStatus(conn, 'connecting');
    openEventSource(conn);
  }, delay);
}

function getOrCreate(url: string): ManagedConn {
  const existing = connections.get(url);
  if (existing && !existing.destroyed) return existing;

  const conn: ManagedConn = {
    url,
    es:             null,
    handlers:       new Set(),
    statusHandlers: new Set(),
    backoffStep:    0,
    retryTimer:     null,
    destroyed:      false,
    status:         'connecting',
  };
  connections.set(url, conn);
  openEventSource(conn);
  return conn;
}

function maybeClose(url: string): void {
  const conn = connections.get(url);
  if (!conn) return;
  if (conn.handlers.size > 0 || conn.statusHandlers.size > 0) return;

  // No subscribers left — tear down
  conn.destroyed = true;
  if (conn.retryTimer !== null) {
    clearTimeout(conn.retryTimer);
    conn.retryTimer = null;
  }
  if (conn.es) {
    conn.es.close();
    conn.es = null;
  }
  setStatus(conn, 'closed');
  connections.delete(url);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Subscribe to SSE messages on `url`.
 * Returns an unsubscribe function — call it on component unmount.
 *
 * Multiple subscribers on the same URL share one EventSource.
 * The connection auto-reconnects with backoff on any error.
 *
 * @example
 *   useEffect(() => subscribeSSE('/api/livechat/stream', (e) => { ... }), []);
 */
export function subscribeSSE(url: string, handler: MessageHandler): () => void {
  const conn = getOrCreate(url);
  conn.handlers.add(handler);

  return () => {
    const c = connections.get(url);
    if (!c) return;
    c.handlers.delete(handler);
    maybeClose(url);
  };
}

/**
 * Watch the connection status for a URL.
 * `handler` is called immediately with the current status, then on every change.
 * Returns an unsubscribe function.
 *
 * @example
 *   useEffect(() => watchSSEStatus('/api/livechat/stream', setStatus), []);
 */
export function watchSSEStatus(url: string, handler: StatusHandler): () => void {
  const conn = getOrCreate(url);
  conn.statusHandlers.add(handler);
  // Emit current status immediately so callers don't need a separate initial read
  try { handler(conn.status); } catch { /* isolate */ }

  return () => {
    const c = connections.get(url);
    if (!c) return;
    c.statusHandlers.delete(handler);
    maybeClose(url);
  };
}

/**
 * Force-close and remove a URL immediately (e.g. on logout).
 * All subscribers will stop receiving events; their unsubscribe functions become no-ops.
 */
export function destroySSE(url: string): void {
  const conn = connections.get(url);
  if (!conn) return;
  conn.handlers.clear();
  conn.statusHandlers.clear();
  maybeClose(url);
}

/** Force-close all SSE connections (e.g. on logout). */
export function destroyAllSSE(): void {
  for (const url of [...connections.keys()]) destroySSE(url);
}

/** Number of active connections — useful for debugging. */
export function getActiveSSECount(): number {
  return connections.size;
}

/** Current status of a URL, or 'closed' if not connected. */
export function getSSEStatus(url: string): ConnectionStatus {
  return connections.get(url)?.status ?? 'closed';
}

/** For testing only — reset all connections. */
export function _resetSSEManager(): void {
  destroyAllSSE();
}
