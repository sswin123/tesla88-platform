'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Check, Loader2, Search, Pencil } from 'lucide-react';

type Theme = {
  id: number;
  name: string;
  slug: string;
  css_variables: Record<string, string>;
  is_active: boolean;
};

/* Canonical label map — aligned with M5-D theme-defaults.ts */
const CSS_VAR_LABELS: Record<string, string> = {
  '--pb-primary':               'Primary',
  '--pb-secondary':             'Secondary',
  '--pb-accent':                'Accent',
  '--pb-bg-page':               'Page BG',
  '--pb-bg-section':            'Section BG',
  '--pb-bg-section-alt':        'Section Alt BG',
  '--pb-bg-card':               'Card BG',
  '--pb-bg-card-hover':         'Card Hover BG',
  '--pb-bg-header':             'Header BG',
  '--pb-bg-footer':             'Footer BG',
  '--pb-text-primary':          'Primary Text',
  '--pb-text-secondary':        'Secondary Text',
  '--pb-text-muted':            'Muted Text',
  '--pb-border':                'Border',
  '--pb-border-card':           'Card Border',
  '--pb-btn-bg':                'Button BG',
  '--pb-btn-text':              'Button Text',
  '--pb-btn-hover':             'Button Hover',
  '--pb-btn-outline-color':     'Outline Button',
  '--pb-shadow':                'Shadow',
  '--pb-shadow-card':           'Card Shadow',
  '--pb-shadow-glow':           'Glow',
  '--pb-radius':                'Base Radius',
  '--pb-radius-card':           'Card Radius',
  '--pb-radius-btn':            'Button Radius',
  '--pb-radius-lg':             'Large Radius',
  '--pb-font-display':          'Display Font',
  '--pb-font-body':             'Body Font',
  '--pb-font-size-base':        'Base Font Size',
  '--pb-font-weight-heading':   'Heading Weight',
  '--pb-font-weight-body':      'Body Weight',
  '--pb-line-height':           'Line Height',
  '--pb-letter-spacing-heading':'Heading Tracking',
  '--pb-section-py':            'Section Padding Y',
  '--pb-section-px':            'Section Padding X',
  '--pb-card-gap':              'Card Gap',
  '--pb-card-padding':          'Card Padding',
  '--pb-container-width':       'Container Width',
  '--pb-duration-fast':         'Fast Duration',
  '--pb-duration-base':         'Base Duration',
  '--pb-duration-slow':         'Slow Duration',
  '--pb-easing':                'Easing',
  '--pb-hero-min-height':       'Hero Min Height',
};

/* Color variables — show a swatch; others are text */
const COLOR_KEYS = new Set([
  '--pb-primary','--pb-secondary','--pb-accent',
  '--pb-bg-page','--pb-bg-section','--pb-bg-section-alt','--pb-bg-card','--pb-bg-card-hover',
  '--pb-bg-header','--pb-bg-footer',
  '--pb-text-primary','--pb-text-secondary','--pb-text-muted',
  '--pb-btn-bg','--pb-btn-text','--pb-btn-hover','--pb-btn-outline-color',
]);

