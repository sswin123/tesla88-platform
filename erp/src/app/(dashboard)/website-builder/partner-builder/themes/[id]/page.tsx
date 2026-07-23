'use client';

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, RotateCcw, Eye, EyeOff } from 'lucide-react';

/* ─── Canonical variable schema ─────────────────────────────── */

type VarType = 'color' | 'shadow' | 'font' | 'size' | 'duration' | 'text';

interface VarDef {
  key:     string;
  label:   string;
  type:    VarType;
  hint?:   string;
}

interface VarGroup {
  label: string;
  vars:  VarDef[];
}

const GROUPS: VarGroup[] = [
  {
    label: 'Brand Colors',
    vars: [
      { key: '--pb-primary',   label: 'Primary',   type: 'color' },
      { key: '--pb-secondary', label: 'Secondary',  type: 'color' },
      { key: '--pb-accent',    label: 'Accent',     type: 'color' },
    ],
  },
  {
    label: 'Backgrounds',
    vars: [
      { key: '--pb-bg-page',        label: 'Page',          type: 'color' },
      { key: '--pb-bg-section',     label: 'Section',       type: 'color' },
      { key: '--pb-bg-section-alt', label: 'Section Alt',   type: 'color' },
      { key: '--pb-bg-card',        label: 'Card',          type: 'color' },
      { key: '--pb-bg-card-hover',  label: 'Card Hover',    type: 'color' },
      { key: '--pb-bg-header',      label: 'Header',        type: 'color' },
      { key: '--pb-bg-footer',      label: 'Footer',        type: 'color' },
    ],
  },
  {
    label: 'Text',
    vars: [
      { key: '--pb-text-primary',   label: 'Primary Text',   type: 'color' },
      { key: '--pb-text-secondary', label: 'Secondary Text', type: 'color' },
      { key: '--pb-text-muted',     label: 'Muted Text',     type: 'color' },
    ],
  },
  {
    label: 'Borders',
    vars: [
      { key: '--pb-border',      label: 'Border',      type: 'text', hint: 'e.g. rgba(255,255,255,0.08)' },
      { key: '--pb-border-card', label: 'Card Border', type: 'text', hint: 'e.g. rgba(255,255,255,0.06)' },
    ],
  },
  {
    label: 'Buttons',
    vars: [
      { key: '--pb-btn-bg',            label: 'Button BG',           type: 'color' },
      { key: '--pb-btn-text',          label: 'Button Text',         type: 'color' },
      { key: '--pb-btn-hover',         label: 'Button Hover',        type: 'color' },
      { key: '--pb-btn-outline-color', label: 'Outline Button Color', type: 'color' },
    ],
  },
  {
    label: 'Shadows',
    vars: [
      { key: '--pb-shadow',      label: 'Base Shadow',  type: 'shadow', hint: 'e.g. 0 4px 24px rgba(0,0,0,0.4)' },
      { key: '--pb-shadow-card', label: 'Card Shadow',  type: 'shadow', hint: 'e.g. 0 2px 12px rgba(0,0,0,0.3)' },
      { key: '--pb-shadow-glow', label: 'Glow Shadow',  type: 'shadow', hint: 'e.g. 0 0 24px rgba(124,58,237,0.2)' },
    ],
  },
  {
    label: 'Shape',
    vars: [
      { key: '--pb-radius',      label: 'Base Radius',   type: 'size', hint: 'e.g. 8px' },
      { key: '--pb-radius-card', label: 'Card Radius',   type: 'size', hint: 'e.g. 12px' },
      { key: '--pb-radius-btn',  label: 'Button Radius', type: 'size', hint: 'e.g. 6px' },
      { key: '--pb-radius-lg',   label: 'Large Radius',  type: 'size', hint: 'e.g. 16px' },
    ],
  },
  {
    label: 'Typography',
    vars: [
      { key: '--pb-font-display',           label: 'Display Font',     type: 'font', hint: "e.g. Georgia, serif" },
      { key: '--pb-font-body',              label: 'Body Font',        type: 'font', hint: "e.g. system-ui, sans-serif" },
      { key: '--pb-font-size-base',         label: 'Base Font Size',   type: 'size', hint: 'e.g. 16px' },
      { key: '--pb-font-weight-heading',    label: 'Heading Weight',   type: 'text', hint: '400 | 600 | 700 | 800' },
      { key: '--pb-font-weight-body',       label: 'Body Weight',      type: 'text', hint: '300 | 400 | 500' },
      { key: '--pb-line-height',            label: 'Line Height',      type: 'text', hint: 'e.g. 1.6' },
      { key: '--pb-letter-spacing-heading', label: 'Heading Tracking', type: 'text', hint: 'e.g. -0.02em' },
    ],
  },
  {
    label: 'Spacing',
    vars: [
      { key: '--pb-section-py',       label: 'Section Padding Y',  type: 'size', hint: 'e.g. 64px' },
      { key: '--pb-section-px',       label: 'Section Padding X',  type: 'size', hint: 'e.g. 20px' },
      { key: '--pb-card-gap',         label: 'Card Gap',           type: 'size', hint: 'e.g. 16px' },
      { key: '--pb-card-padding',     label: 'Card Padding',       type: 'size', hint: 'e.g. 20px' },
      { key: '--pb-container-width',  label: 'Container Width',    type: 'size', hint: 'e.g. 1200px' },
    ],
  },
  {
    label: 'Animation',
    vars: [
      { key: '--pb-duration-fast', label: 'Fast Duration',   type: 'duration', hint: 'e.g. 0.15s' },
      { key: '--pb-duration-base', label: 'Base Duration',   type: 'duration', hint: 'e.g. 0.2s' },
      { key: '--pb-duration-slow', label: 'Slow Duration',   type: 'duration', hint: 'e.g. 0.4s' },
      { key: '--pb-easing',        label: 'Easing',          type: 'text',     hint: 'e.g. cubic-bezier(0.4,0,0.2,1)' },
      { key: '--pb-hero-min-height', label: 'Hero Min Height', type: 'size',   hint: 'e.g. 480px' },
    ],
  },
];

