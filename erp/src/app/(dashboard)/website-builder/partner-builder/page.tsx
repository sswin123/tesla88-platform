'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Handshake, Plus, LayoutTemplate, Palette, Globe, Eye,
  TrendingUp, Clock, ArrowRight, ExternalLink, CheckCircle2,
  AlertCircle, Pencil, Copy, Trash2, MoreVertical,
} from 'lucide-react';

type Site = {
  id: number;
  name: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  template_id: number | null;
  theme_id: number | null;
  updated_at: string;
};

type Stats = {
  total: number;
  published: number;
  draft: number;
  templates: number;
  themes: number;
};

export default function PartnerBuilderDashboard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, published: 0, draft: 0, templates: 0, themes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/partner-builder/sites').then(r => r.json()),
      fetch('/api/partner-builder/templates').then(r => r.json()),
      fetch('/api/partner-builder/themes').then(r => r.json()),
    ]).then(([sitesData, templatesData, themesData]) => {
      const allSites: Site[] = Array.isArray(sitesData) ? sitesData : [];
      setSites(allSites.slice(0, 5));
      setStats({
        total:     allSites.length,
        published: allSites.filter(s => s.status === 'PUBLISHED').length,
        draft:     allSites.filter(s => s.status === 'DRAFT').length,
        templates: Array.isArray(templatesData) ? templatesData.length : 0,
        themes:    Array.isArray(themesData) ? themesData.length : 0,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const statusColor = (s: string) =>
    s === 'PUBLISHED' ? 'bg-emerald-500/15 text-emerald-400' :
    s === 'DRAFT'     ? 'bg-amber-500/15 text-amber-400' :
                        'bg-zinc-500/15 text-zinc-400';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Handshake className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-50">Partner Builder</h1>
            <p className="text-sm text-zinc-400">Create & manage partner landing pages</p>
          </div>
        </div>
        <Link
          href="/website-builder/partner-builder/new"
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-violet-900/30"
        >
          <Plus className="w-4 h-4" />
          Create Partner Site
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Sites',    value: stats.total,     icon: Globe,          color: 'text-violet-400', bg: 'bg-violet-500/10' },
          { label: 'Published',      value: stats.published, icon: CheckCircle2,   color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Draft',          value: stats.draft,     icon: AlertCircle,    color: 'text-amber-400',  bg: 'bg-amber-500/10'  },
          { label: 'Templates',      value: stats.templates, icon: LayoutTemplate, color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
          { label: 'Themes',         value: stats.themes,    icon: Palette,        color: 'text-pink-400',   bg: 'bg-pink-500/10'   },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
            <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-50">
                {loading ? '—' : s.value}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              href: '/website-builder/partner-builder/new',
              icon: Plus, color: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
              label: 'New Partner Site',
              desc: 'Start with a template wizard',
            },
            {
              href: '/website-builder/partner-builder/templates',
              icon: LayoutTemplate, color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
              label: 'Template Gallery',
              desc: '12 professional templates',
            },
            {
              href: '/website-builder/partner-builder/themes',
              icon: Palette, color: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
              label: 'Theme Gallery',
              desc: '8 color themes available',
            },
          ].map(a => (
            <Link
              key={a.href}
              href={a.href}
              className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center gap-4 transition-all"
            >
              <div className={`w-10 h-10 rounded-lg border ${a.color} flex items-center justify-center flex-shrink-0`}>
                <a.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-zinc-200 group-hover:text-zinc-50 text-sm">{a.label}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{a.desc}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Sites */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Recent Sites</h2>
          <Link
            href="/website-builder/partner-builder/sites"
            className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-16 animate-pulse" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-10 text-center">
            <Handshake className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400 font-medium">No partner sites yet</p>
            <p className="text-sm text-zinc-600 mt-1">Create your first partner landing page</p>
            <Link
              href="/website-builder/partner-builder/new"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Site
            </Link>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {sites.map((site, i) => (
              <div
                key={site.id}
                className={`flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/50 transition-colors ${
                  i < sites.length - 1 ? 'border-b border-zinc-800' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-4 h-4 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-zinc-200 text-sm truncate">{site.name}</div>
                  <div className="text-xs text-zinc-500">/{site.slug}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(site.status)}`}>
                  {site.status.toLowerCase()}
                </span>
                <div className="flex items-center gap-1 text-xs text-zinc-600">
                  <Clock className="w-3 h-3" />
                  {new Date(site.updated_at).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    href={`/website-builder/partner-builder/${site.id}`}
                    className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                  {site.status === 'PUBLISHED' && (
                    <a
                      href={`/p/${site.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="bg-gradient-to-br from-violet-900/20 to-indigo-900/20 border border-violet-500/20 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-violet-200 text-sm">Getting Started</div>
            <p className="text-xs text-violet-300/70 mt-1 leading-relaxed">
              Partner Builder lets you create branded landing pages for your partners and affiliates.
              Choose a template, pick a theme, add partner cards, and publish in minutes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
