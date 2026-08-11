import pool from '@/lib/db';

/**
 * Templates CRUD (spec §5, migration 094 staff_schedule_templates). Task 10
 * ONLY — no Assignments (Task 11), Overrides (Task 12), or
 * getEffectiveSchedule() (Task 13) here.
 */

export interface ScheduleTemplateRow {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
  working_days: number[];
  late_grace_minutes: number;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  name: string;
  startTime: string; // 'HH:MM' or 'HH:MM:SS'
  endTime: string;
  workingDays: number[]; // ISO weekday: 1=Mon .. 7=Sun
  lateGraceMinutes: number;
  createdBy: number | null;
}

export interface UpdateTemplateInput {
  name?: string;
  startTime?: string;
  endTime?: string;
  workingDays?: number[];
  lateGraceMinutes?: number;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function validateTime(time: string, label: string): void {
  if (!TIME_RE.test(time)) {
    throw new Error(`staff_schedule_repo: invalid ${label}: ${time} (expected HH:MM or HH:MM:SS)`);
  }
}

function assertStartEndNotEqual(startTime: string, endTime: string): void {
  if (startTime === endTime) {
    // Mirrors resolveScheduledWindow()'s own contract (attendance-rules.ts) — a
    // 24-hour shift is not a defined semantic in the spec, and guessing one
    // would hide a likely data-entry mistake, not a real business case.
    throw new Error(
      `staff_schedule_repo: startTime and endTime cannot be equal (${startTime}) — ` +
      `this is an invalid schedule, not a 24-hour shift`
    );
  }
}

/**
 * Same weekday numbering resolveScheduledWindow()/migration 094 use (1=Mon..7=Sun).
 * Migration 094's CHECK constraint already enforces the 1-7 range and non-empty
 * array at the DB level; "no duplicate weekday" cannot be expressed as a
 * subquery-free CHECK (confirmed empirically while authoring 094), so it is
 * enforced here — the pre-authorized repository-layer fallback (migration
 * 094's own comment, spec §20).
 */
function validateWorkingDays(workingDays: number[]): void {
  if (!Array.isArray(workingDays) || workingDays.length === 0) {
    throw new Error(`staff_schedule_repo: working_days must be a non-empty array (got ${JSON.stringify(workingDays)})`);
  }
  for (const day of workingDays) {
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw new Error(`staff_schedule_repo: invalid working_days value ${day} — must be an integer 1-7 (ISO weekday, 1=Mon..7=Sun)`);
    }
  }
  if (new Set(workingDays).size !== workingDays.length) {
    throw new Error(`staff_schedule_repo: working_days contains duplicate weekday value(s): ${JSON.stringify(workingDays)}`);
  }
}

/** Mirrors resolveAttendanceStatus()'s own `gracePeriodMinutes >= 0` contract (attendance-rules.ts) — rejected here at write time instead of failing later during recalculation. */
function validateLateGraceMinutes(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new Error(`staff_schedule_repo: invalid late_grace_minutes ${minutes} — must be an integer >= 0`);
  }
}

const TEMPLATE_COLUMNS =
  'id, name, start_time::text, end_time::text, is_overnight, working_days, ' +
  'late_grace_minutes, is_active, created_by, created_at::text, updated_at::text';

export async function createTemplate(input: CreateTemplateInput): Promise<number> {
  validateTime(input.startTime, 'startTime');
  validateTime(input.endTime, 'endTime');
  assertStartEndNotEqual(input.startTime, input.endTime);
  validateWorkingDays(input.workingDays);
  validateLateGraceMinutes(input.lateGraceMinutes);

  // Same comparison resolveScheduledWindow() uses (attendance-rules.ts) —
  // zero-padded 'HH:MM' strings compare correctly lexicographically. This
  // is a plain sibling-field consistency write, not a reimplementation of
  // that function's timezone/UTC-instant logic.
  const isOvernight = input.endTime < input.startTime;

  const result = await pool.query<{ id: number }>(
    `INSERT INTO staff_schedule_templates
       (name, start_time, end_time, is_overnight, working_days, late_grace_minutes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [input.name, input.startTime, input.endTime, isOvernight, input.workingDays, input.lateGraceMinutes, input.createdBy]
  );
  return result.rows[0].id;
}

export async function getTemplateById(id: number): Promise<ScheduleTemplateRow | null> {
  const result = await pool.query<ScheduleTemplateRow>(
    `SELECT ${TEMPLATE_COLUMNS} FROM staff_schedule_templates WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function listTemplates(includeInactive = false): Promise<ScheduleTemplateRow[]> {
  const where = includeInactive ? '' : 'WHERE is_active = true';
  const result = await pool.query<ScheduleTemplateRow>(
    `SELECT ${TEMPLATE_COLUMNS} FROM staff_schedule_templates ${where} ORDER BY name`,
    []
  );
  return result.rows;
}

/**
 * Partial update. If either startTime or endTime is patched, the current row
 * is fetched first so is_overnight can be recomputed from the resulting pair
 * — a plain-column write (migration 094's is_overnight is not a GENERATED
 * column), not a reimplementation of resolveScheduledWindow(). Returns null
 * if the template does not exist (existing repo convention — see
 * announcement_repo.ts/brand_repo.ts/promotion_repo.ts).
 */
export async function updateTemplate(id: number, patch: UpdateTemplateInput): Promise<ScheduleTemplateRow | null> {
  if (patch.workingDays !== undefined) validateWorkingDays(patch.workingDays);
  if (patch.lateGraceMinutes !== undefined) validateLateGraceMinutes(patch.lateGraceMinutes);
  if (patch.startTime !== undefined) validateTime(patch.startTime, 'startTime');
  if (patch.endTime !== undefined) validateTime(patch.endTime, 'endTime');

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.name !== undefined) {
    fields.push(`name = $${i++}`);
    values.push(patch.name);
  }

  if (patch.startTime !== undefined || patch.endTime !== undefined) {
    const current = await getTemplateById(id);
    if (!current) return null;
    const startTime = patch.startTime ?? current.start_time;
    const endTime = patch.endTime ?? current.end_time;
    assertStartEndNotEqual(startTime, endTime);
    fields.push(`start_time = $${i++}`);
    values.push(startTime);
    fields.push(`end_time = $${i++}`);
    values.push(endTime);
    fields.push(`is_overnight = $${i++}`);
    values.push(endTime < startTime);
  }

  if (patch.workingDays !== undefined) {
    fields.push(`working_days = $${i++}`);
    values.push(patch.workingDays);
  }
  if (patch.lateGraceMinutes !== undefined) {
    fields.push(`late_grace_minutes = $${i++}`);
    values.push(patch.lateGraceMinutes);
  }

  if (fields.length === 0) return getTemplateById(id);

  fields.push('updated_at = NOW()');
  values.push(id);

  const result = await pool.query<ScheduleTemplateRow>(
    `UPDATE staff_schedule_templates SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${TEMPLATE_COLUMNS}`,
    values
  );
  return result.rows[0] ?? null;
}

/**
 * Archive, not delete (spec/schema has no deleted_at; assignments.template_id
 * is ON DELETE RESTRICT — a real DELETE would either be blocked by the FK
 * once Task 11 exists, or silently destroy history before then). is_active
 * is the only schema-supported mechanism, so this is unambiguous, not a
 * choice between competing designs.
 */
export async function deactivateTemplate(id: number): Promise<ScheduleTemplateRow | null> {
  const result = await pool.query<ScheduleTemplateRow>(
    `UPDATE staff_schedule_templates SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING ${TEMPLATE_COLUMNS}`,
    [id]
  );
  return result.rows[0] ?? null;
}
