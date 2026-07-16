'use client';
import { useState, useEffect } from 'react';

export interface CurrencyState {
  code:         string;   // ISO-4217, e.g. "MYR"
  symbol:       string;   // Display symbol, e.g. "RM"
  decimals:     number;
  thousandsSep: string;   // Thousands separator: "," | "." | " " | ""
  decimalSep:   string;   // Decimal separator: "." | ","
}

const DEFAULTS: CurrencyState = {
  code:         'MYR',
  symbol:       'RM',
  decimals:     2,
  thousandsSep: ',',
  decimalSep:   '.',
};

// Module-level cache — shared across all component instances per page load
let _cached:  CurrencyState | null = null;
let _pending: Promise<CurrencyState> | null = null;

async function fetchCurrencySettings(): Promise<CurrencyState> {
  if (_cached) return _cached;
  if (!_pending) {
    _pending = fetch('/api/public/settings')
      .then(r => r.json() as Promise<Record<string, string>>)
      .then(d => {
        // Prefer new currency_symbol; fall back to legacy website_currency
        const symbol = d.currency_symbol ?? d.website_currency ?? DEFAULTS.symbol;
        _cached = {
          code:         d.currency_code        ?? DEFAULTS.code,
          symbol,
          decimals:     parseInt(d.website_decimal_places ?? String(DEFAULTS.decimals), 10),
          thousandsSep: d.thousands_separator  ?? DEFAULTS.thousandsSep,
          decimalSep:   d.decimal_separator    ?? DEFAULTS.decimalSep,
        };
        return _cached;
      })
      .catch(() => DEFAULTS);
  }
  return _pending;
}

export function useCurrency() {
  const [state, setState] = useState<CurrencyState>(_cached ?? DEFAULTS);

  useEffect(() => {
    if (_cached) return;
    fetchCurrencySettings().then(setState);
  }, []);

  function fmtAmount(n: string | number): string {
    const v    = parseFloat(String(n));
    const decs = isNaN(state.decimals) ? 2 : state.decimals;
    if (isNaN(v)) return `${state.symbol}${(0).toFixed(decs)}`;

    // Format integer part with thousands separator
    const [wholePart, fracPart] = v.toFixed(decs).split('.');
    const whoWithSep = state.thousandsSep
      ? wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, state.thousandsSep)
      : wholePart;

    const result = decs > 0
      ? `${whoWithSep}${state.decimalSep}${fracPart}`
      : whoWithSep;

    return `${state.symbol}${result}`;
  }

  return {
    code:         state.code,
    symbol:       state.symbol,
    decimals:     state.decimals,
    thousandsSep: state.thousandsSep,
    decimalSep:   state.decimalSep,
    fmt:          fmtAmount,
  };
}
