-- 094_staff_attendance_schedule.sql
-- Staff Attendance & Live Monitor — Phase 2: Schedule (templates/assignments/
-- overrides), multi-session Attendance (staff_attendance_sessions), and
-- historical-snapshot columns on staff_attendance. Additive only — does not
-- touch 083_staff_monitoring_core.sql or any other prior migration.
--
-- Spec of record: docs/superpowers/specs/2026-08-11-staff-attendance-phase2-design.md §20-22

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── staff_schedule_templates ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_schedule_templates (
  id                  BIGSERIAL PRIMARY KEY,
  name                VARCHAR(100) NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  is_overnight        BOOLEAN NOT NULL DEFAULT false,
  working_days        SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  late_grace_minutes  INT NOT NULL DEFAULT 5,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          INT REFERENCES admins(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Range check is a plain, subquery-free expression (Postgres CHECK constraints
  -- reject subqueries outright — confirmed live during this migration's
  -- authoring: `ARRAY(SELECT DISTINCT unnest(...))` fails with "cannot use
  -- subquery in check constraint"). Non-empty uses cardinality(), NOT
  -- array_length() — array_length('{}',1) returns NULL, and NULL passes a
  -- CHECK by Postgres's three-valued logic, silently allowing an empty array
  -- through; cardinality() returns 0 for an empty array, closing that gap.
  -- "No duplicate day values" cannot be expressed as a subquery-free CHECK and
  -- is therefore application/repository-layer validation (Task 10), per the
  -- spec's own pre-authorized fallback (§20).
  CONSTRAINT working_days_valid CHECK (
    working_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
    AND cardinality(working_days) > 0
  )
);

-- ── staff_schedule_assignments ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_schedule_assignments (
  id              BIGSERIAL PRIMARY KEY,
  staff_id        INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  template_id     BIGINT NOT NULL REFERENCES staff_schedule_templates(id) ON DELETE RESTRICT,
  effective_from  DATE NOT NULL,
  effective_to    DATE,                     -- NULL = open-ended / long-lived
  created_by      INT REFERENCES admins(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- '[]' = both bounds inclusive as authored; daterange() normalizes this to
  -- Postgres's canonical [lower, upper) form internally (upper bound becomes
  -- exclusive, one day past effective_to). A NULL effective_to produces an
  -- unbounded upper end. This means two ranges are adjacent-not-overlapping
  -- exactly when one's effective_to is the day before the other's
  -- effective_from (e.g. 2026-08-01..2026-08-31 and 2026-09-01..2026-09-30) —
  -- verified live below (Step: Overlap Test) before this migration was
  -- considered done.
  effective_range daterange GENERATED ALWAYS AS (
    daterange(effective_from, effective_to, '[]')
  ) STORED,
  -- DB-level overlap protection (spec §20 FINAL DECISION) — avoids the
  -- SELECT-then-INSERT race condition an application-layer-only check would
  -- have. Requires btree_gist for the integer equality term inside GiST.
  CONSTRAINT no_overlapping_assignments EXCLUDE USING gist (
    staff_id WITH =, effective_range WITH &&
  )
);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_staff ON staff_schedule_assignments(staff_id, effective_from);

-- ── staff_schedule_overrides ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_schedule_overrides (
  id                  BIGSERIAL PRIMARY KEY,
  staff_id            INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  override_date       DATE NOT NULL,
  start_time          TIME,                 -- NULL when is_rest_day = true
  end_time            TIME,
  is_rest_day         BOOLEAN NOT NULL DEFAULT false,
  late_grace_minutes  INT,
  reason              TEXT,
  created_by          INT REFERENCES admins(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, override_date)
);
CREATE INDEX IF NOT EXISTS idx_schedule_overrides_staff_date ON staff_schedule_overrides(staff_id, override_date);

-- ── staff_attendance_sessions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_attendance_sessions (
  id                BIGSERIAL PRIMARY KEY,
  attendance_id     BIGINT NOT NULL REFERENCES staff_attendance(id) ON DELETE CASCADE,
  staff_id          INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  login_at          TIMESTAMPTZ NOT NULL,
  logout_at         TIMESTAMPTZ,            -- NULL = never a real LOGOUT (still open, or TIMEOUT-finalized)
  last_activity_at  TIMESTAMPTZ NOT NULL,
  checkout_source   VARCHAR(20),            -- LOGOUT | TIMEOUT | SYSTEM | NULL (open)
  working_minutes   INT NOT NULL DEFAULT 0, -- written at close/finalize time; 0 while open
  ip_address        VARCHAR(64),
  browser           VARCHAR(100),
  device            VARCHAR(50),
  operating_system  VARCHAR(100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_attendance_sessions_checkout_source_valid
    CHECK (checkout_source IS NULL OR checkout_source IN ('LOGOUT','TIMEOUT','SYSTEM'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_attendance ON staff_attendance_sessions(attendance_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_staff_login ON staff_attendance_sessions(staff_id, login_at DESC);

-- ── staff_attendance: historical snapshot columns (spec §18) ───────────────
-- Attendance is historical fact, Schedule is current configuration — these
-- columns freeze what was true at session-open time so a later Template/
-- Assignment/Override edit can never retroactively change a past day's
-- Attendance row. additive-only ADD COLUMN IF NOT EXISTS, table itself
-- created by 083_staff_monitoring_core.sql (untouched).

ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS scheduled_start_at   TIMESTAMPTZ;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS scheduled_end_at     TIMESTAMPTZ;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS schedule_source_type VARCHAR(20);
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS schedule_source_id   BIGINT;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS late_grace_minutes   INT;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS checkout_source      VARCHAR(20);
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS is_rest_day          BOOLEAN NOT NULL DEFAULT false;

-- ── Constraints on staff_attendance (spec §22) ──────────────────────────────
-- attendance_status: only the 6 values that are ever actually persisted.
-- ABSENT/REST_DAY are Reporting-Layer-derived, never written to this column
-- (spec §15/§26 — no materialization). DROP IF EXISTS first so this migration
-- is safely re-runnable without a duplicate-constraint-name error; this does
-- NOT touch 083, it only guards this migration's own idempotency.

ALTER TABLE staff_attendance DROP CONSTRAINT IF EXISTS staff_attendance_status_check;
ALTER TABLE staff_attendance ADD CONSTRAINT staff_attendance_status_check
  CHECK (attendance_status IN ('PRESENT','LATE','EARLY_LEAVE','LATE_AND_EARLY','INCOMPLETE','WORKED_ON_REST_DAY'));

ALTER TABLE staff_attendance DROP CONSTRAINT IF EXISTS staff_attendance_checkout_source_valid;
ALTER TABLE staff_attendance ADD CONSTRAINT staff_attendance_checkout_source_valid
  CHECK (checkout_source IS NULL OR checkout_source IN ('LOGOUT','TIMEOUT','SYSTEM'));

ALTER TABLE staff_attendance DROP CONSTRAINT IF EXISTS staff_attendance_schedule_source_type_valid;
ALTER TABLE staff_attendance ADD CONSTRAINT staff_attendance_schedule_source_type_valid
  CHECK (schedule_source_type IS NULL OR schedule_source_type IN ('TEMPLATE','OVERRIDE'));
