'use client';

import { useState, useEffect, useRef } from 'react';
import { useCurrency } from '@/lib/useCurrency';

// ─── Theme System ─────────────────────────────────────────────────────────────

export interface TxTheme {
  cardBg: string;
  cardBorder: string;
  cardGlow: string;
  depositColor: string;
  depositBg: string;
  withdrawColor: string;
  withdrawBg: string;
  rowBg: string;
  divider: string;
  liveDot: string;
  liveText: string;
  badgeBg: string;
  badgeText: string;
  timeColor: string;
  phoneColor: string;
  fontFamily?: string;
}

export const LIVE_TX_THEMES: Record<string, TxTheme> = {
  classic_purple: {
    cardBg: 'var(--bg-card)',
    cardBorder: 'color-mix(in srgb, var(--brand-primary) 30%, transparent)',
    cardGlow: '0 0 20px color-mix(in srgb, var(--brand-primary) 8%, transparent)',
    depositColor: '#22c55e', depositBg: 'rgba(34,197,94,0.10)',
    withdrawColor: '#a855f7', withdrawBg: 'rgba(168,85,247,0.10)',
    rowBg: 'var(--bg-surface3)', divider: 'var(--border-dim)',
    liveDot: '#ef4444', liveText: '#ef4444',
    badgeBg: 'rgba(251,191,36,0.12)', badgeText: '#d97706',
    timeColor: 'var(--text-faint)', phoneColor: 'var(--text-base)',
  },
  cyber_neon: {
    cardBg: '#0d1117', cardBorder: '#00e5ff',
    cardGlow: '0 0 20px rgba(0,229,255,0.15)',
    depositColor: '#00e5ff', depositBg: 'rgba(0,229,255,0.08)',
    withdrawColor: '#ff0080', withdrawBg: 'rgba(255,0,128,0.08)',
    rowBg: 'rgba(0,229,255,0.04)', divider: 'rgba(0,229,255,0.3)',
    liveDot: '#00e5ff', liveText: '#00e5ff',
    badgeBg: 'rgba(0,229,255,0.12)', badgeText: '#00e5ff',
    timeColor: 'rgba(0,229,255,0.5)', phoneColor: '#00e5ff',
    fontFamily: '"Courier New", monospace',
  },
  blue_tech: {
    cardBg: '#0f172a', cardBorder: 'rgba(96,165,250,0.3)',
    cardGlow: '0 0 20px rgba(96,165,250,0.1)',
    depositColor: '#60a5fa', depositBg: 'rgba(96,165,250,0.10)',
    withdrawColor: '#818cf8', withdrawBg: 'rgba(129,140,248,0.10)',
    rowBg: 'rgba(96,165,250,0.05)', divider: 'rgba(96,165,250,0.2)',
    liveDot: '#60a5fa', liveText: '#60a5fa',
    badgeBg: 'rgba(96,165,250,0.12)', badgeText: '#60a5fa',
    timeColor: 'rgba(148,163,184,0.6)', phoneColor: '#e2e8f0',
  },
  red_luxury: {
    cardBg: '#1a0505', cardBorder: 'rgba(239,68,68,0.4)',
    cardGlow: '0 0 20px rgba(239,68,68,0.1)',
    depositColor: '#f87171', depositBg: 'rgba(248,113,113,0.10)',
    withdrawColor: '#fbbf24', withdrawBg: 'rgba(251,191,36,0.10)',
    rowBg: 'rgba(239,68,68,0.05)', divider: 'rgba(239,68,68,0.2)',
    liveDot: '#ef4444', liveText: '#f87171',
    badgeBg: 'rgba(251,191,36,0.12)', badgeText: '#fbbf24',
    timeColor: 'rgba(248,113,113,0.5)', phoneColor: '#fecaca',
  },
  gold_vip: {
    cardBg: '#0a0800', cardBorder: 'rgba(217,119,6,0.6)',
    cardGlow: '0 0 20px rgba(217,119,6,0.15)',
    depositColor: '#d97706', depositBg: 'rgba(217,119,6,0.12)',
    withdrawColor: '#94a3b8', withdrawBg: 'rgba(148,163,184,0.08)',
    rowBg: 'rgba(217,119,6,0.04)', divider: 'rgba(217,119,6,0.3)',
    liveDot: '#d97706', liveText: '#d97706',
    badgeBg: 'rgba(217,119,6,0.15)', badgeText: '#d97706',
    timeColor: 'rgba(217,119,6,0.5)', phoneColor: '#fbbf24',
  },
  emerald_green: {
    cardBg: '#071f10', cardBorder: 'rgba(16,185,129,0.3)',
    cardGlow: '0 0 20px rgba(16,185,129,0.1)',
    depositColor: '#10b981', depositBg: 'rgba(16,185,129,0.10)',
    withdrawColor: '#6ee7b7', withdrawBg: 'rgba(110,231,183,0.08)',
    rowBg: 'rgba(16,185,129,0.05)', divider: 'rgba(16,185,129,0.2)',
    liveDot: '#10b981', liveText: '#10b981',
    badgeBg: 'rgba(16,185,129,0.12)', badgeText: '#34d399',
    timeColor: 'rgba(16,185,129,0.5)', phoneColor: '#a7f3d0',
  },
  dark_glass: {
    cardBg: 'rgba(10,10,20,0.85)', cardBorder: 'rgba(255,255,255,0.1)',
    cardGlow: '0 8px 32px rgba(0,0,0,0.4)',
    depositColor: '#22c55e', depositBg: 'rgba(34,197,94,0.08)',
    withdrawColor: '#c084fc', withdrawBg: 'rgba(192,132,252,0.08)',
    rowBg: 'rgba(255,255,255,0.04)', divider: 'rgba(255,255,255,0.08)',
    liveDot: '#ef4444', liveText: '#ef4444',
    badgeBg: 'rgba(255,255,255,0.08)', badgeText: '#d1d5db',
    timeColor: 'rgba(255,255,255,0.3)', phoneColor: 'rgba(255,255,255,0.8)',
  },
  cyberpunk: {
    cardBg: '#0a0014', cardBorder: '#ec4899',
    cardGlow: '0 0 20px rgba(236,72,153,0.2)',
    depositColor: '#facc15', depositBg: 'rgba(250,204,21,0.10)',
    withdrawColor: '#ec4899', withdrawBg: 'rgba(236,72,153,0.10)',
    rowBg: 'rgba(236,72,153,0.04)', divider: 'rgba(236,72,153,0.3)',
    liveDot: '#facc15', liveText: '#facc15',
    badgeBg: 'rgba(250,204,21,0.12)', badgeText: '#facc15',
    timeColor: 'rgba(236,72,153,0.5)', phoneColor: '#f0abfc',
    fontFamily: '"Courier New", monospace',
  },
  matrix: {
    cardBg: '#000900', cardBorder: '#00ff41',
    cardGlow: '0 0 20px rgba(0,255,65,0.15)',
    depositColor: '#00ff41', depositBg: 'rgba(0,255,65,0.08)',
    withdrawColor: '#00cc33', withdrawBg: 'rgba(0,204,51,0.08)',
    rowBg: 'rgba(0,255,65,0.04)', divider: 'rgba(0,255,65,0.3)',
    liveDot: '#00ff41', liveText: '#00ff41',
    badgeBg: 'rgba(0,255,65,0.12)', badgeText: '#00ff41',
    timeColor: 'rgba(0,255,65,0.5)', phoneColor: '#39ff14',
    fontFamily: '"Courier New", monospace',
  },
  minimal: {
    cardBg: 'var(--bg-card)', cardBorder: 'var(--border-mid)',
    cardGlow: 'none',
    depositColor: '#4ade80', depositBg: 'rgba(74,222,128,0.08)',
    withdrawColor: '#a78bfa', withdrawBg: 'rgba(167,139,250,0.08)',
    rowBg: 'var(--bg-surface2)', divider: 'var(--border-dim)',
    liveDot: '#ef4444', liveText: '#ef4444',
    badgeBg: 'var(--bg-surface3)', badgeText: 'var(--text-muted)',
    timeColor: 'var(--text-faint)', phoneColor: 'var(--text-base)',
  },
  titanium: {
    cardBg: '#111827', cardBorder: 'rgba(148,163,184,0.3)',
    cardGlow: '0 0 20px rgba(148,163,184,0.05)',
    depositColor: '#94a3b8', depositBg: 'rgba(148,163,184,0.10)',
    withdrawColor: '#64748b', withdrawBg: 'rgba(100,116,139,0.10)',
    rowBg: 'rgba(148,163,184,0.05)', divider: 'rgba(148,163,184,0.2)',
    liveDot: '#94a3b8', liveText: '#94a3b8',
    badgeBg: 'rgba(148,163,184,0.12)', badgeText: '#cbd5e1',
    timeColor: 'rgba(100,116,139,0.6)', phoneColor: '#e2e8f0',
  },
  future_ai: {
    cardBg: 'rgba(2,6,23,0.95)', cardBorder: 'rgba(56,189,248,0.3)',
    cardGlow: '0 0 30px rgba(56,189,248,0.12)',
    depositColor: '#38bdf8', depositBg: 'rgba(56,189,248,0.08)',
    withdrawColor: '#818cf8', withdrawBg: 'rgba(129,140,248,0.08)',
    rowBg: 'rgba(56,189,248,0.04)', divider: 'rgba(56,189,248,0.15)',
    liveDot: '#38bdf8', liveText: '#38bdf8',
    badgeBg: 'rgba(56,189,248,0.10)', badgeText: '#7dd3fc',
    timeColor: 'rgba(56,189,248,0.4)', phoneColor: '#bae6fd',
  },
};

