'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Check, Download, Upload, RotateCcw, Palette, Eye } from 'lucide-react';

// ─── Theme presets (mirrors website/src/lib/design-themes.ts) ────────────────
// Kept in sync manually; both files define the same values.

interface ThemeVars {
  '--brand-primary': string;
  '--brand-secondary': string;
  '--bg-base': string;
  '--bg-surface': string;
  '--bg-surface2': string;
  '--bg-surface3': string;
  '--bg-card': string;
  '--border-dim': string;
  '--border-mid': string;
  '--text-base': string;
  '--text-muted': string;
  '--text-faint': string;
  '--radius-card': string;
  '--radius-btn': string;
  '--shadow-card': string;
  '--shadow-glow': string;
  '--anim-speed': string;
  '--font-family'?: string;
}

interface ThemePreset {
  label: string;
  emoji: string;
  vars: ThemeVars;
}

const THEMES: Record<string, ThemePreset> = {
  classic_purple: { label: 'Classic Purple', emoji: '💜', vars: { '--brand-primary': '#7c3aed', '--brand-secondary': '#6d28d9', '--bg-base': '#0a0b14', '--bg-surface': '#111222', '--bg-surface2': '#181928', '--bg-surface3': '#1f2035', '--bg-card': '#14152b', '--border-dim': 'rgba(255 255 255 / 0.06)', '--border-mid': 'rgba(255 255 255 / 0.11)', '--text-base': '#e8e8f5', '--text-muted': '#7070a0', '--text-faint': '#44445a', '--radius-card': '12px', '--radius-btn': '10px', '--shadow-card': '0 4px 16px rgba(0,0,0,0.4)', '--shadow-glow': '0 0 20px color-mix(in srgb, var(--brand-primary) 25%, transparent)', '--anim-speed': '1' } },
  cyber_neon:     { label: 'Cyber Neon',    emoji: '⚡', vars: { '--brand-primary': '#00e5ff', '--brand-secondary': '#ff0080', '--bg-base': '#050810', '--bg-surface': '#0a0f1a', '--bg-surface2': '#0d1420', '--bg-surface3': '#101828', '--bg-card': '#080c16', '--border-dim': 'rgba(0, 229, 255, 0.08)', '--border-mid': 'rgba(0, 229, 255, 0.20)', '--text-base': '#c8f0ff', '--text-muted': 'rgba(0,229,255,0.5)', '--text-faint': 'rgba(0,229,255,0.25)', '--radius-card': '8px', '--radius-btn': '6px', '--shadow-card': '0 4px 24px rgba(0,229,255,0.08)', '--shadow-glow': '0 0 24px rgba(0,229,255,0.30)', '--anim-speed': '0.8', '--font-family': '"Courier New", monospace' } },
  blue_tech:      { label: 'Blue Tech',     emoji: '🔵', vars: { '--brand-primary': '#3b82f6', '--brand-secondary': '#6366f1', '--bg-base': '#080f1a', '--bg-surface': '#0f172a', '--bg-surface2': '#131d30', '--bg-surface3': '#182038', '--bg-card': '#0d1526', '--border-dim': 'rgba(59, 130, 246, 0.08)', '--border-mid': 'rgba(59, 130, 246, 0.18)', '--text-base': '#e2e8f0', '--text-muted': '#64748b', '--text-faint': '#334155', '--radius-card': '12px', '--radius-btn': '8px', '--shadow-card': '0 4px 16px rgba(0,0,0,0.5)', '--shadow-glow': '0 0 20px rgba(59,130,246,0.25)', '--anim-speed': '1' } },
  red_luxury:     { label: 'Red Luxury',    emoji: '❤️', vars: { '--brand-primary': '#dc2626', '--brand-secondary': '#d97706', '--bg-base': '#0a0404', '--bg-surface': '#140808', '--bg-surface2': '#1a0a0a', '--bg-surface3': '#200d0d', '--bg-card': '#110606', '--border-dim': 'rgba(220, 38, 38, 0.08)', '--border-mid': 'rgba(220, 38, 38, 0.20)', '--text-base': '#fef2f2', '--text-muted': '#9f1239', '--text-faint': '#4c0519', '--radius-card': '14px', '--radius-btn': '10px', '--shadow-card': '0 4px 20px rgba(0,0,0,0.6)', '--shadow-glow': '0 0 24px rgba(220,38,38,0.25)', '--anim-speed': '1.2' } },
  gold_vip:       { label: 'Gold VIP',      emoji: '🥇', vars: { '--brand-primary': '#d97706', '--brand-secondary': '#b45309', '--bg-base': '#050400', '--bg-surface': '#0c0900', '--bg-surface2': '#110d00', '--bg-surface3': '#161100', '--bg-card': '#090700', '--border-dim': 'rgba(217, 119, 6, 0.10)', '--border-mid': 'rgba(217, 119, 6, 0.25)', '--text-base': '#fef9c3', '--text-muted': '#92400e', '--text-faint': '#451a03', '--radius-card': '12px', '--radius-btn': '8px', '--shadow-card': '0 4px 20px rgba(0,0,0,0.6)', '--shadow-glow': '0 0 24px rgba(217,119,6,0.30)', '--anim-speed': '1.2' } },
  emerald_green:  { label: 'Emerald Green', emoji: '💚', vars: { '--brand-primary': '#10b981', '--brand-secondary': '#059669', '--bg-base': '#020a06', '--bg-surface': '#061410', '--bg-surface2': '#091a14', '--bg-surface3': '#0c2018', '--bg-card': '#04100c', '--border-dim': 'rgba(16, 185, 129, 0.08)', '--border-mid': 'rgba(16, 185, 129, 0.18)', '--text-base': '#d1fae5', '--text-muted': '#065f46', '--text-faint': '#022c22', '--radius-card': '12px', '--radius-btn': '10px', '--shadow-card': '0 4px 16px rgba(0,0,0,0.5)', '--shadow-glow': '0 0 20px rgba(16,185,129,0.25)', '--anim-speed': '1' } },
  dark_glass:     { label: 'Dark Glass',    emoji: '🪟', vars: { '--brand-primary': '#8b5cf6', '--brand-secondary': '#7c3aed', '--bg-base': '#050508', '--bg-surface': 'rgba(15,15,25,0.80)', '--bg-surface2': 'rgba(20,20,32,0.75)', '--bg-surface3': 'rgba(28,28,42,0.70)', '--bg-card': 'rgba(12,12,22,0.85)', '--border-dim': 'rgba(255, 255, 255, 0.07)', '--border-mid': 'rgba(255, 255, 255, 0.13)', '--text-base': '#f0f0ff', '--text-muted': 'rgba(200,200,220,0.5)', '--text-faint': 'rgba(150,150,170,0.35)', '--radius-card': '16px', '--radius-btn': '12px', '--shadow-card': '0 8px 32px rgba(0,0,0,0.5)', '--shadow-glow': '0 0 24px rgba(139,92,246,0.20)', '--anim-speed': '1' } },
  cyberpunk:      { label: 'Cyberpunk',     emoji: '🤖', vars: { '--brand-primary': '#f59e0b', '--brand-secondary': '#ec4899', '--bg-base': '#03000a', '--bg-surface': '#08001a', '--bg-surface2': '#0c0020', '--bg-surface3': '#100028', '--bg-card': '#060012', '--border-dim': 'rgba(236, 72, 153, 0.10)', '--border-mid': 'rgba(236, 72, 153, 0.25)', '--text-base': '#fdf4ff', '--text-muted': '#c026d3', '--text-faint': '#701a75', '--radius-card': '6px', '--radius-btn': '4px', '--shadow-card': '0 4px 24px rgba(236,72,153,0.10)', '--shadow-glow': '0 0 24px rgba(245,158,11,0.30)', '--anim-speed': '0.7', '--font-family': '"Courier New", monospace' } },
  matrix:         { label: 'Matrix',        emoji: '🟩', vars: { '--brand-primary': '#00ff41', '--brand-secondary': '#00cc33', '--bg-base': '#000300', '--bg-surface': '#000800', '--bg-surface2': '#000c00', '--bg-surface3': '#001000', '--bg-card': '#000500', '--border-dim': 'rgba(0, 255, 65, 0.08)', '--border-mid': 'rgba(0, 255, 65, 0.20)', '--text-base': '#39ff14', '--text-muted': 'rgba(0,255,65,0.50)', '--text-faint': 'rgba(0,255,65,0.25)', '--radius-card': '4px', '--radius-btn': '2px', '--shadow-card': '0 4px 16px rgba(0,255,65,0.06)', '--shadow-glow': '0 0 20px rgba(0,255,65,0.30)', '--anim-speed': '0.6', '--font-family': '"Courier New", monospace' } },
  minimal:        { label: 'Minimal',       emoji: '⬜', vars: { '--brand-primary': '#2563eb', '--brand-secondary': '#1d4ed8', '--bg-base': '#f8fafc', '--bg-surface': '#ffffff', '--bg-surface2': '#f1f5f9', '--bg-surface3': '#e2e8f0', '--bg-card': '#ffffff', '--border-dim': 'rgba(0, 0, 0, 0.06)', '--border-mid': 'rgba(0, 0, 0, 0.12)', '--text-base': '#0f172a', '--text-muted': '#64748b', '--text-faint': '#94a3b8', '--radius-card': '12px', '--radius-btn': '8px', '--shadow-card': '0 1px 8px rgba(0,0,0,0.08)', '--shadow-glow': '0 0 16px rgba(37,99,235,0.15)', '--anim-speed': '1.2' } },
  titanium:       { label: 'Titanium',      emoji: '🔩', vars: { '--brand-primary': '#94a3b8', '--brand-secondary': '#64748b', '--bg-base': '#060709', '--bg-surface': '#0d0f12', '--bg-surface2': '#121518', '--bg-surface3': '#181b1f', '--bg-card': '#0a0c0f', '--border-dim': 'rgba(148, 163, 184, 0.07)', '--border-mid': 'rgba(148, 163, 184, 0.15)', '--text-base': '#cbd5e1', '--text-muted': '#475569', '--text-faint': '#1e293b', '--radius-card': '10px', '--radius-btn': '8px', '--shadow-card': '0 4px 16px rgba(0,0,0,0.5)', '--shadow-glow': '0 0 16px rgba(148,163,184,0.15)', '--anim-speed': '1' } },
  future_ai:      { label: 'Future AI',     emoji: '🚀', vars: { '--brand-primary': '#38bdf8', '--brand-secondary': '#818cf8', '--bg-base': '#010610', '--bg-surface': '#020c1e', '--bg-surface2': '#041228', '--bg-surface3': '#061832', '--bg-card': '#020a1a', '--border-dim': 'rgba(56, 189, 248, 0.07)', '--border-mid': 'rgba(56, 189, 248, 0.17)', '--text-base': '#e0f2fe', '--text-muted': '#0369a1', '--text-faint': '#0c4a6e', '--radius-card': '14px', '--radius-btn': '10px', '--shadow-card': '0 4px 20px rgba(56,189,248,0.08)', '--shadow-glow': '0 0 24px rgba(56,189,248,0.25)', '--anim-speed': '0.9' } },
};

