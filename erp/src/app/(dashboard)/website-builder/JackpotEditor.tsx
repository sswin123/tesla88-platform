'use client';

import { useState, useEffect } from 'react';
import { isBrowser } from '@/lib/is-browser';
import { NumericInput } from '@/components/ui/NumericInput';

// ── ERP-local keyframe injection ───────────────────────────────────────────────

const ERP_KEYFRAMES = `
@keyframes jackpot-glow      { 0%,100%{filter:brightness(1);}         50%{filter:brightness(1.4);} }
@keyframes jackpot-pulse     { 0%,100%{transform:scale(1);}           50%{transform:scale(1.05);} }
@keyframes jackpot-breathing { 0%,100%{opacity:1;}                    50%{opacity:0.7;} }
@keyframes jackpot-sparkle   { 0%,100%{filter:brightness(1);}         30%{filter:brightness(1.6) drop-shadow(0 0 6px gold);} }
@keyframes jackpot-shine     { 0%{filter:hue-rotate(0deg)brightness(1);} 100%{filter:hue-rotate(30deg)brightness(1.25);} }
@keyframes jackpot-rainbow   { 0%{filter:hue-rotate(0deg);}           100%{filter:hue-rotate(360deg);} }
@keyframes jackpot-floating  { 0%,100%{transform:translateY(0);}      50%{transform:translateY(-6px);} }
@keyframes jp-rolling   { 0%,100%{transform:translateY(0) scaleY(1);} 30%{transform:translateY(-7px) scaleY(0.94);} 70%{transform:translateY(7px) scaleY(0.94);} }
@keyframes jp-slot      { 0%,100%{opacity:1;transform:scaleY(1);}     25%{opacity:0.35;transform:scaleY(0.65);} 65%{opacity:0.8;transform:scaleY(0.9);} }
@keyframes jp-flip      { 0%,78%,100%{transform:rotateX(0deg);opacity:1;} 83%{transform:rotateX(90deg);opacity:0.2;} 88%{transform:rotateX(-90deg);opacity:0.2;} }
@keyframes jp-odometer  { 0%,100%{transform:translateY(0);filter:blur(0);} 18%{transform:translateY(-14px);filter:blur(2px);} 42%{transform:translateY(0);filter:blur(0);} }
.jp-erp-glow      { animation: jackpot-glow      2s ease-in-out infinite; }
.jp-erp-pulse     { animation: jackpot-pulse     1.8s ease-in-out infinite; }
.jp-erp-breathing { animation: jackpot-breathing 3s ease-in-out infinite; }
.jp-erp-sparkle   { animation: jackpot-sparkle   1.5s ease-in-out infinite; }
.jp-erp-shine     { animation: jackpot-shine     3s linear infinite alternate; }
.jp-erp-rainbow   { animation: jackpot-rainbow   4s linear infinite; }
.jp-erp-floating  { animation: jackpot-floating  3s ease-in-out infinite; }
.jp-erp-rolling   { animation: jp-rolling        2.8s ease-in-out infinite; display:inline-block; }
.jp-erp-slot      { animation: jp-slot           0.38s ease-in-out infinite; display:inline-block; }
.jp-erp-flip      { animation: jp-flip           5s ease-in-out infinite; display:inline-block; perspective:600px; }
.jp-erp-odometer  { animation: jp-odometer       3s ease-in-out infinite; display:inline-block; overflow:hidden; }
`;

const ANIM_TO_CLASS: Record<string, string> = {
  glow: 'jp-erp-glow', pulse: 'jp-erp-pulse', breathing: 'jp-erp-breathing',
  sparkle: 'jp-erp-sparkle', gold_shine: 'jp-erp-shine', rainbow: 'jp-erp-rainbow',
  floating: 'jp-erp-floating',
};

const EFFECT_TO_CLASS: Record<string, string> = {
  rolling: 'jp-erp-rolling', slot: 'jp-erp-slot',
  flip: 'jp-erp-flip', odometer: 'jp-erp-odometer',
};

let erpKfInjected = false;
function injectErpKeyframes() {
  if (erpKfInjected || !isBrowser) return;
  const s = document.createElement('style');
  s.textContent = ERP_KEYFRAMES;
  document.head.appendChild(s);
  erpKfInjected = true;
}

