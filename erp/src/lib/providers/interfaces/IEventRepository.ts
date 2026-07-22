import type { EventLogInput, EventLogRecord } from '../types/event.types';

/**
 * Data access contract for provider_callback_logs (migration 054).
 * The existing table is reused — no new event table is created.
 */
export interface IEventRepository {
  create(input: EventLogInput): Promise<number>;

  findById(id: number): Promise<EventLogRecord | null>;

  findByProvider(provider: string, limit?: number): Promise<EventLogRecord[]>;

  markRetryNeeded(id: number): Promise<void>;
}
