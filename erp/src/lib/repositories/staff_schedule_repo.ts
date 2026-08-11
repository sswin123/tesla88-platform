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

/**
 * Assignments (spec §6, migration 094 staff_schedule_assignments). Task 11
 * ONLY — no Overrides (Task 12) or getEffectiveSchedule() (Task 13) here.
 */

export class ScheduleOverlapError extends Error {
  constructor(message = 'This staff member already has a schedule assignment covering part of this date range.') {
    super(message);
    this.name = 'ScheduleOverlapError';
  }
}

export interface ScheduleAssignmentRow {
  id: number;
  staff_id: number;
  template_id: number;
  effective_from: string;
  effective_to: string | null; // NULL = open-ended (spec §6)
  created_by: number | null;
  created_at: string;
}

export interface CreateAssignmentInput {
  staffId: number;
  templateId: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
  createdBy: number | null;
}

export interface UpdateAssignmentInput {
  templateId?: number;
  effectiveFrom?: string;
  /** Explicit `null` clears to open-ended; `undefined` (omitted) leaves it unchanged. */
  effectiveTo?: string | null;
}

const ASSIGNMENT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(dateStr: string): boolean {
  if (!ASSIGNMENT_DATE_RE.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * effectiveFrom === effectiveTo (a single-day assignment) is valid — verified
 * live against Postgres 14.23: daterange(d, d, '[]') normalizes to [d, d+1),
 * not an empty range. Only effectiveFrom > effectiveTo is rejected; Postgres
 * itself would reject a reversed pair too (SQLSTATE 22000, "range lower
 * bound must be less than or equal to range upper bound" — verified live),
 * but that is a generic data-exception, not the exclusion-constraint
 * violation ScheduleOverlapError maps, so it is caught here first for a
 * clean, specific message instead of surfacing the raw Postgres error.
 */
function validateEffectiveRange(effectiveFrom: string, effectiveTo: string | null): void {
  if (!isValidCalendarDate(effectiveFrom)) {
    throw new Error(`staff_schedule_repo: invalid effectiveFrom: ${effectiveFrom}`);
  }
  if (effectiveTo !== null) {
    if (!isValidCalendarDate(effectiveTo)) {
      throw new Error(`staff_schedule_repo: invalid effectiveTo: ${effectiveTo}`);
    }
    if (effectiveFrom > effectiveTo) {
      throw new Error(
        `staff_schedule_repo: effectiveFrom (${effectiveFrom}) must not be after effectiveTo (${effectiveTo})`
      );
    }
  }
}

/**
 * Live-verified against Postgres 14.23 (telegram-member-bot-postgres-1,
 * migration 094 already applied): non-overlapping ranges succeed, adjacent
 * ranges succeed ([2026-08-01,2026-09-01) then [2026-09-01,2026-10-01)),
 * overlapping ranges for the SAME staff_id fail regardless of whether
 * template_id differs (the EXCLUDE constraint is staff_id-scoped, not
 * staff_id+template_id-scoped — confirmed with two different templates),
 * different staff_id with the same/overlapping dates succeeds, and an
 * UPDATE that would create an overlap is rejected the same way an INSERT
 * is. All temp rows created for verification were rolled back (no residue).
 */
function isExclusionViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23P01';
}

const ASSIGNMENT_COLUMNS =
  'id, staff_id, template_id, effective_from::text, effective_to::text, created_by, created_at::text';

export async function createAssignment(input: CreateAssignmentInput): Promise<number> {
  validateEffectiveRange(input.effectiveFrom, input.effectiveTo);
  try {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO staff_schedule_assignments (staff_id, template_id, effective_from, effective_to, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.staffId, input.templateId, input.effectiveFrom, input.effectiveTo, input.createdBy]
    );
    return result.rows[0].id;
  } catch (err) {
    if (isExclusionViolation(err)) throw new ScheduleOverlapError();
    throw err;
  }
}

export async function getAssignmentById(id: number): Promise<ScheduleAssignmentRow | null> {
  const result = await pool.query<ScheduleAssignmentRow>(
    `SELECT ${ASSIGNMENT_COLUMNS} FROM staff_schedule_assignments WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function listAssignmentsForStaff(staffId: number): Promise<ScheduleAssignmentRow[]> {
  const result = await pool.query<ScheduleAssignmentRow>(
    `SELECT ${ASSIGNMENT_COLUMNS} FROM staff_schedule_assignments WHERE staff_id = $1 ORDER BY effective_from DESC`,
    [staffId]
  );
  return result.rows;
}

/**
 * Partial update. If either effectiveFrom or effectiveTo is patched, the
 * current row is fetched first so the combined range can be revalidated
 * (mirrors updateTemplate()'s handling of startTime/endTime). Returns null
 * if the assignment does not exist. A resulting overlap surfaces
 * ScheduleOverlapError, same as createAssignment().
 */
export async function updateAssignment(id: number, patch: UpdateAssignmentInput): Promise<ScheduleAssignmentRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.templateId !== undefined) {
    fields.push(`template_id = $${i++}`);
    values.push(patch.templateId);
  }

  if (patch.effectiveFrom !== undefined || patch.effectiveTo !== undefined) {
    let effectiveFrom = patch.effectiveFrom;
    let effectiveTo = patch.effectiveTo;
    // Only fetch the current row when one side of the range is omitted —
    // if the caller supplied both, there is nothing to look up.
    if (effectiveFrom === undefined || effectiveTo === undefined) {
      const current = await getAssignmentById(id);
      if (!current) return null;
      if (effectiveFrom === undefined) effectiveFrom = current.effective_from;
      if (effectiveTo === undefined) effectiveTo = current.effective_to;
    }
    validateEffectiveRange(effectiveFrom, effectiveTo);
    fields.push(`effective_from = $${i++}`);
    values.push(effectiveFrom);
    fields.push(`effective_to = $${i++}`);
    values.push(effectiveTo);
  }

  if (fields.length === 0) return getAssignmentById(id);

  values.push(id);

  try {
    const result = await pool.query<ScheduleAssignmentRow>(
      `UPDATE staff_schedule_assignments SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${ASSIGNMENT_COLUMNS}`,
      values
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (isExclusionViolation(err)) throw new ScheduleOverlapError();
    throw err;
  }
}

/**
 * Overrides (spec §7, migration 094 staff_schedule_overrides). Task 12
 * ONLY — no getEffectiveSchedule() (Task 13), no Override > Assignment >
 * No Schedule resolution.
 *
 * IMPORTANT: unlike Assignment, Override has NO template_id column and no
 * FK to staff_schedule_templates — confirmed live against migration 094
 * and spec §7 ("该天专用的 start_time/end_time/is_rest_day/
 * late_grace_minutes"), both of which independently agree Override carries
 * its own direct time fields rather than pointing at a Template. There is
 * also no updated_at column on this table (unlike Template).
 */

export class ScheduleOverrideConflictError extends Error {
  constructor(message = 'This staff member already has a schedule override for this date.') {
    super(message);
    this.name = 'ScheduleOverrideConflictError';
  }
}

export interface ScheduleOverrideRow {
  id: number;
  staff_id: number;
  override_date: string;
  start_time: string | null;
  end_time: string | null;
  is_rest_day: boolean;
  late_grace_minutes: number | null;
  reason: string | null;
  created_by: number | null;
  created_at: string;
}

export interface CreateOverrideInput {
  staffId: number;
  overrideDate: string; // YYYY-MM-DD
  isRestDay: boolean;
  /** Required (non-null) when isRestDay is false; forced to NULL when isRestDay is true. */
  startTime: string | null;
  endTime: string | null;
  lateGraceMinutes: number | null;
  reason: string | null;
  createdBy: number | null;
}

export interface UpdateOverrideInput {
  overrideDate?: string;
  isRestDay?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  lateGraceMinutes?: number | null;
  reason?: string | null;
}

/**
 * Enforces the DB comment's invariant (start_time/end_time NULL when
 * is_rest_day=true) — not DB-enforced by any CHECK constraint (confirmed
 * live: only a plain UNIQUE(staff_id, override_date) exists), so the
 * repository is the one place this is guaranteed. A Rest Day override
 * silently clears any supplied times rather than rejecting them (more
 * likely stale caller state than a real conflicting intent). A non-rest
 * override requires both times — an override that is neither a rest day
 * nor carries working hours would be a no-op row with no meaning.
 */
function validateOverrideTimes(
  isRestDay: boolean, startTime: string | null, endTime: string | null
): { startTime: string | null; endTime: string | null } {
  if (isRestDay) return { startTime: null, endTime: null };

  if (startTime === null || endTime === null) {
    throw new Error('staff_schedule_repo: startTime and endTime are required when isRestDay is false');
  }
  validateTime(startTime, 'startTime');
  validateTime(endTime, 'endTime');
  assertStartEndNotEqual(startTime, endTime);
  return { startTime, endTime };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23505';
}

const OVERRIDE_COLUMNS =
  'id, staff_id, override_date::text, start_time::text, end_time::text, is_rest_day, ' +
  'late_grace_minutes, reason, created_by, created_at::text';

export async function createOverride(input: CreateOverrideInput): Promise<number> {
  if (!isValidCalendarDate(input.overrideDate)) {
    throw new Error(`staff_schedule_repo: invalid overrideDate: ${input.overrideDate}`);
  }
  if (input.lateGraceMinutes !== null) validateLateGraceMinutes(input.lateGraceMinutes);
  const { startTime, endTime } = validateOverrideTimes(input.isRestDay, input.startTime, input.endTime);

  try {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO staff_schedule_overrides
         (staff_id, override_date, start_time, end_time, is_rest_day, late_grace_minutes, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [input.staffId, input.overrideDate, startTime, endTime, input.isRestDay, input.lateGraceMinutes, input.reason, input.createdBy]
    );
    return result.rows[0].id;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ScheduleOverrideConflictError();
    throw err;
  }
}

export async function getOverrideById(id: number): Promise<ScheduleOverrideRow | null> {
  const result = await pool.query<ScheduleOverrideRow>(
    `SELECT ${OVERRIDE_COLUMNS} FROM staff_schedule_overrides WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getOverrideByStaffAndDate(staffId: number, overrideDate: string): Promise<ScheduleOverrideRow | null> {
  const result = await pool.query<ScheduleOverrideRow>(
    `SELECT ${OVERRIDE_COLUMNS} FROM staff_schedule_overrides WHERE staff_id = $1 AND override_date = $2`,
    [staffId, overrideDate]
  );
  return result.rows[0] ?? null;
}

export async function listOverridesForStaff(staffId: number): Promise<ScheduleOverrideRow[]> {
  const result = await pool.query<ScheduleOverrideRow>(
    `SELECT ${OVERRIDE_COLUMNS} FROM staff_schedule_overrides WHERE staff_id = $1 ORDER BY override_date DESC`,
    [staffId]
  );
  return result.rows;
}

/**
 * Partial update. If any of isRestDay/startTime/endTime is patched, the
 * current row is fetched first so the combined rest-day/time state can be
 * revalidated (mirrors updateTemplate()/updateAssignment()). Returns null
 * if the override does not exist. A resulting (staff_id, override_date)
 * conflict surfaces ScheduleOverrideConflictError, same as createOverride().
 */
export async function updateOverride(id: number, patch: UpdateOverrideInput): Promise<ScheduleOverrideRow | null> {
  if (patch.overrideDate !== undefined && !isValidCalendarDate(patch.overrideDate)) {
    throw new Error(`staff_schedule_repo: invalid overrideDate: ${patch.overrideDate}`);
  }
  if (patch.lateGraceMinutes !== undefined && patch.lateGraceMinutes !== null) {
    validateLateGraceMinutes(patch.lateGraceMinutes);
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.overrideDate !== undefined) {
    fields.push(`override_date = $${i++}`);
    values.push(patch.overrideDate);
  }

  if (patch.isRestDay !== undefined || patch.startTime !== undefined || patch.endTime !== undefined) {
    const current = await getOverrideById(id);
    if (!current) return null;
    const isRestDay = patch.isRestDay ?? current.is_rest_day;
    const startTime = patch.startTime !== undefined ? patch.startTime : current.start_time;
    const endTime = patch.endTime !== undefined ? patch.endTime : current.end_time;
    const validated = validateOverrideTimes(isRestDay, startTime, endTime);
    fields.push(`is_rest_day = $${i++}`);
    values.push(isRestDay);
    fields.push(`start_time = $${i++}`);
    values.push(validated.startTime);
    fields.push(`end_time = $${i++}`);
    values.push(validated.endTime);
  }

  if (patch.lateGraceMinutes !== undefined) {
    fields.push(`late_grace_minutes = $${i++}`);
    values.push(patch.lateGraceMinutes);
  }
  if (patch.reason !== undefined) {
    fields.push(`reason = $${i++}`);
    values.push(patch.reason);
  }

  if (fields.length === 0) return getOverrideById(id);

  values.push(id);

  try {
    const result = await pool.query<ScheduleOverrideRow>(
      `UPDATE staff_schedule_overrides SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${OVERRIDE_COLUMNS}`,
      values
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ScheduleOverrideConflictError();
    throw err;
  }
}
