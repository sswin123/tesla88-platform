'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CustomSizeSpec {
  width:       string;
  width_unit:  'px' | '%' | 'vw';
  height:      string;
  height_unit: 'px' | 'rem' | 'vh' | 'auto';
  max_width?:  string;
  min_height?: string;
  pad_top:     string;
  pad_right:   string;
  pad_bottom:  string;
  pad_left:    string;
  radius:      string;
}

export interface JackpotCustomSize {
  desktop:  CustomSizeSpec;
  tablet?:  Partial<CustomSizeSpec>;
  mobile?:  Partial<CustomSizeSpec>;
}

export interface JackpotCounterDef {
  id:                   string;
  title:                string;
  prefix:               string;
  data_source:          'realtime' | 'manual' | 'local' | 'random';
  initial_value:        number;
  manual_value:         number;
  increment_per_second: number;
  decimal_places:       0 | 2 | 3;
  sync_interval:        1 | 3 | 5 | 10;
  style_preset:         string;
  number_effect:        string;
  animation:            string;
  size:                 string;
  custom_size?:         JackpotCustomSize;
  icon:                 string;
  icon_media_id:        number | null;
  title_color:          string;
  number_color:         string;
  currency_color:       string;
  glow_color:           string;
  bg_type:              string;
  bg_color:             string;
  bg_gradient:          string;
  border_style:         string;
  border_color:         string;
  border_radius:        string;
  font_style:           string;
}

export interface JackpotSectionConfig {
  mode?:     'single' | 'multiple';
  counters?: JackpotCounterDef[];
  layout?:   'horizontal' | 'vertical' | 'grid';
  // Legacy single-counter fields (backwards compatibility)
  title?:                string;
  prefix?:               string;
  value?:                number;
  increment_per_second?: number;
  text_color?:           string;
  bg_color?:             string;
}

// ── Style Presets ─────────────────────────────────────────────────────────────

interface PresetStyle {
  bg:             string;
  numberColor:    string;
  titleColor:     string;
  currencyColor:  string;
  border:         string;
  boxShadow:      string;
  textShadow?:    string;
}