const THEME_ORDER = ['classic_purple','cyber_neon','blue_tech','red_luxury','gold_vip','emerald_green','dark_glass','cyberpunk','matrix','minimal','titanium','future_ai'];

// Token labels for the custom editor
const TOKEN_GROUPS = [
  { label: '品牌色', tokens: ['--brand-primary', '--brand-secondary'] },
  { label: '背景层', tokens: ['--bg-base', '--bg-surface', '--bg-surface2', '--bg-surface3', '--bg-card'] },
  { label: '边框',  tokens: ['--border-dim', '--border-mid'] },
  { label: '文字',  tokens: ['--text-base', '--text-muted', '--text-faint'] },
  { label: '圆角',  tokens: ['--radius-card', '--radius-btn'] },
  { label: '阴影',  tokens: ['--shadow-card', '--shadow-glow'] },
  { label: '动画',  tokens: ['--anim-speed'] },
  { label: '字体',  tokens: ['--font-family'] },
];
const TOKEN_LABELS: Record<string, string> = {
  '--brand-primary': '品牌主色', '--brand-secondary': '品牌次色',
  '--bg-base': '页面底色', '--bg-surface': '表面色', '--bg-surface2': '表面色2',
  '--bg-surface3': '表面色3', '--bg-card': '卡片背景',
  '--border-dim': '弱边框', '--border-mid': '中边框',
  '--text-base': '主文字色', '--text-muted': '次文字色', '--text-faint': '淡文字色',
  '--radius-card': '卡片圆角', '--radius-btn': '按钮圆角',
  '--shadow-card': '卡片阴影', '--shadow-glow': '发光阴影',
  '--anim-speed': '动画速度倍数', '--font-family': '字体',
};

