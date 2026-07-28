'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { resolveModuleFromPath } from '@/lib/staff-module-map';

const HEARTBEAT_INTERVAL_MS = 60_000;
const RETRY_DELAY_MS = 5_000;

function send(module: string, page: string): Promise<Response> {
  return fetch('/api/staff/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ module, page }),
  });
}

function sendHeartbeat(module: string, page: string): void {
  send(module, page)
    .then((res) => { if (!res.ok) throw new Error('heartbeat failed'); })
    .catch(() => {
      setTimeout(() => { send(module, page).catch(() => { /* give up until next cycle */ }); }, RETRY_DELAY_MS);
    });
}

/** Mounted once per authenticated session inside Sidebar(). */
export function useHeartbeat(): void {
  const pathname = usePathname();

  useEffect(() => {
    const { module, page } = resolveModuleFromPath(pathname);
    sendHeartbeat(module, page);
  }, [pathname]);

  useEffect(() => {
    const interval = setInterval(() => {
      const { module, page } = resolveModuleFromPath(pathname);
      sendHeartbeat(module, page);
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pathname]);
}
