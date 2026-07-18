'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { MemberProfile } from '@/lib/types';

interface MemberContextValue {
  profile:       MemberProfile | null;
  loading:       boolean;
  /** Full re-fetch from server — use after deposit, approval, etc. */
  refreshProfile: () => Promise<void>;
  /** Optimistic patch — use after withdrawal POST returns updated balances */
  updateProfile:  (patch: Partial<MemberProfile>) => void;
}

const MemberContext = createContext<MemberContextValue>({
  profile:        null,
  loading:        true,
  refreshProfile: async () => {},
  updateProfile:  () => {},
});

export function MemberProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);

  const refreshProfile = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch('/api/member/profile', { cache: 'no-store' });
      if (res.ok) {
        setProfile(await res.json() as MemberProfile);
      } else {
        // 401 = guest; any other error = keep previous state
        if (res.status === 401) setProfile(null);
      }
    } catch {
      // network error — keep previous state
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  const updateProfile = useCallback((patch: Partial<MemberProfile>) => {
    setProfile(prev => prev ? { ...prev, ...patch } : prev);
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  return (
    <MemberContext.Provider value={{ profile, loading, refreshProfile, updateProfile }}>
      {children}
    </MemberContext.Provider>
  );
}

export function useMember(): MemberContextValue {
  return useContext(MemberContext);
}
