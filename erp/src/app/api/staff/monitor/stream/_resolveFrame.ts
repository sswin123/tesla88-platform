import { getStaffRole } from '@/lib/repositories/staff_monitor_repo';

/**
 * SUPER_ADMIN visibility for the SSE stream (Live Monitor). The NOTIFY
 * payload (migration 083's trigger) carries staff_id but not role, and
 * extending that trigger is out of scope here, so the target's role is
 * looked up per event — a single indexed primary-key read, negligible at
 * Live Monitor's update frequency. A SUPER_ADMIN viewer never needs this
 * lookup at all (short-circuited), matching getMonitorSnapshot()'s same
 * "$viewer = 'SUPER_ADMIN' bypasses the check entirely" shape.
 *
 * Exported standalone so the filtering decision itself is directly
 * unit-testable without needing to drive the raw ReadableStream/Client
 * plumbing below.
 */
export async function resolveMonitorStreamFrame(rawPayload: string, viewerRole: string): Promise<string | null> {
  if (viewerRole === 'SUPER_ADMIN') return `data: ${rawPayload}\n\n`;

  let staffId: number | undefined;
  try {
    staffId = (JSON.parse(rawPayload) as { staff_id?: number }).staff_id;
  } catch {
    // Malformed payload — not attacker-reachable (NOTIFY is only ever
    // produced by our own trigger), so forward it rather than silently
    // dropping what would otherwise be a legitimate event.
    return `data: ${rawPayload}\n\n`;
  }
  if (typeof staffId !== 'number') return `data: ${rawPayload}\n\n`;

  const targetRole = await getStaffRole(staffId);
  if (targetRole === 'SUPER_ADMIN') return null;
  return `data: ${rawPayload}\n\n`;
}