const FONT_MAP: Record<string, string | undefined> = {
  default:    undefined,
  monospace:  '"Courier New", Courier, monospace',
  modern:     '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  serif:      'Georgia, "Times New Roman", serif',
  tech:       '"Courier New", Courier, monospace',
  gaming:     '"Segoe UI", system-ui, sans-serif',
  luxury:     'Georgia, "Palatino Linotype", serif',
  futuristic: '"Courier New", monospace',
  led:        '"Courier New", monospace',
  neon:       '"Courier New", monospace',
};

function resolveTheme(
  themeId: string,
  customTheme?: Record<string, string>,
  fontStyle?: string,
): TxTheme {
  let base: TxTheme;
  if (themeId === 'custom' && customTheme) {
    base = {
      cardBg:       customTheme.card_bg     || 'var(--bg-card)',
      cardBorder:   customTheme.card_border || 'rgba(168,85,247,0.3)',
      cardGlow:     customTheme.glow        || 'none',
      depositColor: customTheme.deposit_color  || '#22c55e',
      depositBg:    customTheme.deposit_bg     || 'rgba(34,197,94,0.10)',
      withdrawColor: customTheme.withdraw_color || '#a855f7',
      withdrawBg:    customTheme.withdraw_bg    || 'rgba(168,85,247,0.10)',
      rowBg:        customTheme.row_bg     || 'var(--bg-surface3)',
      divider:      customTheme.divider    || 'var(--border-dim)',
      liveDot:      customTheme.live_dot   || '#ef4444',
      liveText:     customTheme.live_dot   || '#ef4444',
      badgeBg:      customTheme.badge_bg   || 'rgba(251,191,36,0.12)',
      badgeText:    customTheme.badge_text || '#d97706',
      timeColor:    customTheme.time_color   || 'var(--text-faint)',
      phoneColor:   customTheme.phone_color  || 'var(--text-base)',
    };
  } else {
    base = LIVE_TX_THEMES[themeId] ?? LIVE_TX_THEMES.classic_purple;
  }
  if (fontStyle && fontStyle !== 'default' && FONT_MAP[fontStyle]) {
    return { ...base, fontFamily: FONT_MAP[fontStyle] };
  }
  return base;
}