const PRESETS: Record<string, PresetStyle> = {
  classic_gold: {
    bg:            'linear-gradient(135deg, #0d0800 0%, #1f1000 50%, #0d0800 100%)',
    numberColor:   '#f59e0b',
    titleColor:    '#fbbf24',
    currencyColor: '#d97706',
    border:        '1px solid rgba(245,158,11,0.45)',
    boxShadow:     '0 0 30px rgba(245,158,11,0.2), inset 0 0 30px rgba(245,158,11,0.04)',
    textShadow:    '0 0 20px rgba(245,158,11,0.6)',
  },
  luxury_gold: {
    bg:            'linear-gradient(160deg, #0a0500 0%, #201000 40%, #100800 100%)',
    numberColor:   '#fcd34d',
    titleColor:    '#fef08a',
    currencyColor: '#f59e0b',
    border:        '2px solid #b45309',
    boxShadow:     '0 0 50px rgba(252,211,77,0.18)',
    textShadow:    '0 0 25px rgba(252,211,77,0.55)',
  },
  casino_vip: {
    bg:            'linear-gradient(135deg, #0a0014 0%, #15002a 50%, #0a0014 100%)',
    numberColor:   '#c084fc',
    titleColor:    '#e9d5ff',
    currencyColor: '#a855f7',
    border:        '1px solid rgba(168,85,247,0.5)',
    boxShadow:     '0 0 35px rgba(168,85,247,0.25)',
    textShadow:    '0 0 20px rgba(168,85,247,0.7)',
  },
  cyber_neon: {
    bg:            'linear-gradient(135deg, #001a0a 0%, #002714 50%, #001a0a 100%)',
    numberColor:   '#22c55e',
    titleColor:    '#86efac',
    currencyColor: '#16a34a',
    border:        '1px solid rgba(34,197,94,0.5)',
    boxShadow:     '0 0 30px rgba(34,197,94,0.3)',
    textShadow:    '0 0 18px rgba(34,197,94,0.8)',
  },
  cyber_blue: {
    bg:            'linear-gradient(135deg, #00030d 0%, #000c1f 50%, #00030d 100%)',
    numberColor:   '#38bdf8',
    titleColor:    '#7dd3fc',
    currencyColor: '#0284c7',
    border:        '1px solid rgba(56,189,248,0.4)',
    boxShadow:     '0 0 30px rgba(56,189,248,0.25)',
    textShadow:    '0 0 18px rgba(56,189,248,0.7)',
  },
  glass: {
    bg:            'rgba(255,255,255,0.07)',
    numberColor:   'rgba(255,255,255,0.95)',
    titleColor:    'rgba(255,255,255,0.65)',
    currencyColor: 'rgba(255,255,255,0.55)',
    border:        '1px solid rgba(255,255,255,0.15)',
    boxShadow:     '0 8px 32px rgba(0,0,0,0.4)',
  },
  titanium: {
    bg:            'linear-gradient(160deg, #18182f 0%, #22223a 50%, #18182f 100%)',
    numberColor:   '#e2e8f0',
    titleColor:    '#94a3b8',
    currencyColor: '#64748b',
    border:        '1px solid rgba(148,163,184,0.2)',
    boxShadow:     '0 0 20px rgba(148,163,184,0.1)',
  },
  diamond: {
    bg:            'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 50%, #e0f2fe 100%)',
    numberColor:   '#0c4a6e',
    titleColor:    '#0369a1',
    currencyColor: '#0284c7',
    border:        '1px solid rgba(14,165,233,0.35)',
    boxShadow:     '0 0 30px rgba(14,165,233,0.2)',
  },
  ruby: {
    bg:            'linear-gradient(135deg, #0a0000 0%, #1c0000 50%, #0a0000 100%)',
    numberColor:   '#f87171',
    titleColor:    '#fca5a5',
    currencyColor: '#dc2626',
    border:        '1px solid rgba(248,113,113,0.4)',
    boxShadow:     '0 0 30px rgba(248,113,113,0.25)',
    textShadow:    '0 0 18px rgba(248,113,113,0.65)',
  },
  emerald: {
    bg:            'linear-gradient(135deg, #000a04 0%, #001c0a 50%, #000a04 100%)',
    numberColor:   '#34d399',
    titleColor:    '#6ee7b7',
    currencyColor: '#10b981',
    border:        '1px solid rgba(52,211,153,0.4)',
    boxShadow:     '0 0 30px rgba(52,211,153,0.25)',
    textShadow:    '0 0 18px rgba(52,211,153,0.7)',
  },
  ocean: {
    bg:            'linear-gradient(160deg, #0c1445 0%, #0a1830 50%, #0c1445 100%)',
    numberColor:   '#67e8f9',
    titleColor:    '#a5f3fc',
    currencyColor: '#06b6d4',
    border:        '1px solid rgba(103,232,249,0.3)',
    boxShadow:     '0 0 30px rgba(103,232,249,0.2)',
    textShadow:    '0 0 18px rgba(103,232,249,0.65)',
  },
  galaxy: {
    bg:            'linear-gradient(135deg, #050010 0%, #0d0025 50%, #050010 100%)',
    numberColor:   '#c4b5fd',
    titleColor:    '#ddd6fe',
    currencyColor: '#8b5cf6',
    border:        '1px solid rgba(196,181,253,0.3)',
    boxShadow:     '0 0 40px rgba(139,92,246,0.25)',
    textShadow:    '0 0 20px rgba(196,181,253,0.6)',
  },
  matrix: {
    bg:            '#001100',
    numberColor:   '#00ff41',
    titleColor:    '#00aa2a',
    currencyColor: '#008822',
    border:        '1px solid rgba(0,255,65,0.3)',
    boxShadow:     '0 0 20px rgba(0,255,65,0.35)',
    textShadow:    '0 0 12px rgba(0,255,65,0.9)',
  },
  led_display: {
    bg:            '#0a0a0a',
    numberColor:   '#ff6b00',
    titleColor:    '#ff4500',
    currencyColor: '#cc3300',
    border:        '1px solid rgba(255,107,0,0.3)',
    boxShadow:     '0 0 15px rgba(255,107,0,0.45)',
    textShadow:    '0 0 10px rgba(255,107,0,0.9)',
  },
  digital_clock: {
    bg:            'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)',
    numberColor:   '#00ff9f',
    titleColor:    '#00cc7a',
    currencyColor: '#009955',
    border:        '1px solid rgba(0,255,159,0.25)',
    boxShadow:     '0 0 12px rgba(0,255,159,0.3)',
    textShadow:    '0 0 10px rgba(0,255,159,0.85)',
  },
  minimal: {
    bg:            'transparent',
    numberColor:   'var(--text-base, #ffffff)',
    titleColor:    'var(--text-muted, rgba(255,255,255,0.6))',
    currencyColor: 'var(--text-muted, rgba(255,255,255,0.5))',
    border:        '1px solid var(--border-dim, rgba(255,255,255,0.1))',
    boxShadow:     'none',
  },
  luxury_black: {
    bg:            'linear-gradient(135deg, #050505 0%, #111111 50%, #050505 100%)',
    numberColor:   '#ffd700',
    titleColor:    '#b8860b',
    currencyColor: '#daa520',
    border:        '1px solid #8b6914',
    boxShadow:     '0 0 20px rgba(255,215,0,0.12)',
    textShadow:    '0 0 15px rgba(255,215,0,0.5)',
  },
  future_ai: {
    bg:            'linear-gradient(135deg, #0a001f 0%, #100030 50%, #0a001f 100%)',
    numberColor:   '#00e5ff',
    titleColor:    '#80deea',
    currencyColor: '#0097a7',
    border:        '1px solid rgba(0,229,255,0.4)',
    boxShadow:     '0 0 40px rgba(0,229,255,0.2)',
    textShadow:    '0 0 20px rgba(0,229,255,0.8)',
  },
};

