'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Palette, Check, Loader2, Search } from 'lucide-react';

type Theme = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  css_variables: Record<string, string>;
  is_active: boolean;
};

const CSS_VAR_LABELS: Record<string, string> = {
  '--pb-bg':             'Background',
  '--pb-surface':        'Surface',
  '--pb-primary':        'Primary',
  '--pb-secondary':      'Secondary',
  '--pb-accent':         'Accent',
  '--pb-text':           'Text',
  '--pb-text-muted':     'Muted Text',
  '--pb-border':         'Border',
  '--pb-card-bg':        'Card BG',
  '--pb-card-border':    'Card Border',
  '--pb-btn-primary-bg': 'Button BG',
  '--pb-btn-primary-fg': 'Button Text',
  '--pb-header-bg':      'Header BG',
  '--pb-footer-bg':      'Footer BG',
};

export default function ThemeGalleryPage() {
  const [themes, setThemes]   = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/partner-builder/themes')
      .then(r => r.json())
      .then(data => setThemes(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = themes.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.description ?? '').toLowerCase().includes(search.toLowerCase())
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
          <p className="text-sm text-zinc-400">{themes.length} color themes</p>
        </div>
        <Link
          href="/website-builder/partner-builder/new"
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Use a Theme
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
                const vars = t.css_variables ?? {};
                const bg       = vars['--pb-bg']      ?? '#09090b';
                const surface  = vars['--pb-surface']  ?? '#18181b';
                const primary  = vars['--pb-primary']  ?? '#7c3aed';
                const secondary = vars['--pb-secondary'] ?? '#a855f7';
                const accent   = vars['--pb-accent']   ?? '#f59e0b';
                const text     = vars['--pb-text']     ?? '#f4f4f5';
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
                    {/* Color Preview Strip */}
                    <div className="flex h-20">
                      <div className="flex-1" style={{ background: bg }} />
                      <div className="w-10" style={{ background: surface }} />
                      <div className="w-10" style={{ background: primary }} />
                      <div className="w-8" style={{ background: secondary }} />
                      <div className="w-6" style={{ background: accent }} />
                    </div>

                    {/* Mini mock */}
                    <div className="p-3" style={{ background: bg, borderTop: `1px solid ${primary}25` }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold" style={{ color: text }}>{t.name}</div>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>
                      {/* Simulated site chrome */}
                      <div className="rounded overflow-hidden" style={{ background: surface, border: `1px solid ${primary}30` }}>
                        <div className="h-3 flex items-center px-1.5 gap-1" style={{ background: vars['--pb-header-bg'] ?? primary }}>
                          <div className="w-2 h-1 rounded-sm bg-white/30" />
                          <div className="w-4 h-1 rounded-sm bg-white/20" />
                        </div>
                        <div className="p-1.5 space-y-1">
                          <div className="h-1 rounded-sm w-3/4" style={{ background: `${primary}40` }} />
                          <div className="flex gap-1">
                            {[1,2].map(i => (
                              <div key={i} className="flex-1 h-3 rounded" style={{ background: vars['--pb-card-bg'] ?? `${primary}15`, border: `1px solid ${primary}20` }} />
                            ))}
                          </div>
                          <div className="h-2 rounded" style={{ background: vars['--pb-btn-primary-bg'] ?? primary }} />
                        </div>
                      </div>

                      <Link
                        href="/website-builder/partner-builder/new"
                        onClick={e => e.stopPropagation()}
                        className="mt-3 block text-center py-1.5 text-xs font-medium rounded-lg transition-colors"
                        style={{ background: primary, color: vars['--pb-btn-primary-fg'] ?? '#fff' }}
                      >
                        Use Theme
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedTheme && (
          <div className="w-64 flex-shrink-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sticky top-4 space-y-4">
              <div>
                <div className="font-semibold text-zinc-100">{selectedTheme.name}</div>
                {selectedTheme.description && (
                  <p className="text-xs text-zinc-500 mt-1">{selectedTheme.description}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-zinc-400 mb-2">CSS Variables</div>
                {Object.entries(selectedTheme.css_variables ?? {}).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-sm flex-shrink-0 border border-zinc-700" style={{ background: v }} />
                    <span className="text-xs text-zinc-500 flex-1 truncate">{CSS_VAR_LABELS[k] ?? k}</span>
                    <span className="text-xs text-zinc-600 font-mono">{v}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/website-builder/partner-builder/new"
                className="block w-full text-center py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Use This Theme
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
