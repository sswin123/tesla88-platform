// erp/src/hooks/useStaffMonitorStream.ts
'use client';

import { useEffect, useState } from 'react';
import { resolveDisplayStatus } from '@/lib/staff-status';

export interface StaffMonitorSnapshot {
  id: number;
  display_name: string | null;
  erp_username: string;
  department: string | null;
  role: string;
  status: string;
  display_status: string;
  current_module: string | null;
  current_page: string | null;
  login_at: string | null;
  last_activity: string | null;
  current_ip: string | null;
  browser: string | null;
  device: string | null;
  operating_system: string | null;
}

export interface StaffMonitorStreamEvent {
  type: string;
  staff_id: number;
  status: string;
  current_module: string | null;
  current_page: string | null;
  last_activity: string | null;
}

export function mergeStaffStatusUpdate(
  rows: StaffMonitorSnapshot[],
  evt: StaffMonitorStreamEvent
): StaffMonitorSnapshot[] {
  if (evt.type !== 'status_update') return rows;
  return rows.map((row) =>
    row.id === evt.staff_id
      ? {
          ...row,
          status: evt.status,
          display_status: resolveDisplayStatus({ storedStatus: evt.status, lastActivity: evt.last_activity }),
          current_module: evt.current_module,
          current_page: evt.current_page,
          last_activity: evt.last_activity,
        }
      : row
  );
}

export function useStaffMonitorStream(initial: StaffMonitorSnapshot[]): StaffMonitorSnapshot[] {
  const [rows, setRows] = useState<StaffMonitorSnapshot[]>(initial);

  useEffect(() => { setRows(initial); }, [initial]);

  useEffect(() => {
    const es = new EventSource('/api/staff/monitor/stream');
    es.onmessage = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as StaffMonitorStreamEvent;
        setRows((prev) => mergeStaffStatusUpdate(prev, evt));
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, []);

  return rows;
}