// ── Font Styles ────────────────────────────────────────────────────────────────

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900' +
  '&family=Rajdhani:wght@400;600;700&family=Audiowide&family=Share+Tech+Mono' +
  '&family=VT323&display=swap';

let googleFontsInjected = false;
function injectGoogleFonts() {
  if (googleFontsInjected || typeof document === 'undefined') return;
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = GOOGLE_FONTS_URL;
  document.head.appendChild(link);
  googleFontsInjected = true;
}

const FONTS: Record<string, string> = {
  classic:    'inherit',
  digital:    '"VT323", "Courier New", monospace',
  led:        '"Share Tech Mono", "Courier New", monospace',
  luxury:     'Georgia, "Times New Roman", serif',
  casino:     'Impact, "Arial Black", sans-serif',
  cyber:      '"Orbitron", "Courier New", sans-serif',
  matrix:     '"VT323", "Courier New", monospace',
  orbitron:   '"Orbitron", "Courier New", sans-serif',
  rajdhani:   '"Rajdhani", sans-serif',
  audiowide:  '"Audiowide", sans-serif',
  share_tech: '"Share Tech Mono", monospace',
};

// ── Size Mappings ──────────────────────────────────────────────────────────────

const SIZES: Record<string, { title: string; number: string; currency: string; padding: string }> = {
  small:  { title: '10px', number: '1.6rem',  currency: '1.1rem', padding: '0.6rem 1rem'  },
  medium: { title: '11px', number: '2.2rem',  currency: '1.5rem', padding: '0.8rem 1.2rem' },
  large:  { title: '13px', number: '3rem',    currency: '2rem',   padding: '1rem 1.5rem'   },
  hero:   { title: '14px', number: '4rem',    currency: '2.6rem', padding: '1.2rem 2rem'   },
  custom: { title: '12px', number: '2.5rem',  currency: '1.8rem', padding: '0.9rem 1.3rem' },
};

// ── Animation CSS ──────────────────────────────────────────────────────────────

const ANIM_CSS: Record<string, string> = {
  none:       '',
  glow:       'jackpot-anim-glow',
  pulse:      'jackpot-anim-pulse',
  breathing:  'jackpot-anim-breathing',
  sparkle:    'jackpot-anim-sparkle',
  gold_shine: 'jackpot-anim-shine',
  rainbow:    'jackpot-anim-rainbow',
  floating:   'jackpot-anim-floating',
};

// ── Inline keyframe injection (client only) ───────────────────────────────────

