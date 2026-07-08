'use client';

import { useEffect, useState } from 'react';

interface MeResponse {
  role: string;
  isSuperAdmin: boolean;
  permissions: string[];
}

interface GuardState {
  checking: boolean;
  denied: boolean;
}

/**
 * Client-side permission check. Fetches /api/auth/me once and checks
 * whether the current user has the required permission.
 *
 * Usage:
 *   const { checking, denied } = usePermissionGuard('bot.settings');
 *   if (checking) return <Loading />;
 *   if (denied)   return <AccessDenied />;
 */
export function usePermissionGuard(permission: string): GuardState {
  const [state, setState] = useState<GuardState>({ checking: true, denied: false });

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((me: MeResponse) => {
        const allowed =
          me.isSuperAdmin || me.permissions.includes(permission);
        setState({ checking: false, denied: !allowed });
      })
      .catch(() => {
        // Fail-safe: deny on error
        setState({ checking: false, denied: true });
      });
  }, [permission]);

  return state;
}