/* ─── Preview Component ─────────────────────────────────────── */

function ThemePreview({ vars }: { vars: Record<string, string> }) {
  const p  = (k: string, fb: string) => vars[k] ?? fb;

  return (
    <div style={{
      background:  p('--pb-bg-page', '#09090b'),
      color:       p('--pb-text-primary', '#f4f4f5'),
      borderRadius:'8px',
      overflow:    'hidden',
      border:      '1px solid rgba(255,255,255,0.1)',
      fontFamily:  p('--pb-font-body', 'system-ui, sans-serif'),
      fontSize:    '13px',
    }}>
      {/* Mock nav */}
      <div style={{
        background:  p('--pb-bg-header', p('--pb-bg-section', '#18181b')),
        borderBottom:`1px solid ${p('--pb-border', 'rgba(255,255,255,0.08)')}`,
        padding:     '10px 16px',
        display:     'flex',
        alignItems:  'center',
        justifyContent:'space-between',
      }}>
        <span style={{ fontWeight: 700, color: p('--pb-primary', '#7c3aed'), fontSize: '14px' }}>
          BrandName
        </span>
        <span style={{
          padding:     '5px 12px',
          borderRadius: p('--pb-radius-btn', '6px'),
          background:  p('--pb-btn-bg', p('--pb-primary', '#7c3aed')),
          color:       p('--pb-btn-text', '#fff'),
          fontWeight:  700,
          fontSize:    '12px',
        }}>
          View Partners
        </span>
      </div>

      {/* Mock hero */}
      <div style={{
        background:  `linear-gradient(180deg, ${p('--pb-bg-section', '#18181b')} 0%, ${p('--pb-bg-page', '#09090b')} 100%)`,
        padding:     '28px 16px',
        textAlign:   'center',
        borderBottom:`1px solid ${p('--pb-border', 'rgba(255,255,255,0.06)')}`,
      }}>
        <div style={{
          fontSize:      '18px',
          fontWeight:    p('--pb-font-weight-heading', '700'),
          fontFamily:    p('--pb-font-display', 'system-ui, sans-serif'),
          color:         p('--pb-text-primary', '#f4f4f5'),
          letterSpacing: p('--pb-letter-spacing-heading', '-0.02em'),
          marginBottom:  '6px',
        }}>
          Welcome to Our Platform
        </div>
        <div style={{ color: p('--pb-text-muted', '#71717a'), fontSize: '11px', marginBottom: '12px' }}>
          The best gaming destination
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <span style={{
            display:     'inline-block',
            padding:     '6px 14px',
            borderRadius: p('--pb-radius-btn', '6px'),
            background:  p('--pb-btn-bg', p('--pb-primary', '#7c3aed')),
            color:       p('--pb-btn-text', '#fff'),
            fontWeight:  700,
            fontSize:    '11px',
          }}>
            Join Now
          </span>
          <span style={{
            display:     'inline-block',
            padding:     '6px 14px',
            borderRadius: p('--pb-radius-btn', '6px'),
            border:      `1px solid ${p('--pb-btn-outline-color', p('--pb-primary', '#7c3aed'))}`,
            color:       p('--pb-btn-outline-color', p('--pb-primary', '#7c3aed')),
            fontWeight:  600,
            fontSize:    '11px',
          }}>
            View Partners
          </span>
        </div>
      </div>

      {/* Mock marquee */}
      <div style={{
        background:  p('--pb-bg-section', '#18181b'),
        padding:     '8px 16px',
        display:     'flex',
        gap:         '16px',
        overflow:    'hidden',
        borderBottom:`1px solid ${p('--pb-border', 'rgba(255,255,255,0.06)')}`,
      }}>
        {['Brand A', 'Brand B', 'Brand C', 'Brand D'].map(b => (
          <span key={b} style={{ color: p('--pb-text-muted', '#71717a'), fontSize: '11px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: p('--pb-primary', '#7c3aed'), display: 'inline-block' }} />
            {b}
          </span>
        ))}
      </div>

      {/* Mock cards */}
      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: p('--pb-card-gap', '16px') }}>
        {['Alpha Casino', 'Beta Gaming'].map(name => (
          <div key={name} style={{
            background:   p('--pb-bg-card', '#27272a'),
            border:       `1px solid ${p('--pb-border-card', 'rgba(255,255,255,0.06)')}`,
            borderRadius: p('--pb-radius-card', '12px'),
            padding:      '12px',
          }}>
            <div style={{
              background:   p('--pb-primary', '#7c3aed'),
              color:        '#fff',
              width:        '28px',
              height:       '28px',
              borderRadius: p('--pb-radius', '8px'),
              display:      'flex',
              alignItems:   'center',
              justifyContent:'center',
              fontWeight:   700,
              fontSize:     '12px',
              marginBottom: '6px',
            }}>
              {name.charAt(0)}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: p('--pb-text-primary', '#f4f4f5'), marginBottom: '2px' }}>
              {name}
            </div>
            <div style={{ fontSize: '10px', color: p('--pb-accent', '#f59e0b') }}>
              Welcome Bonus: 100%
            </div>
            <div style={{
              marginTop:    '8px',
              padding:      '5px',
              background:   p('--pb-btn-bg', p('--pb-primary', '#7c3aed')),
              color:        p('--pb-btn-text', '#fff'),
              borderRadius: p('--pb-radius-btn', '6px'),
              fontSize:     '10px',
              fontWeight:   700,
              textAlign:    'center',
            }}>
              Join Now
            </div>
          </div>
        ))}
      </div>

      {/* Mock footer */}
      <div style={{
        background:  p('--pb-bg-footer', p('--pb-bg-section', '#18181b')),
        borderTop:   `1px solid ${p('--pb-border', 'rgba(255,255,255,0.06)')}`,
        padding:     '12px 16px',
        textAlign:   'center',
        fontSize:    '10px',
        color:       p('--pb-text-muted', '#71717a'),
      }}>
        © 2025 BrandName · 18+ · Please gamble responsibly
      </div>
    </div>
  );
}