const KEYFRAMES = `
@keyframes jackpot-glow      { 0%,100%{filter:brightness(1) drop-shadow(0 0 0px transparent);}  50%{filter:brightness(1.5) drop-shadow(0 0 12px currentColor);} }
@keyframes jackpot-pulse     { 0%,100%{transform:scale(1);}           50%{transform:scale(1.07);} }
@keyframes jackpot-breathing { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.65;transform:scale(0.98);} }
@keyframes jackpot-sparkle   { 0%,100%{filter:brightness(1);}         25%{filter:brightness(1.7) drop-shadow(0 0 8px gold) saturate(1.5);} 75%{filter:brightness(1.25);} }
@keyframes jackpot-shine     { 0%{filter:hue-rotate(0deg) brightness(1);}   100%{filter:hue-rotate(30deg) brightness(1.3);} }
@keyframes jackpot-rainbow   { 0%{filter:hue-rotate(0deg);}           100%{filter:hue-rotate(360deg);} }
@keyframes jackpot-floating  { 0%,100%{transform:translateY(0) scale(1);}  40%{transform:translateY(-10px) scale(1.02);}  80%{transform:translateY(-4px) scale(1.01);} }
.jackpot-anim-glow      { animation: jackpot-glow      2s ease-in-out infinite; will-change: filter; }
.jackpot-anim-pulse     { animation: jackpot-pulse     1.8s ease-in-out infinite; will-change: transform; }
.jackpot-anim-breathing { animation: jackpot-breathing 3s ease-in-out infinite; will-change: opacity, transform; }
.jackpot-anim-sparkle   { animation: jackpot-sparkle   1.5s ease-in-out infinite; will-change: filter; }
.jackpot-anim-shine     { animation: jackpot-shine     3s linear infinite alternate; will-change: filter; }
.jackpot-anim-rainbow   { animation: jackpot-rainbow   4s linear infinite; will-change: filter; }
.jackpot-anim-floating  { animation: jackpot-floating  3s ease-in-out infinite; will-change: transform; }
@keyframes jp-rolling  { 0%,100%{transform:translateY(0) scaleY(1);}     30%{transform:translateY(-10px) scaleY(0.9);} 70%{transform:translateY(10px) scaleY(0.9);} }
@keyframes jp-slot     { 0%,100%{opacity:1;transform:scaleY(1);}          25%{opacity:0.25;transform:scaleY(0.5);} 60%{opacity:0.75;transform:scaleY(0.85);} }
@keyframes jp-flip     { 0%,75%,100%{transform:perspective(400px) rotateX(0deg);opacity:1;} 82%{transform:perspective(400px) rotateX(90deg);opacity:0.1;} 88%{transform:perspective(400px) rotateX(-90deg);opacity:0.1;} }
@keyframes jp-odometer { 0%,100%{transform:translateY(0);filter:blur(0);}  18%{transform:translateY(-18px);filter:blur(3px);}  42%{transform:translateY(0);filter:blur(0);} }
.jp-effect-rolling  { animation: jp-rolling  2.5s ease-in-out infinite; display:inline-block; }
.jp-effect-slot     { animation: jp-slot     0.45s ease-in-out infinite; display:inline-block; }
.jp-effect-flip     { animation: jp-flip     4.5s ease-in-out infinite; display:inline-block; }
.jp-effect-odometer { animation: jp-odometer 2.8s ease-in-out infinite; display:inline-block; overflow:hidden; }
`;