// ── Types (mirrored from website JackpotSection.tsx) ──────────────────────────

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
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STYLE_PRESETS = [
  { value: 'classic_gold',  label: '🥇 Classic Gold' },
  { value: 'luxury_gold',   label: '✨ Luxury Gold' },
  { value: 'casino_vip',    label: '🎰 Casino VIP' },
  { value: 'cyber_neon',    label: '💚 Cyber Neon' },
  { value: 'cyber_blue',    label: '💙 Cyber Blue' },
  { value: 'glass',         label: '🔲 Glass' },
  { value: 'titanium',      label: '⚙️ Titanium' },
  { value: 'diamond',       label: '💎 Diamond' },
  { value: 'ruby',          label: '🔴 Ruby' },
  { value: 'emerald',       label: '💚 Emerald' },
  { value: 'ocean',         label: '🌊 Ocean' },
  { value: 'galaxy',        label: '🌌 Galaxy' },
  { value: 'matrix',        label: '🟩 Matrix' },
  { value: 'led_display',   label: '🔶 LED Display' },
  { value: 'digital_clock', label: '🟢 Digital Clock' },
  { value: 'minimal',       label: '◻️ Minimal' },
  { value: 'luxury_black',  label: '⬛ Luxury Black' },
  { value: 'future_ai',     label: '🤖 Future AI' },
];

const DATA_SOURCES = [
  { value: 'realtime', label: '🔄 Real Time (服务端同步)' },
  { value: 'manual',   label: '✏️ Manual Fixed (固定数值)' },
  { value: 'local',    label: '⏱ Local Animation (本地计时)' },
  { value: 'random',   label: '🎲 Random Simulation (随机模拟)' },
];

const NUMBER_EFFECTS = [
  { value: 'smooth',     label: '流畅计数 Smooth Count' },
  { value: 'rolling',    label: '滚动数字 Rolling Number' },
  { value: 'mechanical', label: '机械计数 Mechanical Counter' },
  { value: 'slot',       label: '老虎机 Slot Machine' },
  { value: 'flip',       label: '翻牌 Flip Clock' },
  { value: 'led',        label: 'LED 计数器' },
  { value: 'odometer',   label: '里程表 Odometer' },
];

const ANIMATIONS = [
  { value: 'none',       label: '无' },
  { value: 'glow',       label: '光晕 Glow' },
  { value: 'pulse',      label: '脉冲 Pulse' },
  { value: 'breathing',  label: '呼吸 Breathing' },
  { value: 'sparkle',    label: '闪烁 Sparkle' },
  { value: 'gold_shine', label: '黄金光泽 Gold Shine' },
  { value: 'rainbow',    label: '彩虹 Rainbow' },
  { value: 'floating',   label: '浮动 Floating' },
];

