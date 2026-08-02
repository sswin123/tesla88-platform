/**
 * RuntimeEventStore — in-memory ring buffer of provider runtime events.
 *
 * Stores the last MAX_EVENTS events per brand-provider pair.
 * Provides an audit trail for support: "show me what happened to MEGAH5
 * in the last hour without opening the database".
 *
 * Events reset on process restart. For permanent audit, use the DB-backed
 * event log (future: brand_provider_runtime_events table).
 */

const MAX_EVENTS = 100; // max events per provider pair

export type RuntimeEventType =
  | 'ADAPTER_BUILD'      // adapter created (success or fail)
  | 'SNAPSHOT_BUILD'     // snapshot rebuilt
  | 'CONNECTION_TEST'    // explicit Connection Test
  | 'BACKGROUND_HEALTH'  // scheduled health check
  | 'RELOAD'             // Reload Adapter
  | 'CONFIG_CHANGE'      // config key saved
  | 'CREDENTIAL_CHANGE'  // credential key saved
  | 'STATUS_CHANGE'      // admin changed status (ACTIVE/DISABLED etc.)
  | 'HEALTH_CHANGE';     // health_status changed in DB

export type RuntimeEventStatus = 'SUCCESS' | 'FAILED' | 'STARTED';

export interface RuntimeEvent {
  id:          string;
  event_type:  RuntimeEventType;
  status:      RuntimeEventStatus;
  duration_ms: number | null;
  /** Short human-readable summary. */
  message:     string;
  /** Optional structured detail (e.g. health status, error text). */
  detail:      string | null;
  occurred_at: string;
}

let seq = 0;
function nextId(): string {
  return `evt-${Date.now()}-${++seq}`;
}

export class RuntimeEventStore {
  private static readonly buffers = new Map<string, RuntimeEvent[]>();

  private static key(brandCode: string, providerCode: string): string {
    return `${brandCode.toUpperCase()}:${providerCode.toUpperCase()}`;
  }

  private static buf(brandCode: string, providerCode: string): RuntimeEvent[] {
    const k = this.key(brandCode, providerCode);
    let b = this.buffers.get(k);
    if (!b) { b = []; this.buffers.set(k, b); }
    return b;
  }

  /**
   * Append a runtime event.
   * @param brandCode    Brand code
   * @param providerCode Provider code
   * @param type         Event type
   * @param status       SUCCESS | FAILED | STARTED
   * @param message      Short summary
   * @param detail       Optional detail
   * @param duration_ms  Duration of the operation (null if unknown)
   */
  static append(
    brandCode:    string,
    providerCode: string,
    type:         RuntimeEventType,
    status:       RuntimeEventStatus,
    message:      string,
    detail:       string | null = null,
    duration_ms:  number | null = null,
  ): RuntimeEvent {
    const event: RuntimeEvent = {
      id:          nextId(),
      event_type:  type,
      status,
      duration_ms,
      message,
      detail,
      occurred_at: new Date().toISOString(),
    };
    const buf = this.buf(brandCode, providerCode);
    buf.push(event);
    // Ring buffer: trim to last MAX_EVENTS
    if (buf.length > MAX_EVENTS) buf.splice(0, buf.length - MAX_EVENTS);
    return event;
  }

  /**
   * Return the last N events, newest first.
   * @param limit max events to return (default MAX_EVENTS)
   */
  static getEvents(brandCode: string, providerCode: string, limit = MAX_EVENTS): RuntimeEvent[] {
    const buf = this.buf(brandCode, providerCode);
    return buf.slice(-limit).reverse();
  }

  /** Clear event buffer for a provider (called on invalidate). */
  static clear(brandCode: string, providerCode: string): void {
    const k = this.key(brandCode, providerCode);
    this.buffers.delete(k);
  }
}