export default function ThemeGalleryPage() {
  const [themes,   setThemes]   = useState<Theme[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/partner-builder/themes')
      .then(r => r.json())
      .then(data => setThemes(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = themes.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedTheme = themes.find(t => t.id === selected);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/website-builder/partner-builder" className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-zinc-50">Theme Gallery</h1>
          <p className="text-sm text-zinc-400">{themes.length} color themes · click a theme to inspect</p>
        </div>
        <Link
          href="/website-builder/partner-builder/new"
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          + New Site
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search themes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
        />
      </div>

      <div className="flex gap-6">
        {/* Theme Grid */}
        <div className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(t => {
                const vars       = t.css_variables ?? {};
                const bg         = vars['--pb-bg-page']    ?? '#09090b';
                const surface    = vars['--pb-bg-section'] ?? '#18181b';
                const primary    = vars['--pb-primary']    ?? '#7c3aed';
                const secondary  = vars['--pb-secondary']  ?? '#a855f7';
                const accent     = vars['--pb-accent']     ?? '#f59e0b';
                const cardBg     = vars['--pb-bg-card']    ?? '#27272a';
                const btnBg      = vars['--pb-btn-bg']     ?? primary;
                const btnText    = vars['--pb-btn-text']   ?? '#fff';
                const textPrimary = vars['--pb-text-primary'] ?? '#f4f4f5';
                const isSelected = selected === t.id;

                return (
                  <div
                    key={t.id}
                    onClick={() => setSelected(isSelected ? null : t.id)}
                    className={`cursor-pointer rounded-xl overflow-hidden border transition-all hover:shadow-xl hover:shadow-black/30 ${
                      isSelected ? 'border-violet-500 ring-1 ring-violet-500/30' : 'border-zinc-800 hover:border-zinc-700'
                    }`}
                    style={{ background: bg }}
                  >
                    {/* 5-color preview strip */}
                    <div className="flex h-16">
                      <div className="flex-1" style={{ background: bg }} />
                      <div className="w-10" style={{ background: surface }} />
                      <div className="w-10" style={{ background: primary }} />
                      <div className="w-8"  style={{ background: secondary }} />
                      <div className="w-6"  style={{ background: accent }} />
                    </div>

                    {/* Card info + mini mockup */}
                    <div className="p-3" style={{ background: bg, borderTop: `1px solid ${primary}25` }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold" style={{ color: textPrimary }}>{t.name}</div>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Mini site chrome */}
                      <div className="rounded overflow-hidden mb-2" style={{ background: surface, border: `1px solid ${primary}30` }}>
                        <div className="h-3 flex items-center px-1.5 gap-1" style={{ background: vars['--pb-bg-header'] ?? surface }}>
                          <div className="w-2 h-1 rounded-sm" style={{ background: primary }} />
                          <div className="flex-1" />
                          <div className="w-5 h-1.5 rounded-sm" style={{ background: btnBg }} />
                        </div>
                        <div className="p-1.5 space-y-1">
                          <div className="h-1 rounded-sm w-3/4" style={{ background: `${primary}40` }} />
                          <div className="flex gap-1">
                            {[1, 2].map(i => (
                              <div key={i} className="flex-1 h-3 rounded" style={{ background: cardBg, border: `1px solid ${primary}20` }} />
                            ))}
                          </div>
                          <div className="h-1.5 rounded" style={{ background: btnBg }} />
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <Link
                          href={`/website-builder/partner-builder/new`}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 text-center py-1.5 text-xs font-medium rounded-lg transition-colors"
                          style={{ background: btnBg, color: btnText }}
                        >
                          Use Theme
                        </Link>
                        <Link
                          href={`/website-builder/partner-builder/themes/${t.id}`}
                          onClick={e => e.stopPropagation()}
                          title="Edit theme"
                          className="flex items-center justify-center w-8 rounded-lg border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedTheme && (
          <div className="w-64 flex-shrink-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sticky top-4 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-zinc-100">{selectedTheme.name}</div>
                  <div className="text-xs text-zinc-600 font-mono mt-0.5">{selectedTheme.slug}</div>
                </div>
                <Link
                  href={`/website-builder/partner-builder/themes/${selectedTheme.id}`}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs transition-colors flex-shrink-0"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </Link>
              </div>

              {/* Variable list */}
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                <div className="text-xs font-medium text-zinc-400 mb-2">
                  CSS Variables ({Object.keys(selectedTheme.css_variables ?? {}).length})
                </div>
                {Object.entries(selectedTheme.css_variables ?? {}).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 min-w-0">
                    {COLOR_KEYS.has(k) ? (
                      <div
                        className="w-4 h-4 rounded-sm flex-shrink-0 border border-zinc-700"
                        style={{ background: v }}
                      />
                    ) : (
                      <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                      </div>
                    )}
                    <span className="text-xs text-zinc-500 flex-1 truncate">
                      {CSS_VAR_LABELS[k] ?? k.replace('--pb-', '')}
                    </span>
                    <span className="text-xs text-zinc-600 font-mono truncate max-w-[80px]" title={v}>{v}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <Link
                  href="/website-builder/partner-builder/new"
                  className="flex-1 text-center py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Use Theme
                </Link>
                <Link
                  href={`/website-builder/partner-builder/themes/${selectedTheme.id}`}
                  className="flex items-center gap-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