// ─── Activity generation ───────────────────────────────────────────────────────

const GEN_PREFIXES = ['601','6011','6012','6013','6014','6015','6016','6017','6018','6019'];

// Provider list loaded from CMS — starts empty, populated on first mount
// Only used for smart_mix mode (auto_generated uses server-side store which queries DB directly)
let _runtimeProviders: string[] = [];
let _providersLoaded = false;

async function loadCmsProviders(): Promise<void> {
  if (_providersLoaded) return;
  try {
    const res  = await fetch('/api/public/game-providers', { cache: 'no-store' });
    const rows = await res.json() as Array<{ provider_name: string }>;
    if (Array.isArray(rows) && rows.length > 0) {
      _runtimeProviders = rows.map(r => r.provider_name);
    }
    _providersLoaded = true;
  } catch { /* retry next time */ }
}

let _genCounter = 1;
function nextGenId(prefix: string) { return `${prefix}${_genCounter++}`; }

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function genPhone(): string {
  const prefix = randPick(GEN_PREFIXES);
  const rest   = String(randInt(10000000, 99999999)).slice(0, 8 - (prefix.length - 3));
  const digits = prefix + rest;
  return digits.slice(0, 4) + '*'.repeat(5) + digits.slice(-3);
}

// Weighted amount pools — realistic casino distribution
const DEPOSIT_COMMON  = [30, 50, 100, 150, 200, 300, 500];
const DEPOSIT_MEDIUM  = [500, 600, 700, 800, 1000, 1200, 1500, 2000];
const DEPOSIT_LARGE   = [1000, 2000, 3000, 5000];
const DEPOSIT_WHALE   = [10000, 20000, 50000];

const WITHDRAW_COMMON = [100, 150, 200, 300, 500, 800];
const WITHDRAW_MEDIUM = [500, 800, 1000, 1500, 2000];
const WITHDRAW_LARGE  = [2000, 3000, 5000];
const WITHDRAW_WHALE  = [10000, 30000];

