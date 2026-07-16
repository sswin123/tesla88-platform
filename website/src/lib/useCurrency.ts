'use client';
import { useState, useEffect } from 'react';

type CurrencyState = { currency: string; decimals: number };

// Module-level cache so multiple components on the same page share one fetch
let _cached: CurrencyState | null = null;
let _pending: Promise<CurrencyState> | null = null;

async function fetchCurrencySettings(): Promise<CurrencyState> {
  if (_cached) return _cached;
  if (!_pending) {
    _pending = fetch('/api/public/settings')
      .then(r => r.json() as Promise<Record<string, string>>)
      .then(d => {
        _cached = {
          currency: d.website_currency ?? 'RM',
          decimals: parseInt(d.website_decimal_places ?? '2', 10),
        };
        return _cached;
      })
      .catch(() => ({ currency: 'RM', decimals: 2 }));
  }
  return _pending;
}

export function useCurrency() {
  const [state, setState] = useState<CurrencyState>(_cached ?? { currency: 'RM', decimals: 2 });

  useEffect(() => {
    if (_cached) return;
    fetchCurrencySettings().then(setState);
  }, []);

  function fmt(n: string | number): string {
    const v = parseFloat(String(n));
    const decs = isNaN(state.decimals) ? 2 : state.decimals;
    return `${state.currency} ${isNaN(v) ? (0).toFixed(decs) : v.toFixed(decs)}`;
  }

  return { currency: state.currency, decimals: state.decimals, fmt };
}
