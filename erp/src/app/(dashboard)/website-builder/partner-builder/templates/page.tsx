'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, LayoutTemplate, Search, Check, ExternalLink, Loader2 } from 'lucide-react';

type Template = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  preview_image_url: string | null;
  is_active: boolean;
  layout_json: Record<string, unknown> | null;
};

const CATEGORIES = ['all', 'luxury', 'casino', 'affiliate', 'modern', 'telegram'];

export default function TemplateGalleryPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('all');
  const [selected, setSelected]   = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/partner-builder/templates')
      .then(r => r.json())
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = templates.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'all' || (t.category ?? '').toLowerCase().includes(category);
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/website-builder/partner-builder" className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-zinc-50">Template Gallery</h1>
          <p className="text-sm text-zinc-400">{templates.length} professional templates</p>
        </div>
        <Link
          href="/website-builder/partner-builder/new"
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Use a Template
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search templates…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                category === c
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-16 text-center">
          <LayoutTemplate className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-400">No templates found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(t => {
            const isSelected = selected === t.id;
            return (
              <div
                key={t.id}
                onClick={() => setSelected(isSelected ? null : t.id)}
                className={`group cursor-pointer bg-zinc-900 border rounded-xl overflow-hidden transition-all hover:shadow-xl hover:shadow-black/30 ${
                  isSelected ? 'border-violet-500 ring-1 ring-violet-500/30' : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Preview */}
                <div className="h-36 bg-gradient-to-br from-zinc-800 to-zinc-900 relative flex items-center justify-center overflow-hidden border-b border-zinc-800">
                  {t.preview_image_url ? (
                    <img src={t.preview_image_url} alt={t.name} className="w-full h-full object-cover" />
                  ) : (
                    <TemplatePreviewSVG slug={t.slug} />
                  )}
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  {t.category && (
                    <div className="absolute bottom-2 left-2 text-xs px-2 py-0.5 rounded-full bg-zinc-900/80 text-zinc-400 capitalize">
                      {t.category}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="font-semibold text-sm text-zinc-100">{t.name}</div>
                  {t.description && (
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{t.description}</p>
                  )}

                  {/* Layout tags */}
                  {t.layout_json && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(t.layout_json.defaultSections as string[] | undefined)?.slice(0, 3).map(s => (
                        <span key={s} className="text-xs px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-500 capitalize">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <Link
                      href="/website-builder/partner-builder/new"
                      onClick={e => e.stopPropagation()}
                      className="flex-1 text-center py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
                    >
                      Use Template
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemplatePreviewSVG({ slug }: { slug: string }) {
  const COLOR_MAP: Record<string, [string, string]> = {
    'luxury-black-gold': ['#1a1200', '#d4af37'],
    'mr-group-green':    ['#021a0c', '#22c55e'],
    'casino-neon':       ['#07001a', '#a855f7'],
    'premium-white':     ['#f8fafc', '#0ea5e9'],
    'modern-gradient':   ['#0f0c29', '#6366f1'],
    'telegram-focus':    ['#001830', '#0088cc'],
    'blue-ocean':        ['#001124', '#3b82f6'],
    'gaming-expo':       ['#0a0a0a', '#ef4444'],
  };
  const colors = Object.entries(COLOR_MAP).find(([k]) => slug.includes(k.split('-')[0]))?.[1] ?? ['#18181b', '#7c3aed'];
  return (
    <div className="w-full h-full flex flex-col" style={{ background: colors[0] }}>
      <div className="h-1.5 w-full" style={{ background: colors[1] }} />
      <div className="flex-1 flex flex-col items-center justify-center gap-1.5 px-4">
        <div className="h-2 rounded-full w-16" style={{ background: `${colors[1]}99` }} />
        <div className="h-1 rounded-full w-24" style={{ background: `${colors[1]}50` }} />
        <div className="mt-1 flex gap-1">
          {[1,2,3].map(i => (
            <div key={i} className="w-10 h-6 rounded" style={{ background: `${colors[1]}25`, border: `1px solid ${colors[1]}40` }} />
          ))}
        </div>
      </div>
      <div className="h-1 w-full" style={{ background: `${colors[1]}40` }} />
    </div>
  );
}
