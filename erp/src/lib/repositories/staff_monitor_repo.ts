import pool from '@/lib/db';

export interface OnlineStatusPatch {
  module: string;
  page: string;
  ip: string;
  browser: string;
  device: string;
  operatingSystem: string;
}

export interface OnlineStatusRow {
  staff_id: number;
  status: string;
  current_module: string | null;
  current_page: string | null;
  login_at: string | null;
  last_activity: string | null;
  current_ip: string | null;
  browser: string | null;
  device: string | null;
  operating_system: string | null;
  updated_at: string;
}

export interface StaffMonitorRow {
  id: number;
  display_name: string | null;
  erp_username: string;
  department: string | null;
  role: string;
  status: string;
  current_module: string | null;
  current_page: string | null;
  login_at: string | null;
  last_activity: string | null;
  current_ip: string | null;
  browser: string | null;
  device: string | null;
  operating_system: string | null;
}

export interface ActivityLogRow {
  id: number;
  staff_id: number;
  activity: string;
  module: string | null;
  page: string | null;
  description: string | null;
  created_at: string;
}

const MONITOR_COLS = `
  a.id, a.display_name, a.erp_username, a.department, a.role,
  COALESCE(s.status, 'OFFLINE') AS status,
  s.current_module, s.current_page, s.login_at::text, s.last_activity::text,
  s.current_ip, s.browser, s.device, s.operating_system
`;

export async function getOnlineStatus(staffId: number): Promise<OnlineStatusRow | null> {
  const r = await pool.query(
    `SELECT staff_id, status, current_module, current_page,
            login_at::text, last_activity::text, current_ip, browser, device, operating_system, updated_at::text
       FROM staff_online_status WHERE staff_id = $1`,
    [staffId]
  );
  return r.rows[0] ?? null;
}

export async function upsertOnlineStatus(staffId: number, patch: OnlineStatusPatch): Promise<void> {
  await pool.query(
    `INSERT INTO staff_online_status
       (staff_id, status, current_module, current_page, login_at, last_activity, current_ip, browser, device, operating_system, updated_at)
     VALUES ($1, 'ONLINE', $2, $3, NOW(), NOW(), $4, $5, $6, $7, NOW())
     ON CONFLICT (staff_id) DO UPDATE SET
       status = CASE WHEN staff_online_status.status = 'BREAK' THEN 'BREAK' ELSE 'ONLINE' END,
       current_module = $2,
       current_page = $3,
       login_at = CASE WHEN staff_online_status.status = 'OFFLINE' THEN NOW() ELSE COALESCE(staff_online_status.login_at, NOW()) END,
       last_activity = NOW(),
       current_ip = $4, browser = $5, device = $6, operating_system = $7,
       updated_at = NOW()`,
    [staffId, patch.module, patch.page, patch.ip, patch.browser, patch.device, patch.operatingSystem]
  );
}

export async function setOffline(staffId: number): Promise<void> {
  await pool.query(
    `INSERT INTO staff_online_status (staff_id, status, updated_at)
     VALUES ($1, 'OFFLINE', NOW())
     ON CONFLICT (staff_id) DO UPDATE SET status = 'OFFLINE', updated_at = NOW()`,
    [staffId]
  );
}

/**
 * SUPER_ADMIN visibility rule: a SUPER_ADMIN viewer sees everyone
 * (including other SUPER_ADMIN accounts and itself); any other viewer role
 * never sees SUPER_ADMIN rows, regardless of their own Live Monitor
 * permission. This is a visibility filter, not a new permission — whether
 * you may call these functions at all is decided entirely upstream by
 * requirePermissionStrict('staff.livemonitor.view'); this only decides
 * which rows you get back once you're already allowed in.
 * `viewerRole = 'SUPER_ADMIN'` short-circuits the OR, so the role
 * predicate never runs for a SUPER_ADMIN viewer — no exclusion, by
 * construction, not a separate code path.
 */
export async function getMonitorSnapshot(viewerRole: string): Promise<StaffMonitorRow[]> {
  const r = await pool.query(
    `SELECT ${MONITOR_COLS}
       FROM admins a
       LEFT JOIN staff_online_status s ON s.staff_id = a.id
      WHERE COALESCE(a.is_active, true) = true
        AND ($1 = 'SUPER_ADMIN' OR a.role <> 'SUPER_ADMIN')
      ORDER BY a.display_name NULLS LAST, a.erp_username`,
    [viewerRole]
  );
  return r.rows;
}

export async function getStaffMonitorRow(staffId: number, viewerRole: string): Promise<StaffMonitorRow | null> {
  const r = await pool.query(
    `SELECT ${MONITOR_COLS}
       FROM admins a
       LEFT JOIN staff_online_status s ON s.staff_id = a.id
      WHERE a.id = $1
        AND ($2 = 'SUPER_ADMIN' OR a.role <> 'SUPER_ADMIN')`,
    [staffId, viewerRole]
  );
  return r.rows[0] ?? null;
}

/** Used by the Live Monitor SSE stream to decide, per event, whether the
 *  target staff member is a SUPER_ADMIN — the NOTIFY payload (migration 083)
 *  does not carry role, and adding it would require touching that trigger,
 *  which is out of scope here. A single indexed primary-key lookup per event
 *  is negligible at Live Monitor's update frequency. */
export async function getStaffRole(staffId: number): Promise<string | null> {
  const r = await pool.query<{ role: string }>(`SELECT role FROM admins WHERE id = $1`, [staffId]);
  return r.rows[0]?.role ?? null;
}

export async function logActivity(
  staffId: number,
  activity: string,
  module?: string | null,
  page?: string | null,
  description?: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO staff_activity_logs (staff_id, activity, module, page, description)
     VALUES ($1, $2, $3, $4, $5)`,
    [staffId, activity, module ?? null, page ?? null, description ?? null]
  );
}

export async function getRecentActivity(staffId: number, limit = 20): Promise<ActivityLogRow[]> {
  const r = await pool.query(
    `SELECT id, staff_id, activity, module, page, description, created_at::text
       FROM staff_activity_logs
      WHERE staff_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [staffId, limit]
  );
  return r.rows;
}