// Whether a token is a color (shows color picker)
function isColorToken(t: string) {
  return t.startsWith('--brand') || t.startsWith('--bg-') || t.startsWith('--border') || t.startsWith('--text-') || t === '--shadow-glow';
}

// ─── Mini preview card ────────────────────────────────────────────────────────
function ThemePreview({ vars, size = 'md' }: { vars: ThemeVars; size?: 'sm' | 'md' }) {
  const p = size === 'sm' ? { card: 8, btn: 4, text: 9, h: 90 } : { card: 12, btn: 6, text: 11, h: 130 };
  return (
    <div style={{
      background: vars['--bg-base'],
      borderRadius: vars['--radius-card'],
      padding: p.card,
      height: p.h,
      overflow: 'hidden',
      position: 'relative',
      fontFamily: vars['--font-family'] ?? 'system-ui',
    }}>
      {/* Card */}
      <div style={{
        background: vars['--bg-card'],
        border: `1px solid ${vars['--border-mid']}`,
        borderRadius: vars['--radius-card'],
        padding: p.btn,
        marginBottom: p.btn / 2,
        boxShadow: vars['--shadow-card'],
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: vars['--text-base'], fontSize: p.text, fontWeight: 600 }}>SSWIN88</span>
          <span style={{ color: vars['--brand-primary'], fontSize: p.text - 1, fontWeight: 700 }}>RM 2,500</span>
        </div>
        <div style={{ color: vars['--text-muted'], fontSize: p.text - 2, marginTop: 2 }}>Welcome back</div>
      </div>
      {/* Buttons */}
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ flex: 1, background: `linear-gradient(135deg, ${vars['--brand-primary']}, ${vars['--brand-secondary']})`, color: '#fff', borderRadius: vars['--radius-btn'], textAlign: 'center', padding: `${p.btn / 2}px 0`, fontSize: p.text - 2, fontWeight: 700 }}>存款</div>
        <div style={{ flex: 1, border: `1px solid ${vars['--border-mid']}`, color: vars['--text-base'], borderRadius: vars['--radius-btn'], textAlign: 'center', padding: `${p.btn / 2}px 0`, fontSize: p.text - 2 }}>提款</div>
      </div>
      {/* Glow overlay */}
      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderRadius: '50%', background: vars['--brand-primary'], opacity: 0.15, filter: 'blur(16px)' }} />
    </div>
  );
}

