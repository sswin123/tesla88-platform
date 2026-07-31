'use client';
import { useState } from 'react';
import { useMember } from '@/lib/contexts/MemberContext';

export type SyncItem = {
  provider_code:  string;
  provider_name:  string;
  wallet_type:    string;
  returned:       number;
  balance_before: number;
  balance_after:  number;
  status:         'synced' | 'empty' | 'skipped' | 'error';
  error?:         string;
};

/**
 * Shared wallet refresh pipeline used by both Desktop (MemberPanel) and
 * Mobile (MemberZoneSection).
 *
 * Flow: POST /api/member/wallet/sync → await refreshProfile()
 *
 * Sync failures are non-fatal: if the ERP sync endpoint is unreachable or
 * returns an error, profile refresh still runs so the balance is up-to-date.
 */
export function useWalletRefresh() {
  const { refreshProfile } = useMember();
  const [refreshing,  setRefreshing]  = useState(false);
  const [syncResults, setSyncResults] = useState<SyncItem[] | null>(null);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setSyncResults(null);

    try {
      const res = await fetch('/api/member/wallet/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as { synced?: SyncItem[] };
        if (data.synced && data.synced.length > 0) {
          setSyncResults(data.synced);
          window.dispatchEvent(
            new CustomEvent('wallet-synced', { detail: { synced: data.synced } }),
          );
        }
      }
    } catch {
      // Sync failure is non-fatal — profile refresh still runs below.
    }

    await refreshProfile();
    setRefreshing(false);
  }

  return { refreshing, syncResults, handleRefresh };
}