// Profile multipliers on the common/medium pools
const PROFILE_SCALE: Record<string, number> = {
  conservative: 0.5,
  normal:       1.0,
  high_roller:  2.5,
  vip:          8.0,
  random:       1.5,
};

interface AmountRange { min: number; max: number }

function genDepositAmount(profile: string, custom?: AmountRange): number {
  if (profile === 'custom_range' && custom) {
    const step = Math.max(50, Math.round((custom.max - custom.min) / 20 / 50) * 50);
    return Math.round((custom.min + Math.random() * (custom.max - custom.min)) / step) * step || custom.min;
  }
  const scale = PROFILE_SCALE[profile] ?? 1;
  const roll = Math.random();
  let pool: number[];
  if (roll < 0.50)      pool = DEPOSIT_COMMON;
  else if (roll < 0.85) pool = DEPOSIT_MEDIUM;
  else if (roll < 0.97) pool = DEPOSIT_LARGE;
  else                  pool = DEPOSIT_WHALE;
  return Math.round(randPick(pool) * scale / 50) * 50 || 50;
}

function genWithdrawAmount(profile: string, custom?: AmountRange): number {
  if (profile === 'custom_range' && custom) {
    const step = Math.max(50, Math.round((custom.max - custom.min) / 20 / 50) * 50);
    return Math.round((custom.min + Math.random() * (custom.max - custom.min)) / step) * step || custom.min;
  }
  const scale = PROFILE_SCALE[profile] ?? 1;
  const roll = Math.random();
  let pool: number[];
  if (roll < 0.50)      pool = WITHDRAW_COMMON;
  else if (roll < 0.85) pool = WITHDRAW_MEDIUM;
  else if (roll < 0.97) pool = WITHDRAW_LARGE;
  else                  pool = WITHDRAW_WHALE;
  return Math.round(randPick(pool) * scale / 50) * 50 || 100;
}

interface GenRowOpts { depRange?: AmountRange; wthRange?: AmountRange }

function genRow(profile: string, isDeposit: boolean, providers: string[], baseAgo = 0, opts: GenRowOpts = {}): TxRow {
  const pool = providers.length > 0 ? providers : ['---'];
  return {
    id:       nextGenId(isDeposit ? 'gd' : 'gw'),
    phone:    genPhone(),
    amount:   isDeposit
      ? genDepositAmount(profile, opts.depRange)
      : genWithdrawAmount(profile, opts.wthRange),
    provider: randPick(pool),
    ts:       Date.now() - baseAgo,
  };
}

function generateRows(profile: string, count: number, isDeposit: boolean, providers: string[], baseAgo = 0, opts: GenRowOpts = {}): TxRow[] {
  let agoMs = baseAgo;
  return Array.from({ length: count }, () => {
    const row = { ...genRow(profile, isDeposit, providers, 0, opts), ts: Date.now() - agoMs };
    agoMs += randInt(8000, 40000);
    return row;
  });
}

// ─── Data types ───────────────────────────────────────────────────────────────

interface TxRow {
  id:       string;
  phone:    string;
  amount:   number;
  provider: string;
  ts:       number;
}