const SIZES = [
  { value: 'small',  label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large',  label: 'Large' },
  { value: 'hero',   label: 'Hero' },
  { value: 'custom', label: '✏️ Custom' },
];

// Default custom size specs per preset — pre-fills when user clicks a preset
const PRESET_TO_CUSTOM: Record<string, CustomSizeSpec> = {
  small:  { width: '100', width_unit: '%', height: '100', height_unit: 'px', pad_top: '10', pad_right: '16', pad_bottom: '10', pad_left: '16', radius: '12' },
  medium: { width: '100', width_unit: '%', height: '160', height_unit: 'px', pad_top: '13', pad_right: '19', pad_bottom: '13', pad_left: '19', radius: '16' },
  large:  { width: '100', width_unit: '%', height: '220', height_unit: 'px', pad_top: '16', pad_right: '24', pad_bottom: '16', pad_left: '24', radius: '20' },
  hero:   { width: '100', width_unit: '%', height: '320', height_unit: 'px', pad_top: '19', pad_right: '32', pad_bottom: '19', pad_left: '32', radius: '24' },
};

function defaultCustomSizeSpec(): CustomSizeSpec {
  return { width: '100', width_unit: '%', height: '160', height_unit: 'px', pad_top: '13', pad_right: '19', pad_bottom: '13', pad_left: '19', radius: '16' };
}

const FONT_STYLES = [
  { value: 'classic',    label: 'Classic' },
  { value: 'digital',    label: 'Digital' },
  { value: 'led',        label: 'LED' },
  { value: 'luxury',     label: 'Luxury' },
  { value: 'casino',     label: 'Casino' },
  { value: 'cyber',      label: 'Cyber' },
  { value: 'matrix',     label: 'Matrix' },
  { value: 'orbitron',   label: 'Orbitron' },
  { value: 'rajdhani',   label: 'Rajdhani' },
  { value: 'audiowide',  label: 'Audiowide' },
  { value: 'share_tech', label: 'Share Tech' },
];

const BG_TYPES = [
  { value: '',            label: '跟随预设 (Preset)' },
  { value: 'transparent', label: '透明 Transparent' },
  { value: 'solid',       label: '纯色 Solid' },
  { value: 'gradient',    label: '渐变 Gradient' },
  { value: 'glass',       label: '玻璃 Glass' },
];

const BORDER_STYLES = [
  { value: '',        label: '跟随预设 (Preset)' },
  { value: 'none',    label: '无边框' },
  { value: 'outline', label: '细线 Outline' },
  { value: 'double',  label: '双线 Double' },
  { value: 'gold',    label: '金色 Gold' },
  { value: 'neon',    label: '霓虹 Neon' },
];

const SYNC_INTERVALS = [1, 3, 5, 10] as const;
const DECIMAL_OPTIONS = [0, 2, 3] as const;

// ── Default counter ────────────────────────────────────────────────────────────

function defaultCounter(id: string): JackpotCounterDef {
  return {
    id,
    title:                '今日奖池',
    prefix:               'RM',
    data_source:          'realtime',
    initial_value:        1_000_000,
    manual_value:         1_000_000,
    increment_per_second: 3.5,
    decimal_places:       2,
    sync_interval:        3,
    style_preset:         'classic_gold',
    number_effect:        'smooth',
    animation:            'glow',
    size:                 'medium',
    custom_size:          undefined,
    icon:                 '💰',
    icon_media_id:        null,
    title_color:          '',
    number_color:         '',
    currency_color:       '',
    glow_color:           '',
    bg_type:              '',
    bg_color:             '',
    bg_gradient:          '',
    border_style:         '',
    border_color:         '',
    border_radius:        '16px',
    font_style:           'classic',
  };
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EditorTab = 'data' | 'style' | 'design' | 'colors';

// ── Sub-components ────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  );
}

function Sel({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border rounded-lg px-3 py-2 text-sm">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value || '#f59e0b'}
        onChange={e => onChange(e.target.value)}
        className="w-8 h-8 rounded border cursor-pointer flex-shrink-0" />
      <span className="text-xs text-gray-600 flex-1">{label}</span>
      <input type="text" value={value} placeholder="空 = 跟随预设"
        onChange={e => onChange(e.target.value)}
        className="border rounded px-2 py-1 text-xs w-36 font-mono" />
      {value && (
        <button onClick={() => onChange('')}
          className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0">✕</button>
      )}
    </div>
  );
}

// ── Custom Size Editor ────────────────────────────────────────────────────────

type ResponsiveBreakpoint = 'desktop' | 'tablet' | 'mobile';

function SizeInput({
  label, value, unit, units, onValue, onUnit,
}: {
  label: string;
  value: string;
  unit: string;
  units: string[];
  onValue: (v: string) => void;
  onUnit: (u: string) => void;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex gap-1">
        <input
          type="number"
          value={value}
          onChange={e => onValue(e.target.value)}
          className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
          min={0}
        />
        <select
          value={unit}
          onChange={e => onUnit(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-sm bg-white"
        >
          {units.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </div>
  );
}

function CustomSizeEditor({
  spec,
  onChange,
}: {
  spec: CustomSizeSpec;
  onChange: (s: CustomSizeSpec) => void;
}) {
  function p(fields: Partial<CustomSizeSpec>) {
    onChange({ ...spec, ...fields });
  }

  return (
    <div className="border rounded-xl p-3 space-y-3 bg-indigo-50 border-indigo-200">
      <div className="grid grid-cols-2 gap-3">
        <SizeInput
          label="宽度 Width"
          value={spec.width}
          unit={spec.width_unit}
          units={['%', 'px', 'vw']}
          onValue={v => p({ width: v })}
          onUnit={u => p({ width_unit: u as CustomSizeSpec['width_unit'] })}
        />
        <SizeInput
          label="高度 Height"
          value={spec.height_unit === 'auto' ? '' : spec.height}
          unit={spec.height_unit}
          units={['px', 'rem', 'vh', 'auto']}
          onValue={v => p({ height: v })}
          onUnit={u => p({ height_unit: u as CustomSizeSpec['height_unit'] })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">最大宽度 Max Width <span className="opacity-50">(可选)</span></p>
          <div className="flex gap-1">
            <input
              type="number"
              value={spec.max_width ?? ''}
              onChange={e => p({ max_width: e.target.value })}
              placeholder="无限制"
              className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
            />
            <span className="px-2 py-1.5 text-sm text-gray-400">px</span>
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">最小高度 Min Height <span className="opacity-50">(可选)</span></p>
          <div className="flex gap-1">
            <input
              type="number"
              value={spec.min_height ?? ''}
              onChange={e => p({ min_height: e.target.value })}
              placeholder="无限制"
              className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
            />
            <span className="px-2 py-1.5 text-sm text-gray-400">px</span>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1">内边距 Padding (px)</p>
        <div className="grid grid-cols-4 gap-1">
          {(['pad_top','pad_right','pad_bottom','pad_left'] as const).map((k, i) => (
            <div key={k}>
              <p className="text-xs text-gray-400 text-center mb-0.5">
                {['上T','右R','下B','左L'][i]}
              </p>
              <input
                type="number"
                value={spec[k]}
                onChange={e => p({ [k]: e.target.value })}
                className="w-full border rounded px-1 py-1 text-xs text-center"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1">圆角 Border Radius (px)</p>
        <input
          type="number"
          value={spec.radius}
          onChange={e => p({ radius: e.target.value })}
          className="w-full border rounded-lg px-2 py-1.5 text-sm"
        />
      </div>

      <div className="text-xs text-indigo-600 font-mono bg-white border border-indigo-100 rounded p-2">
        {`width:${spec.width}${spec.width_unit}; `}
        {spec.height_unit !== 'auto' && `height:${spec.height}${spec.height_unit}; `}
        {spec.max_width  && `max-width:${spec.max_width}px; `}
        {spec.min_height && `min-height:${spec.min_height}px; `}
        {`padding:${spec.pad_top}px ${spec.pad_right}px ${spec.pad_bottom}px ${spec.pad_left}px; `}
        {`border-radius:${spec.radius}px;`}
      </div>
    </div>
  );
}

// ── Mini Live Preview ──────────────────────────────────────────────────────────

function MiniPreview({ c }: { c: JackpotCounterDef }) {
  useEffect(() => { injectErpKeyframes(); }, []);

  const presetBgs: Record<string, string> = {
    classic_gold:  'linear-gradient(135deg,#0d0800,#1f1000)',
    luxury_gold:   'linear-gradient(160deg,#0a0500,#201000)',
    casino_vip:    'linear-gradient(135deg,#0a0014,#15002a)',
    cyber_neon:    'linear-gradient(135deg,#001a0a,#002714)',
    cyber_blue:    'linear-gradient(135deg,#00030d,#000c1f)',
    glass:         'rgba(255,255,255,0.07)',
    titanium:      'linear-gradient(160deg,#18182f,#22223a)',
    diamond:       'linear-gradient(135deg,#e0f2fe,#bae6fd)',
    ruby:          'linear-gradient(135deg,#0a0000,#1c0000)',
    emerald:       'linear-gradient(135deg,#000a04,#001c0a)',
    ocean:         'linear-gradient(160deg,#0c1445,#0a1830)',
    galaxy:        'linear-gradient(135deg,#050010,#0d0025)',
    matrix:        '#001100',
    led_display:   '#0a0a0a',
    digital_clock: 'linear-gradient(135deg,#0f0f0f,#1a1a1a)',
    minimal:       'transparent',
    luxury_black:  'linear-gradient(135deg,#050505,#111111)',
    future_ai:     'linear-gradient(135deg,#0a001f,#100030)',
  };
  const presetColors: Record<string, string> = {
    classic_gold: '#f59e0b', luxury_gold: '#fcd34d', casino_vip: '#c084fc',
    cyber_neon: '#22c55e', cyber_blue: '#38bdf8', glass: '#fff', titanium: '#e2e8f0',
    diamond: '#0c4a6e', ruby: '#f87171', emerald: '#34d399', ocean: '#67e8f9',
    galaxy: '#c4b5fd', matrix: '#00ff41', led_display: '#ff6b00', digital_clock: '#00ff9f',
    minimal: '#fff', luxury_black: '#ffd700', future_ai: '#00e5ff',
  };

  const bg     = c.bg_type === 'solid' && c.bg_color ? c.bg_color
                : c.bg_type === 'gradient' && c.bg_gradient ? c.bg_gradient
                : c.bg_type === 'transparent' ? 'transparent'
                : presetBgs[c.style_preset] ?? '#1a1a2e';
  const numCol = c.number_color || presetColors[c.style_preset] || '#f59e0b';
  const ttlCol = c.title_color || 'rgba(255,255,255,0.6)';

  const animClass   = ANIM_TO_CLASS[c.animation] ?? '';
  const effectClass = EFFECT_TO_CLASS[c.number_effect] ?? '';

  const formatted = (c.data_source === 'manual' ? c.manual_value : c.initial_value)
    .toLocaleString('en-MY', { minimumFractionDigits: c.decimal_places, maximumFractionDigits: c.decimal_places });

  const ledDigitStyle: React.CSSProperties = {
    display: 'inline-block', padding: '0.07em 0.22em', margin: '0 1px',
    background: 'rgba(0,0,0,0.7)', borderRadius: '3px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: 'inset 0 0 6px rgba(0,0,0,0.9)',
  };
  const mechDigitStyle: React.CSSProperties = {
    display: 'inline-block', padding: '0.08em 0.25em', margin: '0 1.5px',
    background: 'linear-gradient(180deg,rgba(70,70,70,0.9) 0%,rgba(18,18,18,0.95) 100%)',
    borderRadius: '4px', border: '1px solid rgba(110,110,110,0.4)',
    boxShadow: '0 2px 5px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.12)',
  };

  function renderNumber() {
    const dStyle = c.number_effect === 'led' ? ledDigitStyle
                 : c.number_effect === 'mechanical' ? mechDigitStyle
                 : null;

    if (dStyle) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', color: numCol }}>
          {formatted.split('').map((ch, i) =>
            /\d/.test(ch)
              ? <span key={i} style={dStyle}>{ch}</span>
              : <span key={i} style={{ opacity: 0.5, padding: '0 1px', fontSize: '0.7em' }}>{ch}</span>
          )}
        </span>
      );
    }

    return (
      <span className={effectClass} style={{ color: numCol, display: 'inline-block' }}>
        {formatted}
      </span>
    );
  }

  return (
    <div className={`rounded-xl p-4 text-center select-none ${animClass}`}
      style={{ background: bg, border: '1px solid rgba(255,255,255,0.1)' }}>
      {c.icon && <div className="text-lg mb-1">{c.icon}</div>}
      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: ttlCol }}>{c.title}</p>
      <p className="font-black tabular-nums text-2xl">
        <span className="text-base mr-1" style={{ color: c.currency_color || numCol }}>{c.prefix}</span>
        {renderNumber()}
      </p>
      <p className="text-xs mt-1 opacity-50" style={{ color: numCol }}>
        {NUMBER_EFFECTS.find(e => e.value === c.number_effect)?.label ?? c.number_effect}
        {c.animation !== 'none' && c.animation ? ` · ${ANIMATIONS.find(a => a.value === c.animation)?.label ?? c.animation}` : ''}
      </p>
    </div>
  );
}

// ── Reset Panel (ERP API call) ─────────────────────────────────────────────────

function ResetPanel({ counterId, rate }: { counterId: string; rate: number }) {
  const [val, setVal]     = useState('1000000');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]     = useState('');

  async function doReset() {
    setSaving(true);
    setMsg('');
    try {
      const r = await fetch('/api/jackpot', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: counterId, value: parseFloat(val) || 1_000_000, rate }),
      });
      setMsg(r.ok ? '✅ 已重置' : '❌ 重置失败');
    } catch {
      setMsg('❌ 网络错误');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 3000);
    }
  }

  return (
    <div className="border rounded-xl p-3 space-y-2 bg-red-50 border-red-200">
      <p className="text-xs font-semibold text-red-700">重置计数器到指定值</p>
      <div className="flex items-center gap-2">
        <input type="text" inputMode="numeric" value={val}
          onChange={e => setVal(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
          placeholder="重置到..." />
        <button onClick={doReset} disabled={saving}
          className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap">
          {saving ? '重置中…' : '立即重置'}
        </button>
      </div>
      {msg && <p className="text-xs text-red-700">{msg}</p>}
      <p className="text-xs text-red-500">注意：此操作影响所有访客看到的实时数值</p>
    </div>
  );
}

// ── Counter Settings Tabs ──────────────────────────────────────────────────────

function CounterEditor({
  counter,
  onChange,
}: {
  counter: JackpotCounterDef;
  onChange: (c: JackpotCounterDef) => void;
}) {
  const [tab, setTab] = useState<EditorTab>('data');
  const [bpTab, setBpTab] = useState<ResponsiveBreakpoint>('desktop');

  function patch(fields: Partial<JackpotCounterDef>) {
    onChange({ ...counter, ...fields });
  }

  const tabs: { key: EditorTab; label: string }[] = [
    { key: 'data',   label: '数据源' },
    { key: 'style',  label: '样式' },
    { key: 'design', label: '设计' },
    { key: 'colors', label: '颜色' },
  ];

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 border-b pb-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1 text-xs rounded-t font-medium transition-colors ${
              tab === t.key
                ? 'bg-indigo-600 text-white'
                : 'text-gray-500 hover:text-gray-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DATA SOURCE TAB ── */}
      {tab === 'data' && (
        <div className="space-y-3">
          <Row label="标题 (Title)">
            <input className="w-full border rounded-lg px-3 py-2 text-sm"
              value={counter.title}
              onChange={e => patch({ title: e.target.value })} />
          </Row>

          <Row label="货币前缀 (Prefix)">
            <input className="w-full border rounded-lg px-3 py-2 text-sm"
              value={counter.prefix}
              onChange={e => patch({ prefix: e.target.value })} />
          </Row>

          <Row label="图标 Emoji">
            <input className="w-full border rounded-lg px-3 py-2 text-sm"
              value={counter.icon}
              placeholder="💰"
              onChange={e => patch({ icon: e.target.value })} />
          </Row>

          <Row label="数据来源 (Data Source)">
            <Sel value={counter.data_source}
              onChange={v => patch({ data_source: v as JackpotCounterDef['data_source'] })}
              options={DATA_SOURCES} />
          </Row>

          {counter.data_source === 'manual' && (
            <Row label="固定数值 (Manual Value)">
              <NumericInput min={0} decimals={2} className="w-full border rounded-lg px-3 py-2 text-sm"
                value={counter.manual_value}
                onChange={n => patch({ manual_value: n })} />
            </Row>
          )}

          {(counter.data_source === 'realtime' || counter.data_source === 'local') && (
            <>
              <Row label="起始值 (Initial Value)">
                <NumericInput min={0} decimals={2} className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={counter.initial_value}
                  onChange={n => patch({ initial_value: n })} />
              </Row>
              <Row label="每秒增加 RM (Rate/sec)">
                <NumericInput min={0} decimals={2} step={0.1} className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={counter.increment_per_second}
                  onChange={n => patch({ increment_per_second: n })} />
              </Row>
            </>
          )}

          {counter.data_source === 'realtime' && (
            <Row label="同步间隔 Sync Interval (秒)">
              <div className="flex gap-2">
                {SYNC_INTERVALS.map(s => (
                  <button key={s} onClick={() => patch({ sync_interval: s })}
                    className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                      counter.sync_interval === s
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-gray-300 text-gray-600 hover:border-indigo-400'
                    }`}>
                    {s}s
                  </button>
                ))}
              </div>
            </Row>
          )}

          <Row label="小数位 Decimal Places">
            <div className="flex gap-2">
              {DECIMAL_OPTIONS.map(d => (
                <button key={d} onClick={() => patch({ decimal_places: d })}
                  className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                    counter.decimal_places === d
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-300 text-gray-600 hover:border-indigo-400'
                  }`}>
                  {d === 0 ? '整数' : `.${Array(d).fill('0').join('')}`}
                </button>
              ))}
            </div>
          </Row>

          {counter.data_source === 'realtime' && (
            <ResetPanel counterId={counter.id} rate={counter.increment_per_second} />
          )}
        </div>
      )}

      {/* ── STYLE TAB ── */}
      {tab === 'style' && (
        <div className="space-y-3">
          <Row label="样式预设 (Style Preset)">
            <Sel value={counter.style_preset}
              onChange={v => patch({ style_preset: v })}
              options={STYLE_PRESETS} />
          </Row>

          <Row label="尺寸 (Size)">
            <div className="flex gap-1 flex-wrap">
              {SIZES.map(s => (
                <button
                  key={s.value}
                  onClick={() => {
                    if (s.value === 'custom') {
                      // Switch to custom — preserve existing custom_size or init defaults
                      patch({ size: 'custom', custom_size: counter.custom_size ?? { desktop: defaultCustomSizeSpec() } });
                    } else {
                      // Preset: update size AND prefill custom_size for easy fine-tuning
                      const presetSpec = PRESET_TO_CUSTOM[s.value];
                      patch({
                        size: s.value,
                        custom_size: { desktop: { ...(counter.custom_size?.desktop ?? defaultCustomSizeSpec()), ...presetSpec } },
                      });
                    }
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                    counter.size === s.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-300 text-gray-600 hover:border-indigo-400'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Row>

          {counter.size === 'custom' && (() => {
            const cs = counter.custom_size ?? { desktop: defaultCustomSizeSpec() };
            return (
              <div className="space-y-2">
                <div className="flex gap-1">
                  {(['desktop','tablet','mobile'] as ResponsiveBreakpoint[]).map(bp => (
                    <button
                      key={bp}
                      onClick={() => setBpTab(bp)}
                      className={`px-2 py-1 text-xs rounded-lg border font-medium transition-colors ${
                        bpTab === bp
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-gray-300 text-gray-600 hover:border-indigo-300'
                      }`}
                    >
                      {bp === 'desktop' ? '🖥 Desktop' : bp === 'tablet' ? '📱 ≤1024px' : '📱 ≤480px'}
                    </button>
                  ))}
                </div>
                {bpTab === 'desktop' && (
                  <CustomSizeEditor
                    spec={cs.desktop}
                    onChange={s => patch({ custom_size: { ...cs, desktop: s } })}
                  />
                )}
                {bpTab === 'tablet' && (
                  <CustomSizeEditor
                    spec={{ ...cs.desktop, ...cs.tablet }}
                    onChange={s => patch({ custom_size: { ...cs, tablet: s } })}
                  />
                )}
                {bpTab === 'mobile' && (
                  <CustomSizeEditor
                    spec={{ ...cs.desktop, ...cs.mobile }}
                    onChange={s => patch({ custom_size: { ...cs, mobile: s } })}
                  />
                )}
              </div>
            );
          })()}

          <Row label="字体 (Font)">
            <Sel value={counter.font_style}
              onChange={v => patch({ font_style: v })}
              options={FONT_STYLES} />
          </Row>

          <Row label="数字效果 (Number Effect)">
            <Sel value={counter.number_effect}
              onChange={v => patch({ number_effect: v })}
              options={NUMBER_EFFECTS} />
          </Row>

          <Row label="动画 (Animation)">
            <Sel value={counter.animation}
              onChange={v => patch({ animation: v })}
              options={ANIMATIONS} />
          </Row>
        </div>
      )}

      {/* ── DESIGN TAB ── */}
      {tab === 'design' && (
        <div className="space-y-3">
          <Row label="背景类型 (Background)">
            <Sel value={counter.bg_type}
              onChange={v => patch({ bg_type: v })}
              options={BG_TYPES} />
          </Row>

          {counter.bg_type === 'solid' && (
            <Row label="背景色">
              <div className="flex items-center gap-2">
                <input type="color" value={counter.bg_color || '#000000'}
                  onChange={e => patch({ bg_color: e.target.value })}
                  className="w-8 h-8 rounded border cursor-pointer" />
                <input type="text" value={counter.bg_color}
                  onChange={e => patch({ bg_color: e.target.value })}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm font-mono" />
              </div>
            </Row>
          )}

          {counter.bg_type === 'gradient' && (
            <Row label="渐变 CSS (e.g. linear-gradient(...))">
              <textarea rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                value={counter.bg_gradient}
                placeholder="linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
                onChange={e => patch({ bg_gradient: e.target.value })} />
            </Row>
          )}

          <Row label="边框样式 (Border)">
            <Sel value={counter.border_style}
              onChange={v => patch({ border_style: v })}
              options={BORDER_STYLES} />
          </Row>

          <Row label="圆角 (Border Radius)">
            <input className="w-full border rounded-lg px-3 py-2 text-sm"
              value={counter.border_radius}
              placeholder="16px"
              onChange={e => patch({ border_radius: e.target.value })} />
          </Row>
        </div>
      )}

      {/* ── COLORS TAB ── */}
      {tab === 'colors' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">留空 = 跟随样式预设。填写后覆盖预设颜色。</p>
          <ColorRow label="数字颜色 Number"   value={counter.number_color}   onChange={v => patch({ number_color: v })} />
          <ColorRow label="标题颜色 Title"    value={counter.title_color}    onChange={v => patch({ title_color: v })} />
          <ColorRow label="货币颜色 Currency" value={counter.currency_color} onChange={v => patch({ currency_color: v })} />
          <ColorRow label="边框颜色 Border"   value={counter.border_color}   onChange={v => patch({ border_color: v })} />
          <ColorRow label="发光颜色 Glow"     value={counter.glow_color}     onChange={v => patch({ glow_color: v })} />
        </div>
      )}
    </div>
  );
}

// ── Main JackpotEditor ────────────────────────────────────────────────────────

export default function JackpotEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const raw = config as JackpotSectionConfig;

  // Normalise to multi-counter format
  const counters: JackpotCounterDef[] = (raw.counters && raw.counters.length > 0)
    ? raw.counters
    : [defaultCounter('legacy')];
  const layout = (raw.layout as string) || 'vertical';

  const [selectedIdx, setSelectedIdx] = useState(0);

  function save(newCounters: JackpotCounterDef[], newLayout?: string) {
    onChange({
      ...config,
      mode:     newCounters.length === 1 ? 'single' : 'multiple',
      counters: newCounters,
      layout:   newLayout ?? layout,
    });
  }

  function addCounter() {
    const next = [...counters, defaultCounter(uid())];
    save(next);
    setSelectedIdx(next.length - 1);
  }

  function deleteCounter(idx: number) {
    if (counters.length === 1) return;
    const next = counters.filter((_, i) => i !== idx);
    save(next);
    setSelectedIdx(Math.min(idx, next.length - 1));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...counters];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    save(next);
    setSelectedIdx(idx - 1);
  }

  function moveDown(idx: number) {
    if (idx >= counters.length - 1) return;
    const next = [...counters];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    save(next);
    setSelectedIdx(idx + 1);
  }

  function updateCounter(idx: number, updated: JackpotCounterDef) {
    const next = counters.map((c, i) => i === idx ? updated : c);
    save(next);
  }

  const selected = counters[Math.min(selectedIdx, counters.length - 1)];
  const safeIdx  = Math.min(selectedIdx, counters.length - 1);

  return (
    <div className="space-y-4">

      {/* ── Global: Layout ── */}
      {counters.length > 1 && (
        <div className="border rounded-xl p-3 bg-gray-50 space-y-2">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">多计数器布局</p>
          <div className="flex gap-2">
            {(['vertical', 'horizontal', 'grid'] as const).map(l => (
              <button key={l} onClick={() => save(counters, l)}
                className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  layout === l
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-gray-300 text-gray-600 hover:border-indigo-400'
                }`}>
                {l === 'vertical' ? '纵向' : l === 'horizontal' ? '横排' : '网格'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Counter list ── */}
      <div className="border rounded-xl p-3 space-y-2 bg-gray-50">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">计数器列表</p>
          <button onClick={addCounter}
            className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            + 添加计数器
          </button>
        </div>

        {counters.map((c, idx) => (
          <div key={c.id}
            onClick={() => setSelectedIdx(idx)}
            className={`flex items-center gap-2 rounded-lg p-2 cursor-pointer transition-colors ${
              safeIdx === idx ? 'bg-indigo-50 border border-indigo-300' : 'bg-white border border-gray-200 hover:border-gray-300'
            }`}>
            <span className="text-base">{c.icon || '💰'}</span>
            <span className="flex-1 text-sm font-medium text-gray-800 truncate">{c.title}</span>
            <span className="text-xs text-gray-400 hidden sm:block">
              {DATA_SOURCES.find(d => d.value === c.data_source)?.label.split(' ')[0]}
            </span>
            <div className="flex gap-0.5 ml-1">
              <button onClick={e => { e.stopPropagation(); moveUp(idx); }}
                disabled={idx === 0}
                className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▲</button>
              <button onClick={e => { e.stopPropagation(); moveDown(idx); }}
                disabled={idx === counters.length - 1}
                className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▼</button>
              <button onClick={e => { e.stopPropagation(); deleteCounter(idx); }}
                disabled={counters.length === 1}
                className="p-1 text-red-400 hover:text-red-600 disabled:opacity-20 text-xs ml-1">✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Live Preview ── */}
      <div className="border rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">实时预览</p>
        <MiniPreview c={selected} />
      </div>

      {/* ── Counter settings ── */}
      <div className="border rounded-xl p-3 space-y-3">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          设置：{selected.title}
        </p>
        <CounterEditor
          key={selected.id}
          counter={selected}
          onChange={updated => updateCounter(safeIdx, updated)}
        />
      </div>
    </div>
  );
}