/* ─── Color Input ────────────────────────────────────────────── */

function isHexLike(v: string) {
  return /^#[0-9a-fA-F]{3,8}$/.test(v.trim());
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = isHexLike(value) ? value.trim() : '#888888';

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      <input
        type="color"
        value={hex}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '28px', height: '28px',
          padding: '2px', border: '1px solid #333',
          borderRadius: '4px', cursor: 'pointer',
          background: 'none', flexShrink: 0,
        }}
      />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="#rrggbb or rgba(...)"
        style={{
          flex: 1, padding: '6px 8px',
          background: '#1c1c1e', border: '1px solid #333',
          borderRadius: '6px', color: '#fff', fontSize: '12px',
          fontFamily: 'monospace',
        }}
      />
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */

type Props = { params: Promise<{ id: string }> };

interface ThemeData {
  id: number;
  name: string;
  slug: string;
  css_variables: Record<string, string>;
}

export default function ThemeEditorPage({ params }: Props) {
  const { id } = use(params);

  const [theme,     setTheme]     = useState<ThemeData | null>(null);
  const [vars,      setVars]      = useState<Record<string, string>>({});
  const [original,  setOriginal]  = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [showPreview, setShowPreview] = useState(true);

  /* Load theme */
  useEffect(() => {
    fetch(`/api/partner-builder/themes/${id}`)
      .then(r => r.json())
      .then(({ theme: t }) => {
        setTheme(t);
        setVars({ ...(t.css_variables ?? {}) });
        setOriginal({ ...(t.css_variables ?? {}) });
        setLoading(false);
      })
      .catch(() => { setError('Failed to load theme'); setLoading(false); });
  }, [id]);

  const setVar = useCallback((key: string, val: string) => {
    setVars(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleReset = useCallback(() => {
    setVars({ ...original });
    setSuccess('');
    setError('');
  }, [original]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/partner-builder/themes/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ css_variables: vars }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Save failed');
      } else {
        setOriginal({ ...vars });
        setSuccess('Theme saved successfully');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }, [id, vars]);

  const isDirty = JSON.stringify(vars) !== JSON.stringify(original);

  /* Render a single variable control */
  function renderControl(def: VarDef) {
    const val = vars[def.key] ?? '';
    switch (def.type) {
      case 'color':
        return <ColorInput key={def.key} value={val} onChange={v => setVar(def.key, v)} />;
      default:
        return (
          <input
            key={def.key}
            type="text"
            value={val}
            onChange={e => setVar(def.key, e.target.value)}
            placeholder={def.hint ?? ''}
            style={{
              width:      '100%',
              padding:    '6px 8px',
              background: '#1c1c1e',
              border:     '1px solid #333',
              borderRadius:'6px',
              color:      '#fff',
              fontSize:   '12px',
              fontFamily: def.type === 'font' || def.type === 'text' ? 'monospace' : 'inherit',
              boxSizing:  'border-box',
            }}
          />
        );
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
        Loading theme…
      </div>
    );
  }

  if (!theme) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
        Theme not found.{' '}
        <Link href="/website-builder/partner-builder/themes" style={{ color: '#6366f1' }}>
          Back to Themes
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '12px 20px',
        borderBottom:   '1px solid #222',
        background:     '#111',
        flexShrink:     0,
        gap:            '12px',
        flexWrap:       'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/website-builder/partner-builder/themes"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#888', textDecoration: 'none', fontSize: '13px' }}
          >
            <ArrowLeft size={14} /> Themes
          </Link>
          <span style={{ color: '#444' }}>/</span>
          <span style={{ fontWeight: 600, fontSize: '14px', color: '#fff' }}>{theme.name}</span>
          <span style={{ fontSize: '11px', color: '#555', fontFamily: 'monospace' }}>{theme.slug}</span>
          {isDirty && <span style={{ fontSize: '11px', color: '#f59e0b', background: '#1a1500', padding: '2px 6px', borderRadius: '4px' }}>Unsaved</span>}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setShowPreview(p => !p)}
            style={{
              display:    'flex', alignItems: 'center', gap: '6px',
              padding:    '7px 12px', borderRadius: '6px',
              background: '#1c1c1e', border: '1px solid #333',
              color: '#aaa', fontSize: '12px', cursor: 'pointer',
            }}
          >
            {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button
            onClick={handleReset}
            disabled={!isDirty}
            style={{
              display:    'flex', alignItems: 'center', gap: '6px',
              padding:    '7px 12px', borderRadius: '6px',
              background: isDirty ? '#1c1c1e' : '#111',
              border:     '1px solid #333',
              color:      isDirty ? '#aaa' : '#444',
              fontSize:   '12px', cursor: isDirty ? 'pointer' : 'not-allowed',
            }}
          >
            <RotateCcw size={13} /> Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            style={{
              display:    'flex', alignItems: 'center', gap: '6px',
              padding:    '7px 14px', borderRadius: '6px',
              background: isDirty ? '#6366f1' : '#222',
              border:     'none',
              color:      isDirty ? '#fff' : '#555',
              fontSize:   '12px', fontWeight: 600, cursor: isDirty ? 'pointer' : 'not-allowed',
            }}
          >
            <Save size={13} /> {saving ? 'Saving…' : 'Save Theme'}
          </button>
        </div>
      </div>

      {/* Status banners */}
      {error && (
        <div style={{ background: '#2d0000', borderBottom: '1px solid #5a0000', padding: '8px 20px', fontSize: '13px', color: '#ef4444' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: '#001a00', borderBottom: '1px solid #006600', padding: '8px 20px', fontSize: '13px', color: '#4ade80' }}>
          {success}
        </div>
      )}

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: variable editor */}
        <div style={{
          width:      '380px',
          flexShrink: 0,
          overflowY:  'auto',
          borderRight:'1px solid #222',
          background: '#0f0f0f',
        }}>
          {GROUPS.map(group => (
            <div key={group.label} style={{ borderBottom: '1px solid #1a1a1a', padding: '16px' }}>
              <div style={{
                fontSize:      '10px',
                fontWeight:    700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color:         '#555',
                marginBottom:  '12px',
              }}>
                {group.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {group.vars.map(def => (
                  <div key={def.key}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '4px' }}>
                      {def.label}
                      <span style={{ marginLeft: '6px', fontFamily: 'monospace', fontSize: '10px', color: '#444' }}>
                        {def.key}
                      </span>
                    </label>
                    {renderControl(def)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right: live preview */}
        {showPreview && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#0a0a0a' }}>
            <div style={{ maxWidth: '480px', margin: '0 auto' }}>
              <div style={{ fontSize: '11px', color: '#444', marginBottom: '12px', textAlign: 'center' }}>
                LIVE PREVIEW · Updates as you edit
              </div>
              <ThemePreview vars={vars} />

              {/* CSS output */}
              <div style={{ marginTop: '24px' }}>
                <div style={{ fontSize: '10px', color: '#444', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  CSS Variables Output
                </div>
                <pre style={{
                  background:   '#111',
                  border:       '1px solid #222',
                  borderRadius: '8px',
                  padding:      '12px',
                  fontSize:     '10px',
                  color:        '#6a9955',
                  overflow:     'auto',
                  maxHeight:    '300px',
                  lineHeight:   '1.6',
                  whiteSpace:   'pre-wrap',
                  wordBreak:    'break-all',
                }}>
                  {`:root {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