interface TxData {
  deposits:    TxRow[];
  withdrawals: TxRow[];
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}秒前`;
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  return `${Math.floor(s / 3600)}时前`;
}

function absTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatAmount(amount: number, style: string): string {
  if (style === 'hidden') return '***';
  if (style === 'range') {
    // Round to nearest bracket: e.g. 347 → "300-399"
    const magnitude = amount < 100 ? 10 : amount < 1000 ? 100 : amount < 10000 ? 1000 : 10000;
    const lo = Math.floor(amount / magnitude) * magnitude;
    const hi = lo + magnitude - 1;
    return `${lo.toLocaleString()}-${hi.toLocaleString()}`;
  }
  // 'full' — always 2 decimal places
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SPEED_MAP: Record<string, number> = {
  slow:   15000,
  normal:  8000,
  fast:    3000,
};

// ─── Row component ────────────────────────────────────────────────────────────

function TxRow({
  row,
  isDeposit,
  tick,
  theme,
  animationStyle,
  amountStyle,
  providerStyle,
  timestampStyle,
  isNew,
  currencySymbol,
}: {
  row: TxRow;
  isDeposit: boolean;
  tick: number;
  theme: TxTheme;
  animationStyle: string;
  amountStyle: string;
  providerStyle: string;
  timestampStyle: string;
  isNew: boolean;
  currencySymbol: string;
}) {
  void tick; // used by parent to trigger re-render for relTime
  const accentColor  = isDeposit ? theme.depositColor  : theme.withdrawColor;

  const animClass = isNew ? (
    animationStyle === 'slide_in' ? 'ltx-slide-in' :
    animationStyle === 'fade_in'  ? 'ltx-fade-in'  :
    animationStyle === 'bounce'   ? 'ltx-bounce-in' : ''
  ) : '';

  const providerNode = (() => {
    if (providerStyle === 'text') {
      return (
        <span style={{ color: theme.badgeText, fontSize: 8, fontWeight: 600, fontFamily: 'inherit' }}>
          {row.provider}
        </span>
      );
    }
    if (providerStyle === 'chip') {
      return (
        <span style={{
          color: accentColor, fontSize: 8, fontWeight: 700,
          border: `1px solid ${accentColor}`, borderRadius: 999,
          padding: '0 4px', lineHeight: 1.6, fontFamily: 'inherit',
        }}>
          {row.provider}
        </span>
      );
    }
    // default: badge
    return (
      <span
        className="font-semibold px-1 rounded"
        style={{ background: theme.badgeBg, color: theme.badgeText, fontSize: 8, fontFamily: 'inherit' }}
      >
        {row.provider}
      </span>
    );
  })();

  const tsNode = timestampStyle === 'hidden' ? null : (
    <span style={{ color: theme.timeColor, fontSize: 8, fontFamily: 'inherit' }}>
      {timestampStyle === 'absolute' ? absTime(row.ts) : relTime(row.ts)}
    </span>
  );

  return (
    <div
      className={`rounded-md px-1.5 py-0.5 ${animClass}`}
      style={{ background: theme.rowBg }}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className="truncate"
          style={{ color: theme.phoneColor, fontSize: 10, fontFamily: 'inherit', fontWeight: 600 }}
        >
          {row.phone}
        </span>
        <span
          className="shrink-0"
          style={{ color: accentColor, fontSize: 10, fontWeight: 700, fontFamily: 'inherit' }}
        >
          {currencySymbol}{formatAmount(row.amount, amountStyle)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        {providerNode}
        {tsNode}
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function TxColumn({
  label,
  rows,
  isDeposit,
  tick,
  maxRows,
  theme,
  animationStyle,
  amountStyle,
  providerStyle,
  timestampStyle,
  newIds,
  currencySymbol,
}: {
  label: string;
  rows: TxRow[];
  isDeposit: boolean;
  tick: number;
  maxRows: number;
  theme: TxTheme;
  animationStyle: string;
  amountStyle: string;
  providerStyle: string;
  timestampStyle: string;
  newIds: Set<string>;
  currencySymbol: string;
}) {
  const accentColor = isDeposit ? theme.depositColor : theme.withdrawColor;
  const accentBg    = isDeposit ? theme.depositBg    : theme.withdrawBg;
  const displayed   = rows.slice(0, maxRows);
  const padCount    = Math.max(0, maxRows - displayed.length);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div
        className="text-xs font-bold text-center py-1 rounded-lg mb-1.5"
        style={{ background: accentBg, color: accentColor, letterSpacing: '0.08em', fontFamily: 'inherit' }}
      >
        {label}
      </div>

      <div className="flex flex-col gap-0.5 flex-1">
        {displayed.map((row) => (
          <TxRow
            key={row.id}
            row={row}
            isDeposit={isDeposit}
            tick={tick}
            theme={theme}
            animationStyle={animationStyle}
            amountStyle={amountStyle}
            providerStyle={providerStyle}
            timestampStyle={timestampStyle}
            isNew={newIds.has(row.id)}
            currencySymbol={currencySymbol}
          />
        ))}

        {Array.from({ length: padCount }).map((_, i) => (
          <div
            key={`pad-${i}`}
            className="rounded-md px-1.5 py-0.5"
            style={{ background: theme.rowBg, opacity: 0 }}
            aria-hidden
          >
            <div style={{ fontSize: 10 }}>&nbsp;</div>
            <div style={{ fontSize: 8 }}>&nbsp;</div>
          </div>
        ))}

        {displayed.length === 0 && (
          <div
            className="rounded-lg px-2 py-3 text-center"
            style={{ background: theme.rowBg, color: theme.timeColor, fontSize: 10, fontFamily: 'inherit' }}
          >
            暂无记录
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Live indicator ───────────────────────────────────────────────────────────

function LiveIndicator({ style, color }: { style: string; color: string }) {
  if (style === 'text_only') {
    return <span className="text-xs font-bold" style={{ color, fontFamily: 'inherit' }}>● LIVE</span>;
  }
  if (style === 'ring') {
    return (
      <span className="relative flex items-center justify-center w-3 h-3">
        <span className="absolute w-3 h-3 rounded-full border-2 ltx-ring-pulse" style={{ borderColor: color }} />
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      </span>
    );
  }
  if (style === 'dot') {
    return <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />;
  }
  // pulse_dot (default)
  return (
    <span
      className="w-2 h-2 rounded-full"
      style={{ background: color, boxShadow: `0 0 6px ${color}`, animation: 'pulse 1.5s infinite' }}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  maxRows?:              number;
  theme?:                string;
  customTheme?:          Record<string, string>;
  fontStyle?:            string;
  // Data source
  dataSource?:           'real' | 'smart_mix' | 'auto_generated';
  generationProfile?:    'conservative' | 'normal' | 'high_roller' | 'vip' | 'random' | 'custom_range';
  // Custom range — used when generationProfile === 'custom_range'
  customDepMin?:         number;
  customDepMax?:         number;
  customWthMin?:         number;
  customWthMax?:         number;
  // Independent generation probabilities (0-100, used in auto_generated)
  depositChance?:        number;
  withdrawChance?:       number;
  // Independent timer intervals in seconds (auto_generated)
  depositIntervalMin?:   number;
  depositIntervalMax?:   number;
  withdrawIntervalMin?:  number;
  withdrawIntervalMax?:  number;
  // Provider source config
  providerSource?:       'website_providers' | 'custom_list';
  customProviders?:      string[];
  // Visual options
  activitySpeed?:        'slow' | 'normal' | 'fast';
  animationStyle?:       'none' | 'slide_in' | 'fade_in' | 'bounce';
  amountStyle?:          'full' | 'range' | 'hidden';
  providerStyle?:        'badge' | 'text' | 'chip';
  timestampStyle?:       'relative' | 'absolute' | 'hidden';
  indicatorStyle?:       'dot' | 'pulse_dot' | 'ring' | 'text_only';
}

export default function LiveTransaction({
  maxRows              = 8,
  theme:     themeId   = 'classic_purple',
  customTheme,
  fontStyle            = 'default',
  dataSource           = 'smart_mix',
  generationProfile    = 'normal',
  customDepMin         = 50,
  customDepMax         = 2000,
  customWthMin         = 100,
  customWthMax         = 5000,
  depositChance        = 70,
  withdrawChance       = 25,
  depositIntervalMin   = 6,
  depositIntervalMax   = 12,
  withdrawIntervalMin  = 15,
  withdrawIntervalMax  = 45,
  providerSource       = 'website_providers',
  customProviders      = [],
  activitySpeed        = 'normal',
  animationStyle       = 'fade_in',
  amountStyle          = 'full',
  providerStyle        = 'badge',
  timestampStyle       = 'relative',
  indicatorStyle       = 'pulse_dot',
}: Props) {
  const { symbol: currencySymbol } = useCurrency();
  const theme      = resolveTheme(themeId, customTheme, fontStyle);
  const intervalMs = SPEED_MAP[activitySpeed] ?? 8000;

  const profile   = generationProfile;
  const genOpts: GenRowOpts = profile === 'custom_range'
    ? { depRange: { min: customDepMin, max: customDepMax }, wthRange: { min: customWthMin, max: customWthMax } }
    : {};

  // Resolve which provider list to use; ref keeps it current in timer callbacks
  const providersRef = useRef<string[]>([]);

  // Initial state: empty for auto_generated (server will provide), local gen otherwise
  const [data, setData] = useState<TxData>(() => {
    if (dataSource === 'auto_generated') {
      return { deposits: [], withdrawals: [] };
    }
    // smart_mix/real: generate locally with whatever providers are loaded (may be empty initially)
    const cleanCustom = customProviders.filter(Boolean);
    const initProviders = providerSource === 'custom_list' && cleanCustom.length > 0
      ? cleanCustom
      : _runtimeProviders;
    return {
      deposits:    generateRows(profile, maxRows, true,  initProviders, 0, genOpts),
      withdrawals: generateRows(profile, maxRows, false, initProviders, 0, genOpts),
    };
  });
  const [tick, setTick]             = useState(0);
  const [isLive, setIsLive]         = useState(false);
  const [newDepIds, setNewDepIds]   = useState<Set<string>>(new Set());
  const [newWthIds, setNewWthIds]   = useState<Set<string>>(new Set());
  const prevDataRef                 = useRef<TxData>({ deposits: [], withdrawals: [] });
  const depTimerRef                 = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wthTimerRef                 = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Merge both new-ID sets for the column components
  const newIds = new Set([...newDepIds, ...newWthIds]);

  // ── Async data fetchers ─────────────────────────────────────────────────

  async function fetchReal(): Promise<TxData | null> {
    try {
      const res = await fetch(`/api/public/live-transactions?_=${Date.now()}`, { cache: 'no-store' });
      return await res.json() as TxData;
    } catch { return null; }
  }

  async function fetchAutoStore(): Promise<TxData | null> {
    try {
      const providers = providersRef.current;
      const params = new URLSearchParams({
        max_rows:   String(maxRows),
        dep_chance: String(depositChance),
        wth_chance: String(withdrawChance),
        providers:  providers.join(','),
      });
      const res = await fetch(`/api/public/live-transactions-store?${params}`, { cache: 'no-store' });
      return await res.json() as TxData;
    } catch { return null; }
  }

  // Merge incoming rows into existing state — new rows go to top, no full refresh
  function mergeIncoming(prev: TxData, incoming: TxData): { next: TxData; newDepIds: Set<string>; newWthIds: Set<string> } {
    const prevDepIds = new Set(prev.deposits.map(r => r.id));
    const prevWthIds = new Set(prev.withdrawals.map(r => r.id));

    const newDep = incoming.deposits.filter(r => !prevDepIds.has(r.id));
    const newWth = incoming.withdrawals.filter(r => !prevWthIds.has(r.id));

    const deposits    = [...newDep, ...prev.deposits].slice(0, maxRows);
    const withdrawals = [...newWth, ...prev.withdrawals].slice(0, maxRows);

    return {
      next:       { deposits, withdrawals },
      newDepIds:  new Set(newDep.map(r => r.id)),
      newWthIds:  new Set(newWth.map(r => r.id)),
    };
  }

  // ── Tick functions ──────────────────────────────────────────────────────

  async function tick_real() {
    const json = await fetchReal();
    if (!json) { setTick(n => n + 1); return; }
    const hasReal = json.deposits.length > 0 || json.withdrawals.length > 0;
    if (hasReal) {
      setData(prev => {
        const { next, newDepIds: nd, newWthIds: nw } = mergeIncoming(prev, json);
        if (nd.size > 0) { setNewDepIds(nd); setTimeout(() => setNewDepIds(new Set()), 1400); }
        if (nw.size > 0) { setNewWthIds(nw); setTimeout(() => setNewWthIds(new Set()), 1400); }
        return next;
      });
      setIsLive(true);
    } else {
      setIsLive(false);
    }
    setTick(n => n + 1);
  }

  async function tick_smart_mix() {
    const json    = await fetchReal();
    const real    = json ?? { deposits: [], withdrawals: [] };
    const hasReal = real.deposits.length > 0 || real.withdrawals.length > 0;
    setIsLive(hasReal);

    setData(prev => {
      const providers = providersRef.current;
      // Keep real rows at top; preserve existing fake rows for remaining slots
      const prevFakeDep = prev.deposits.filter(r => !r.id.startsWith('d') || r.id.startsWith('sd'));
      const prevFakeWth = prev.withdrawals.filter(r => !r.id.startsWith('w') || r.id.startsWith('sw'));

      const fillD   = Math.max(0, maxRows - real.deposits.length);
      const fillW   = Math.max(0, maxRows - real.withdrawals.length);
      const fakeDep = prevFakeDep.length >= fillD ? prevFakeDep.slice(0, fillD) : [...prevFakeDep, ...generateRows(profile, fillD - prevFakeDep.length, true,  providers, 0, genOpts)];
      const fakeWth = prevFakeWth.length >= fillW ? prevFakeWth.slice(0, fillW) : [...prevFakeWth, ...generateRows(profile, fillW - prevFakeWth.length, false, providers, 0, genOpts)];

      // Find new real rows for animation
      const prevDepIds = new Set(prev.deposits.map(r => r.id));
      const prevWthIds = new Set(prev.withdrawals.map(r => r.id));
      const nd = new Set(real.deposits.filter(r => !prevDepIds.has(r.id)).map(r => r.id));
      const nw = new Set(real.withdrawals.filter(r => !prevWthIds.has(r.id)).map(r => r.id));
      if (nd.size > 0) { setNewDepIds(nd); setTimeout(() => setNewDepIds(new Set()), 1400); }
      if (nw.size > 0) { setNewWthIds(nw); setTimeout(() => setNewWthIds(new Set()), 1400); }

      return {
        deposits:    [...real.deposits, ...fakeDep].slice(0, maxRows),
        withdrawals: [...real.withdrawals, ...fakeWth].slice(0, maxRows),
      };
    });
    setTick(n => n + 1);
  }

  async function tick_auto() {
    const json = await fetchAutoStore();
    if (!json) return;
    setData(prev => {
      const { next, newDepIds: nd, newWthIds: nw } = mergeIncoming(prev, json);
      if (nd.size > 0) { setNewDepIds(nd); setTimeout(() => setNewDepIds(new Set()), 1400); }
      if (nw.size > 0) { setNewWthIds(nw); setTimeout(() => setNewWthIds(new Set()), 1400); }
      return next;
    });
    setIsLive(true);
    setTick(n => n + 1);
  }

  // ── Independent auto-generation timers (for auto_generated mode) ────────

  function scheduleDeposit() {
    const ms = randInt(depositIntervalMin * 1000, depositIntervalMax * 1000);
    depTimerRef.current = setTimeout(() => {
      void tick_auto();
      scheduleDeposit();
    }, ms);
  }

  function scheduleWithdraw() {
    const ms = randInt(withdrawIntervalMin * 1000, withdrawIntervalMax * 1000);
    wthTimerRef.current = setTimeout(() => {
      void tick_auto();
      scheduleWithdraw();
    }, ms);
  }

  // Keep providers ref current so smart_mix timer callbacks use the right list
  useEffect(() => {
    const cleanCustom = customProviders.filter(Boolean);
    if (providerSource === 'custom_list' && cleanCustom.length > 0) {
      providersRef.current = cleanCustom;
    } else {
      providersRef.current = _runtimeProviders;
    }
  }, [providerSource, customProviders]);

  // Load CMS providers for smart_mix mode (auto_generated uses server-side DB directly)
  useEffect(() => {
    if (dataSource !== 'auto_generated' && providerSource !== 'custom_list') {
      void loadCmsProviders().then(() => {
        providersRef.current = _runtimeProviders;
      });
    }
  }, [dataSource, providerSource]);

  useEffect(() => {
    if (dataSource === 'auto_generated') {
      // Fetch initial server store immediately, then use independent timers
      void tick_auto();
      scheduleDeposit();
      scheduleWithdraw();
      return () => {
        clearTimeout(depTimerRef.current);
        clearTimeout(wthTimerRef.current);
      };
    } else if (dataSource === 'smart_mix') {
      void tick_smart_mix();
      const t = setInterval(() => void tick_smart_mix(), intervalMs);
      return () => clearInterval(t);
    } else {
      void tick_real();
      const t = setInterval(() => void tick_real(), intervalMs);
      return () => clearInterval(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Relative-time refresh
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <style>{`
        @keyframes ltx-slide-in { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes ltx-fade-in  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ltx-bounce-in{ 0%{transform:scale(0.7);opacity:0} 60%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
        @keyframes ltx-ring-pulse{ 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.6);opacity:0} }
        .ltx-slide-in  { animation: ltx-slide-in  0.4s ease forwards; }
        .ltx-fade-in   { animation: ltx-fade-in   0.5s ease forwards; }
        .ltx-bounce-in { animation: ltx-bounce-in 0.5s ease forwards; }
        .ltx-ring-pulse{ animation: ltx-ring-pulse 1.2s ease-in-out infinite; }
      `}</style>

      <section style={{ fontFamily: theme.fontFamily }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-sm font-bold" style={{ color: theme.phoneColor, letterSpacing: '0.04em', fontFamily: 'inherit' }}>
            LIVE TRANSACTION
          </h2>
          <div className="flex items-center gap-1.5">
            <LiveIndicator style={indicatorStyle} color={theme.liveDot} />
            {indicatorStyle !== 'text_only' && (
              <span className="text-xs font-bold" style={{ color: theme.liveText, fontFamily: 'inherit' }}>LIVE</span>
            )}
            {!isLive && dataSource !== 'auto_generated' && (
              <span
                className="text-[10px] ml-1 px-1.5 py-0.5 rounded"
                style={{ background: theme.rowBg, color: theme.timeColor, fontFamily: 'inherit' }}
              >
                演示
              </span>
            )}
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-xl p-2.5"
          style={{
            background: theme.cardBg,
            border:     `1px solid ${theme.cardBorder}`,
            boxShadow:  theme.cardGlow,
          }}
        >
          <div className="flex gap-2.5">
            <TxColumn
              label="TOP UP"
              rows={data.deposits}
              isDeposit={true}
              tick={tick}
              maxRows={maxRows}
              theme={theme}
              animationStyle={animationStyle}
              amountStyle={amountStyle}
              providerStyle={providerStyle}
              timestampStyle={timestampStyle}
              newIds={newIds}
              currencySymbol={currencySymbol}
            />

            <div className="w-px self-stretch" style={{ background: theme.divider }} />

            <TxColumn
              label="WITHDRAW"
              rows={data.withdrawals}
              isDeposit={false}
              tick={tick}
              maxRows={maxRows}
              theme={theme}
              animationStyle={animationStyle}
              amountStyle={amountStyle}
              providerStyle={providerStyle}
              timestampStyle={timestampStyle}
              newIds={newIds}
              currencySymbol={currencySymbol}
            />
          </div>
        </div>
      </section>
    </>
  );
}
