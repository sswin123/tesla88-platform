-- 083_staff_monitoring_core.sql
-- Staff Attendance & Live Monitor — Phase 1: core tables, department column,
-- and the NOTIFY trigger that powers the Live Monitor SSE feed.

ALTER TABLE admins ADD COLUMN IF NOT EXISTS department VARCHAR(100);

CREATE TABLE IF NOT EXISTS staff_online_status (
  staff_id          INT PRIMARY KEY REFERENCES admins(id) ON DELETE CASCADE,
  status            VARCHAR(20) NOT NULL DEFAULT 'OFFLINE', -- ONLINE | OFFLINE | BREAK (stored/explicit states only)
  current_module    VARCHAR(100),
  current_page      VARCHAR(255),
  login_at          TIMESTAMPTZ,
  last_activity     TIMESTAMPTZ,
  current_ip        VARCHAR(64),
  browser           VARCHAR(100),
  device            VARCHAR(50),
  operating_system  VARCHAR(100),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_activity_logs (
  id          BIGSERIAL PRIMARY KEY,
  staff_id    INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  activity    VARCHAR(50) NOT NULL, -- LOGIN | LOGOUT | PAGE_VIEW | BREAK_START | BREAK_END | SESSION_TIMEOUT
  module      VARCHAR(100),
  page        VARCHAR(255),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_activity_staff_created
  ON staff_activity_logs(staff_id, created_at DESC);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id                  BIGSERIAL PRIMARY KEY,
  staff_id            INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  attendance_date     DATE NOT NULL,
  login_time          TIMESTAMPTZ,
  logout_time         TIMESTAMPTZ,
  working_minutes     INT NOT NULL DEFAULT 0,
  late_minutes        INT NOT NULL DEFAULT 0,
  early_leave_minutes INT NOT NULL DEFAULT 0,
  attendance_status   VARCHAR(20) NOT NULL DEFAULT 'PRESENT', -- PRESENT | LATE | ABSENT | EARLY_LEAVE | ON_LEAVE
  ip_address          VARCHAR(64),
  browser             VARCHAR(100),
  device              VARCHAR(50),
  operating_system    VARCHAR(100),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff ON staff_attendance(staff_id);

CREATE OR REPLACE FUNCTION notify_staff_monitor_update() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('staff_monitor_updates', json_build_object(
    'type',           'status_update',
    'staff_id',       NEW.staff_id,
    'status',         NEW.status,
    'current_module', NEW.current_module,
    'current_page',   NEW.current_page,
    'last_activity',  NEW.last_activity
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_monitor_notify ON staff_online_status;
CREATE TRIGGER trg_staff_monitor_notify
  AFTER INSERT OR UPDATE ON staff_online_status
  FOR EACH ROW EXECUTE FUNCTION notify_staff_monitor_update();
