// erp/src/lib/staff-status.ts
export type DisplayStatus = 'ONLINE' | 'IDLE' | 'DISCONNECTED' | 'OFFLINE' | 'BREAK';

const ONLINE_THRESHOLD_MS = 3 * 60_000;
export const IDLE_THRESHOLD_MS = 10 * 60_000;

export interface ResolveDisplayStatusInput {
  storedStatus: string;
  lastActivity: string | Date | null;
  now?: Date;
}

/**
 * Explicit stored states (OFFLINE / BREAK) always win. Otherwise the staff
 * member is "in an active session" and their visible status is computed
 * from how stale last_activity is — no background job updates this.
 */
export function resolveDisplayStatus(input: ResolveDisplayStatusInput): DisplayStatus {
  const { storedStatus, lastActivity } = input;
  const now = input.now ?? new Date();

  if (storedStatus === 'OFFLINE') return 'OFFLINE';
  if (storedStatus === 'BREAK') return 'BREAK';
  if (!lastActivity) return 'OFFLINE';

  const lastActivityDate = typeof lastActivity === 'string' ? new Date(lastActivity) : lastActivity;
  const diffMs = now.getTime() - lastActivityDate.getTime();

  if (diffMs <= ONLINE_THRESHOLD_MS) return 'ONLINE';
  if (diffMs <= IDLE_THRESHOLD_MS) return 'IDLE';
  return 'DISCONNECTED';
}