// ─── Full live preview pane ───────────────────────────────────────────────────
function LivePreview({ vars }: { vars: ThemeVars }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: vars['--bg-base'], fontFamily: vars['--font-family'] ?? 'system-ui', minHeight: 360, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ color: vars['--text-muted'], fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>网站预览</div>

      {/* Header bar */}
      <div style={{ background: vars['--bg-surface'], borderBottom: `1px solid ${vars['--border-dim']}`, borderRadius: vars['--radius-card'], padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ color: vars['--brand-primary'], fontWeight: 800, fontSize: 14 }}>SSWIN88</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['首页','存款','提款'].map(l => <span key={l} style={{ color: vars['--text-muted'], fontSize: 10 }}>{l}</span>)}
        </div>
      </div>

      {/* Wallet card */}
      <div style={{ background: vars['--bg-card'], border: `1px solid ${vars['--border-mid']}`, borderRadius: vars['--radius-card'], padding: 12, boxShadow: vars['--shadow-card'] }}>
        <div style={{ color: vars['--text-muted'], fontSize: 10, marginBottom: 4 }}>Available Balance</div>
        <div style={{ color: vars['--brand-primary'], fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>RM 2,500.00</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1, background: `linear-gradient(135deg,${vars['--brand-primary']},${vars['--brand-secondary']})`, color: '#fff', borderRadius: vars['--radius-btn'], textAlign: 'center', padding: '6px 0', fontSize: 11, fontWeight: 700 }}>存款 Deposit</div>
          <div style={{ flex: 1, border: `1px solid ${vars['--border-mid']}`, color: vars['--text-base'], borderRadius: vars['--radius-btn'], textAlign: 'center', padding: '6px 0', fontSize: 11 }}>提款 Withdraw</div>
        </div>
      </div>

      {/* Quick menu row */}
      <div style={{ display: 'flex', gap: 6 }}>
        {['💰存款','💳提款','🎁优惠','📋历史'].map(item => (
          <div key={item} style={{ flex: 1, background: vars['--bg-surface2'], border: `1px solid ${vars['--border-dim']}`, borderRadius: vars['--radius-card'], padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 16 }}>{item.slice(0,2)}</div>
            <div style={{ color: vars['--text-muted'], fontSize: 9, marginTop: 2 }}>{item.slice(2)}</div>
          </div>
        ))}
      </div>

      {/* Live TX */}
      <div style={{ background: vars['--bg-card'], border: `1px solid ${vars['--border-dim']}`, borderRadius: vars['--radius-card'], padding: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ t:'TOP UP', c: '#22c55e' }, { t:'WITHDRAW', c: '#a855f7' }].map(col => (
            <div key={col.t} style={{ flex: 1 }}>
              <div style={{ color: col.c, fontSize: 8, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>{col.t}</div>
              {[500,200,1000].map(a => (
                <div key={a} style={{ background: vars['--bg-surface3'], borderRadius: 4, padding: '2px 4px', marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: vars['--text-muted'], fontSize: 8 }}>6012*****</span>
                  <span style={{ color: col.c, fontSize: 8, fontWeight: 600 }}>RM{a}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Footer hint */}
      <div style={{ textAlign: 'center', color: vars['--text-faint'], fontSize: 9 }}>
        radius-card: {vars['--radius-card']} · anim-speed: {vars['--anim-speed']}x
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DesignSystemPage() {
  const [selectedPreset, setSelectedPreset] = useState('classic_purple');
  const [overrides, setOverrides]           = useState<Record<string, string>>({});
  const [saving, setSaving]                 = useState(false);
  const [saved,  setSaved]                  = useState(false);
  const [tab,    setTab]                    = useState<'presets' | 'custom' | 'preview'>('presets');
  const fileRef = useRef<HTMLInputElement>(null);

  // Resolved vars = preset base merged with overrides
  const presetVars = THEMES[selectedPreset]?.vars ?? THEMES.classic_purple.vars;
  const resolvedVars: ThemeVars = { ...presetVars, ...overrides } as ThemeVars;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/design');
      if (!res.ok) return;
      const data = await res.json() as { design_preset: string; design_overrides: Record<string, string> };
      setSelectedPreset(data.design_preset ?? 'classic_purple');
      setOverrides(data.design_overrides ?? {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    await fetch('/api/settings/design', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ design_preset: selectedPreset, design_overrides: overrides }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function selectPreset(id: string) {
    setSelectedPreset(id);
    setOverrides({}); // clear overrides when selecting a new preset
  }

  function setOverride(key: string, value: string) {
    setOverrides(prev => ({ ...prev, [key]: value }));
  }

  function resetOverrides() {
    setOverrides({});
  }

  // Export: download JSON
  function exportTheme() {
    const payload = { design_preset: selectedPreset, design_overrides: overrides, resolved: resolvedVars };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `theme-${selectedPreset}-${Date.now()}.json`;
    a.click();
  }

  // Import: load JSON
  function importTheme(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as { design_preset?: string; design_overrides?: Record<string, string> };
        if (data.design_preset) setSelectedPreset(data.design_preset);
        if (data.design_overrides) setOverrides(data.design_overrides);
      } catch { alert('无效的主题 JSON 文件'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Palette className="w-5 h-5 text-purple-600" /> Design System
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">全站主题控制 — 一键切换品牌风格，实时预览</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importTheme} />
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-xl hover:bg-gray-50 text-gray-600">
            <Upload className="w-3.5 h-3.5" /> 导入主题
          </button>
          <button onClick={exportTheme} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-xl hover:bg-gray-50 text-gray-600">
            <Download className="w-3.5 h-3.5" /> 导出主题
          </button>
          <button
            onClick={save}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-semibold text-white transition-all ${saved ? 'bg-green-500' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50`}
          >
            {saved ? <><Check className="w-4 h-4" /> 已保存</> : saving ? '保存中…' : '保存并应用'}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[['presets', '🎨 主题预设'], ['custom', '⚙️ 自定义 Token'], ['preview', '👁 完整预览']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as typeof tab)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all ${tab === id ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Left panel */}
        <div className="xl:col-span-3 space-y-4">

          {/* ── Preset Grid ── */}
          {tab === 'presets' && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">选择预设主题</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {THEME_ORDER.map(id => {
                  const t = THEMES[id];
                  const active = selectedPreset === id && Object.keys(overrides).length === 0;
                  return (
                    <button
                      key={id}
                      onClick={() => selectPreset(id)}
                      className={`relative rounded-xl overflow-hidden border-2 transition-all text-left p-0 ${active ? 'border-blue-500 shadow-lg ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <ThemePreview vars={t.vars} size="sm" />
                      <div className="px-2 py-1.5 bg-white">
                        <div className="text-xs font-semibold text-gray-800">{t.emoji} {t.label}</div>
                      </div>
                      {active && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Custom Token Editor ── */}
          {tab === 'custom' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">自定义设计 Token</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">基于: {THEMES[selectedPreset]?.label}</span>
                  <button onClick={resetOverrides} className="flex items-center gap-1 text-xs text-red-500 hover:underline">
                    <RotateCcw className="w-3 h-3" /> 重置
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                {TOKEN_GROUPS.map(group => (
                  <div key={group.label} className="border rounded-xl p-4 space-y-2.5">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{group.label}</h3>
                    {group.tokens.map(token => {
                      const current = overrides[token] ?? presetVars[token as keyof ThemeVars] ?? '';
                      const isColor = isColorToken(token);
                      return (
                        <div key={token} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-32 flex-shrink-0">{TOKEN_LABELS[token]}</span>
                          {isColor && (
                            <input
                              type="color"
                              value={current.startsWith('#') ? current : '#7c3aed'}
                              onChange={e => setOverride(token, e.target.value)}
                              className="w-8 h-8 rounded border cursor-pointer flex-shrink-0"
                            />
                          )}
                          <input
                            type="text"
                            value={current}
                            onChange={e => setOverride(token, e.target.value)}
                            placeholder={presetVars[token as keyof ThemeVars] ?? ''}
                            className="flex-1 border rounded-lg px-2.5 py-1.5 text-xs font-mono"
                          />
                          {overrides[token] && (
                            <button
                              onClick={() => {
                                const next = { ...overrides };
                                delete next[token];
                                setOverrides(next);
                              }}
                              className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0"
                              title="重置为预设值"
                            >×</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Full Preview tab ── */}
          {tab === 'preview' && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4" /> 完整网站预览
              </h2>
              <LivePreview vars={resolvedVars} />
            </div>
          )}
        </div>

        {/* Right panel — always shows live preview */}
        <div className="xl:col-span-2 space-y-4">
          <div className="sticky top-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">实时预览</h2>
            <LivePreview vars={resolvedVars} />

            {/* Resolved token summary */}
            <div className="mt-4 border rounded-xl p-3 space-y-1.5 bg-gray-50">
              <p className="text-xs font-semibold text-gray-600 mb-2">当前主题: <span className="text-blue-600">{THEMES[selectedPreset]?.label}</span> {Object.keys(overrides).length > 0 && `(${Object.keys(overrides).length} 项自定义)`}</p>
              <div className="flex flex-wrap gap-2">
                {(['--brand-primary', '--brand-secondary', '--bg-base', '--bg-card', '--text-base'] as const).map(k => (
                  <div key={k} className="flex items-center gap-1 text-xs">
                    <div className="w-3.5 h-3.5 rounded-full border border-gray-200 flex-shrink-0"
                      style={{ background: resolvedVars[k] || '#ccc' }} />
                    <span className="text-gray-500 font-mono">{k.replace('--','')}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick preset switcher */}
            <div className="mt-4 border rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">快速切换</p>
              <div className="flex flex-wrap gap-1.5">
                {THEME_ORDER.map(id => (
                  <button
                    key={id}
                    onClick={() => selectPreset(id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedPreset === id ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-400'}`}
                  >
                    {THEMES[id].emoji} {THEMES[id].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