let keyframesInjected = false;
function injectKeyframes() {
  if (keyframesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  keyframesInjected = true;
}

// ── useJackpotValue hook ───────────────────────────────────────────────────────

function useJackpotValue(def: JackpotCounterDef): number {
  const [value, setValue] = useState<number>(def.data_source === 'manual' ? def.manual_value : def.initial_value);
  const baseRef  = useRef<{ value: number; ts: number }>({ value: def.initial_value, ts: Date.now() / 1000 });
  const rateRef  = useRef<number>(def.increment_per_second);

  // Sync rate ref when config changes
  useEffect(() => { rateRef.current = def.increment_per_second; }, [def.increment_per_second]);

  const syncFromServer = useCallback(async () => {
    try {
      const url = `/api/public/jackpot?id=${encodeURIComponent(def.id)}&initial=${def.initial_value}&rate=${def.increment_per_second}`;
      const r   = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json() as { value: number; synced_at: number };
      baseRef.current = { value: data.value, ts: Date.now() / 1000 };
    } catch { /* keep current */ }
  }, [def.id, def.initial_value, def.increment_per_second]);

  useEffect(() => {
    if (def.data_source === 'manual') {
      setValue(def.manual_value ?? def.initial_value);
      return;
    }

    if (def.data_source === 'random') {
      const base = def.initial_value;
      const tick = setInterval(() => {
        setValue(base * (1 + Math.random() * 0.0008));
      }, 120);
      return () => clearInterval(tick);
    }

    if (def.data_source === 'realtime') {
      // Initial server sync + polling
      syncFromServer();
      const pollMs = (def.sync_interval ?? 3) * 1000;
      const poller = setInterval(syncFromServer, pollMs);

      // Fast local tick (between server syncs)
      const ticker = setInterval(() => {
        const elapsed = Date.now() / 1000 - baseRef.current.ts;
        setValue(baseRef.current.value + elapsed * rateRef.current);
      }, 50);

      return () => { clearInterval(poller); clearInterval(ticker); };
    }

    // 'local': count from initial_value, no server sync
    baseRef.current = { value: def.initial_value, ts: Date.now() / 1000 };
    const ticker = setInterval(() => {
      const elapsed = Date.now() / 1000 - baseRef.current.ts;
      setValue(def.initial_value + elapsed * rateRef.current);
    }, 100);
    return () => clearInterval(ticker);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.data_source, def.id, def.initial_value, def.sync_interval]);

  return value;
}

// ── Number Effect Rendering ────────────────────────────────────────────────────

const LED_DIGIT: React.CSSProperties = {
  display: 'inline-block', padding: '0.08em 0.28em', margin: '0 1px',
  background: 'rgba(0,0,0,0.7)', borderRadius: '3px',
  border: '1px solid rgba(255,255,255,0.07)',
  boxShadow: 'inset 0 0 8px rgba(0,0,0,0.9)',
  minWidth: '0.62em', textAlign: 'center' as const,
  lineHeight: 1.1,
};

const MECH_DIGIT: React.CSSProperties = {
  display: 'inline-block', padding: '0.1em 0.32em', margin: '0 1.5px',
  background: 'linear-gradient(180deg,rgba(70,70,70,0.92) 0%,rgba(18,18,18,0.96) 100%)',
  borderRadius: '5px',
  border: '1px solid rgba(110,110,110,0.45)',
  boxShadow: '0 3px 6px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.13)',
  minWidth: '0.62em', textAlign: 'center' as const,
  lineHeight: 1.1,
};

function StyledNumber({ formatted, effect, numColor, tShadow, fontSize }: {
  formatted: string;
  effect:    string;
  numColor:  string;
  tShadow:   string;
  fontSize:  string;
}) {
  if (effect === 'led' || effect === 'mechanical') {
    const dStyle = effect === 'led' ? LED_DIGIT : MECH_DIGIT;
    return (
      <span
        className="font-black"
        style={{ display: 'inline-flex', alignItems: 'center', fontSize, color: numColor, textShadow: tShadow }}
      >
        {formatted.split('').map((ch, i) =>
          /\d/.test(ch)
            ? <span key={i} style={dStyle}>{ch}</span>
            : <span key={i} style={{ opacity: 0.55, padding: '0 2px', fontSize: '0.7em', lineHeight: 1 }}>{ch}</span>
        )}
      </span>
    );
  }

  const effectClass = ['rolling', 'slot', 'flip', 'odometer'].includes(effect)
    ? `jp-effect-${effect}`
    : '';

  return (
    <span
      className={`font-black tracking-tight tabular-nums ${effectClass}`}
      style={{ fontSize, color: numColor, textShadow: tShadow, display: 'inline-block' }}
      suppressHydrationWarning
    >
      {formatted}
    </span>
  );
}

// ── Single JackpotCounter ──────────────────────────────────────────────────────

// ── Custom Size Helpers ────────────────────────────────────────────────────────

function buildCustomSizeCss(spec: CustomSizeSpec): React.CSSProperties {
  const hUnit = spec.height_unit;
  const css: React.CSSProperties = {
    width:        `${spec.width}${spec.width_unit}`,
    padding:      `${spec.pad_top}px ${spec.pad_right}px ${spec.pad_bottom}px ${spec.pad_left}px`,
    borderRadius: `${spec.radius}px`,
  };
  if (hUnit !== 'auto') {
    css.height = `${spec.height}${hUnit}`;
  }
  if (spec.max_width)  css.maxWidth  = `${spec.max_width}px`;
  if (spec.min_height) css.minHeight = `${spec.min_height}px`;
  return css;
}

function JackpotCounter({ def }: { def: JackpotCounterDef }) {
  const value   = useJackpotValue(def);
  const rolling = useRef(false);
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  useEffect(() => { injectKeyframes(); injectGoogleFonts(); }, []);

  useEffect(() => {
    if (def.size !== 'custom') return;
    const update = () => {
      const w = window.innerWidth;
      setViewport(w <= 480 ? 'mobile' : w <= 1024 ? 'tablet' : 'desktop');
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [def.size]);

  const preset   = PRESETS[def.style_preset] ?? PRESETS.classic_gold;
  const sizeMap  = SIZES[def.size] ?? SIZES.medium;
  const fontFam  = FONTS[def.font_style] ?? 'inherit';

  // Compute custom size CSS when size === 'custom'
  const customSizeCss = (() => {
    if (def.size !== 'custom' || !def.custom_size) return null;
    const { desktop, tablet, mobile } = def.custom_size;
    const base = desktop;
    const override = viewport === 'mobile' && mobile ? { ...base, ...mobile }
                   : viewport === 'tablet' && tablet ? { ...base, ...tablet }
                   : base;
    return buildCustomSizeCss(override as CustomSizeSpec);
  })();

  // Resolve colors — user overrides > preset > default
  const numColor  = def.number_color   || preset.numberColor;
  const ttlColor  = def.title_color    || preset.titleColor;
  const curColor  = def.currency_color || preset.currencyColor;
  const glowColor = def.glow_color     || numColor;
  const bdColor   = def.border_color   || '';

  // Background
  let bgStyle: string;
  if (def.bg_type === 'gradient' && def.bg_gradient) {
    bgStyle = def.bg_gradient;
  } else if (def.bg_type === 'solid' && def.bg_color) {
    bgStyle = def.bg_color;
  } else if (def.bg_type === 'glass') {
    bgStyle = 'rgba(255,255,255,0.07)';
  } else if (def.bg_type === 'transparent') {
    bgStyle = 'transparent';
  } else {
    bgStyle = preset.bg;
  }

  // Border
  let borderStyle: string;
  switch (def.border_style) {
    case 'none':    borderStyle = 'none'; break;
    case 'outline': borderStyle = `1px solid ${bdColor || 'rgba(255,255,255,0.15)'}`; break;
    case 'double':  borderStyle = `3px double ${bdColor || numColor}`; break;
    case 'gold':    borderStyle = `1px solid ${bdColor || '#d97706'}`; break;
    case 'neon':    borderStyle = `1px solid ${bdColor || glowColor}`; break;
    default:        borderStyle = preset.border;
  }

  // Glow / box-shadow
  const shadowVal = def.border_style === 'neon'
    ? `0 0 20px ${glowColor}55, 0 0 40px ${glowColor}22`
    : preset.boxShadow;

  // Number format
  const dp  = def.decimal_places ?? 2;
  const fmt = value.toLocaleString('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp });

  // Text shadow for the number
  const tShadow = preset.textShadow ?? `0 0 18px color-mix(in srgb, ${numColor} 50%, transparent)`;

  // Animation class applied to the whole card
  const animClass = ANIM_CSS[def.animation] ?? '';

  const borderRadiusVal = customSizeCss?.borderRadius ?? def.border_radius ?? '16px';

  // Outer wrapper handles animation (transform/filter) without overflow constraints
  // Inner div handles overflow-hidden for rounded corner clipping
  return (
    <div
      className={`jackpot-counter text-center select-none ${animClass}`}
      style={{
        fontFamily: fontFam,
        ...(customSizeCss ? {
          width:     customSizeCss.width,
          height:    customSizeCss.height,
          maxWidth:  customSizeCss.maxWidth,
          minHeight: customSizeCss.minHeight,
        } : {}),
      }}
    >
      <div
        className="relative overflow-hidden h-full"
        style={{
          background:   bgStyle,
          border:       borderStyle,
          boxShadow:    shadowVal,
          borderRadius: borderRadiusVal,
          padding:      customSizeCss?.padding ?? sizeMap.padding,
        }}
      >
        {/* Background blur overlay for glass preset */}
        {(def.style_preset === 'glass' || def.bg_type === 'glass') && (
          <div className="absolute inset-0 backdrop-blur-sm" style={{ borderRadius: borderRadiusVal, zIndex: 0 }} />
        )}

        <div className="relative" style={{ zIndex: 1 }}>
          {/* Icon */}
          {def.icon && (
            <div className="mb-1" style={{ fontSize: sizeMap.title, lineHeight: 1.2 }}>
              {def.icon_media_id
                ? <img src={`/api/public/media/${def.icon_media_id}`} alt="" className="h-6 w-auto mx-auto" />
                : <span role="img">{def.icon}</span>
              }
            </div>
          )}

          {/* Title */}
          <p
            className="font-semibold tracking-widest uppercase mb-1.5"
            style={{ fontSize: sizeMap.title, color: ttlColor, letterSpacing: '0.12em' }}
          >
            {def.title || '今日奖池'}
          </p>

          {/* Number */}
          <div className="flex items-baseline justify-center gap-1">
            <span
              className="font-black"
              style={{ fontSize: sizeMap.currency, color: curColor, textShadow: tShadow }}
            >
              {def.prefix || 'RM'}
            </span>
            <StyledNumber
              formatted={fmt}
              effect={def.number_effect || 'smooth'}
              numColor={numColor}
              tShadow={tShadow}
              fontSize={sizeMap.number}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Default counter (for legacy / first-time config) ──────────────────────────

function legacyToConfig(cfg: JackpotSectionConfig): JackpotCounterDef {
  return {
    id:                   'legacy',
    title:                cfg.title ?? '今日奖池',
    prefix:               cfg.prefix ?? 'RM',
    data_source:          'local',
    initial_value:        cfg.value ?? 1_000_000,
    manual_value:         cfg.value ?? 1_000_000,
    increment_per_second: cfg.increment_per_second ?? 3.5,
    decimal_places:       2,
    sync_interval:        3,
    style_preset:         'classic_gold',
    number_effect:        'smooth',
    animation:            'glow',
    size:                 'medium',
    custom_size:          undefined,
    icon:                 '💰',
    icon_media_id:        null,
    title_color:          cfg.text_color || '',
    number_color:         cfg.text_color || '',
    currency_color:       '',
    glow_color:           '',
    bg_type:              cfg.bg_color ? 'solid' : '',
    bg_color:             cfg.bg_color || '',
    bg_gradient:          '',
    border_style:         '',
    border_color:         '',
    border_radius:        '16px',
    font_style:           'classic',
  };
}

// ── Main JackpotSection component ─────────────────────────────────────────────

export default function JackpotSection({ config }: { config: JackpotSectionConfig }) {
  // Normalise: if new multi-counter format not present, derive from legacy fields
  const counters: JackpotCounterDef[] =
    config.counters && config.counters.length > 0
      ? config.counters
      : [legacyToConfig(config)];

  const layout = config.layout ?? 'vertical';
  const isSingle = counters.length === 1;

  const gridClass = isSingle
    ? ''
    : layout === 'horizontal'
      ? 'flex flex-wrap gap-3'
      : layout === 'grid'
        ? 'grid grid-cols-2 gap-3'
        : 'flex flex-col gap-3';

  return (
    <section className={gridClass}>
      {counters.map(c => (
        <div key={c.id} className={isSingle ? 'w-full' : layout === 'horizontal' ? 'flex-1 min-w-[200px]' : ''}>
          <JackpotCounter def={c} />
        </div>
      ))}
    </section>
  );
}
