// erp/src/components/staff/StaffDetailDrawer.tsx
'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from './StatusBadge';
import { formatDuration } from '@/lib/format-duration';

interface DrawerActivity {
  id: number;
  activity: string;
  module: string | null;
  page: string | null;
  created_at: string;
}

interface DrawerDetail {
  id: number;
  display_name: string | null;
  erp_username: string;
  department: string | null;
  role: string;
  display_status: string;
  current_module: string | null;
  current_page: string | null;
  login_at: string | null;
  browser: string | null;
  device: string | null;
  operating_system: string | null;
  current_ip: string | null;
  recent_activity: DrawerActivity[];
}

export function StaffDetailDrawer({ staffId, onClose }: { staffId: number | null; onClose: () => void }) {
  const [detail, setDetail] = useState<DrawerDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (staffId === null) { setDetail(null); return; }
    setLoading(true);
    fetch(`/api/staff/monitor/${staffId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DrawerDetail | null) => setDetail(d))
      .finally(() => setLoading(false));
  }, [staffId]);

  if (staffId === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700">✕</button>
        {loading || !detail ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">{detail.display_name ?? detail.erp_username}</h2>
              <p className="text-xs text-gray-500">{detail.department ?? '—'} · {detail.role}</p>
              <div className="mt-2"><StatusBadge status={detail.display_status} /></div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><p className="text-gray-400">Today&apos;s Login</p><p className="font-medium">{detail.login_at ? new Date(detail.login_at).toLocaleTimeString() : '—'}</p></div>
              <div><p className="text-gray-400">Working Duration</p><p className="font-medium">{formatDuration(detail.login_at)}</p></div>
              <div><p className="text-gray-400">Current Module</p><p className="font-medium">{detail.current_module ?? '—'}</p></div>
              <div><p className="text-gray-400">Current Page</p><p className="font-medium">{detail.current_page ?? '—'}</p></div>
              <div><p className="text-gray-400">Browser</p><p className="font-medium">{detail.browser ?? '—'}</p></div>
              <div><p className="text-gray-400">Device</p><p className="font-medium">{detail.device ?? '—'} / {detail.operating_system ?? '—'}</p></div>
              <div><p className="text-gray-400">IP Address</p><p className="font-medium">{detail.current_ip ?? '—'}</p></div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">Recent Activity</p>
              <div className="space-y-1.5">
                {detail.recent_activity.length === 0 ? (
                  <p className="text-xs text-gray-400">No recent activity</p>
                ) : (
                  detail.recent_activity.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">{a.activity}{a.module ? ` · ${a.module}` : ''}</span>
                      <span className="text-gray-400">{new Date(a.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
