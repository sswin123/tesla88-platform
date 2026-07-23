'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, Save, Globe, Eye, EyeOff, Rocket, Loader2,
  LayoutTemplate, Palette, Layers, CreditCard, Settings,
  Plus, Trash2, GripVertical, ChevronUp, ChevronDown,
  ExternalLink, Check, AlertCircle, X,
  ToggleLeft, ToggleRight,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────── */
type Site = {
  id: number; name: string; slug: string;
  status: 'draft' | 'published' | 'archived';
  logo_url: string | null;
  template_id: number | null; theme_id: number | null;
  meta_title: string | null; meta_description: string | null;
  updated_at: string;
};
type Template = { id: number; name: string; slug: string; description: string | null };
type Theme    = { id: number; name: string; slug: string; css_variables: Record<string, string> };
type Section  = { id: number; section_type: string; is_enabled: boolean; sort_order: number; content_json: Record<string, unknown> };
type Card     = {
  id: number; brand_name: string; subtitle: string | null;
  description: string | null; badge: string | null;
  welcome_bonus: string | null; free_credit: string | null;
  commission: string | null; promo_text: string | null;
  telegram_url: string | null; whatsapp_url: string | null; website_url: string | null;
  button_text: string; button_color: string | null; button_style: string;
  sort_order: number; is_enabled: boolean;
};

type Tab = 'general' | 'template' | 'theme' | 'sections' | 'cards' | 'seo' | 'publish';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'general',  label: 'General',  icon: Settings     },
  { id: 'template', label: 'Template', icon: LayoutTemplate },
  { id: 'theme',    label: 'Theme',    icon: Palette      },
  { id: 'sections', label: 'Sections', icon: Layers       },
  { id: 'cards',    label: 'Cards',    icon: CreditCard   },
  { id: 'seo',      label: 'SEO',      icon: Globe        },
  { id: 'publish',  label: 'Publish',  icon: Rocket       },
];

const SECTION_TYPES = ['hero', 'marquee', 'partners', 'promotions', 'contact', 'footer'];

function cssVar(vars: Record<string, string>, key: string, fallback = '#888') {
  return vars[key] ?? fallback;
}

/* ─── Component ──────────────────────────────────────────── */
export default function SiteEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const siteId = Number(id);

  const [tab, setTab]         = useState<Tab>('general');
  const [site, setSite]       = useState<Site | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [themes, setThemes]   = useState<Theme[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [cards, setCards]     = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [msg, setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [editCard, setEditCard] = useState<number | null>(null);

  /* Local editable copy of site fields */
  const [draft, setDraft] = useState<Partial<Site>>({});

  const toast = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [siteR, templatesR, themesR, sectionsR, cardsR] = await Promise.all([
        fetch(`/api/partner-builder/sites/${siteId}`).then(r => r.json()),
        fetch('/api/partner-builder/templates').then(r => r.json()),
        fetch('/api/partner-builder/themes').then(r => r.json()),
        fetch(`/api/partner-builder/sites/${siteId}/sections`).then(r => r.json()),
        fetch(`/api/partner-builder/sites/${siteId}/cards`).then(r => r.json()),
      ]);
      setSite(siteR);
      setDraft(siteR);
      setTemplates(Array.isArray(templatesR) ? templatesR : []);
      setThemes(Array.isArray(themesR) ? themesR : []);
      setSections(Array.isArray(sectionsR) ? sectionsR.sort((a: Section, b: Section) => a.sort_order - b.sort_order) : []);
      setCards(Array.isArray(cardsR) ? cardsR.sort((a: Card, b: Card) => a.sort_order - b.sort_order) : []);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  /* ── Save general/template/theme/SEO ── */
  async function saveSite() {
    setSaving(true);
    try {
      const r = await fetch(`/api/partner-builder/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:             draft.name,
          slug:             draft.slug,
          logo_url:         draft.logo_url,
          template_id:      draft.template_id,
          theme_id:         draft.theme_id,
          meta_title:       draft.meta_title,
          meta_description: draft.meta_description,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Failed');
      const updated = await r.json();
      setSite(updated);
      setDraft(updated);
      toast('ok', 'Changes saved.');
    } catch (e) {
      toast('err', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  /* ── Publish ── */
  async function publishSite() {
    setPublishing(true);
    try {
      const r = await fetch(`/api/partner-builder/sites/${siteId}/publish`, { method: 'POST' });
      if (!r.ok) throw new Error();
      await load();
      toast('ok', 'Site published successfully!');
    } catch {
      toast('err', 'Publish failed.');
    } finally {
      setPublishing(false);
    }
  }

  /* ── Section controls ── */
  async function addSection(type: string) {
    const maxOrder = sections.reduce((m, s) => Math.max(m, s.sort_order), -1);
    const r = await fetch(`/api/partner-builder/sites/${siteId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section_type: type, sort_order: maxOrder + 1 }),
    });
    if (r.ok) {
      const s = await r.json();
      setSections(prev => [...prev, s]);
    }
  }

  async function toggleSection(section: Section) {
    const r = await fetch(`/api/partner-builder/sections/${section.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: !section.is_enabled }),
    });
    if (r.ok) {
      setSections(prev => prev.map(s => s.id === section.id ? { ...s, is_enabled: !s.is_enabled } : s));
    }
  }

  async function deleteSection(id: number) {
    if (!confirm('Remove this section?')) return;
    const r = await fetch(`/api/partner-builder/sections/${id}`, { method: 'DELETE' });
    if (r.ok) setSections(prev => prev.filter(s => s.id !== id));
  }

  async function moveSectionUp(index: number) {
    if (index === 0) return;
    const newSections = [...sections];
    [newSections[index - 1], newSections[index]] = [newSections[index], newSections[index - 1]];
    const items = newSections.map((s, i) => ({ id: s.id, sort_order: i }));
    await fetch(`/api/partner-builder/sites/${siteId}/sections/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    setSections(newSections.map((s, i) => ({ ...s, sort_order: i })));
  }

  async function moveSectionDown(index: number) {
    if (index === sections.length - 1) return;
    const newSections = [...sections];
    [newSections[index], newSections[index + 1]] = [newSections[index + 1], newSections[index]];
    const items = newSections.map((s, i) => ({ id: s.id, sort_order: i }));
    await fetch(`/api/partner-builder/sites/${siteId}/sections/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    setSections(newSections.map((s, i) => ({ ...s, sort_order: i })));
  }

  /* ── Card controls ── */
  async function addCard() {
    const maxOrder = cards.reduce((m, c) => Math.max(m, c.sort_order), -1);
    const r = await fetch(`/api/partner-builder/sites/${siteId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_name: 'New Partner', sort_order: maxOrder + 1 }),
    });
    if (r.ok) {
      const c = await r.json();
      setCards(prev => [...prev, c]);
      setEditCard(c.id);
    }
  }

  async function saveCard(card: Card) {
    const r = await fetch(`/api/partner-builder/cards/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
    if (r.ok) {
      const updated = await r.json();
      setCards(prev => prev.map(c => c.id === card.id ? updated : c));
      setEditCard(null);
      toast('ok', 'Card saved.');
    }
  }

  async function deleteCard(id: number) {
    if (!confirm('Delete this card?')) return;
    const r = await fetch(`/api/partner-builder/cards/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setCards(prev => prev.filter(c => c.id !== id));
      if (editCard === id) setEditCard(null);
    }
  }

  async function moveCardUp(index: number) {
    if (index === 0) return;
    const newCards = [...cards];
    [newCards[index - 1], newCards[index]] = [newCards[index], newCards[index - 1]];
    const items = newCards.map((c, i) => ({ id: c.id, sort_order: i }));
    await fetch(`/api/partner-builder/sites/${siteId}/cards/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    setCards(newCards.map((c, i) => ({ ...c, sort_order: i })));
  }

  async function moveCardDown(index: number) {
    if (index === cards.length - 1) return;
    const newCards = [...cards];
    [newCards[index], newCards[index + 1]] = [newCards[index + 1], newCards[index]];
    const items = newCards.map((c, i) => ({ id: c.id, sort_order: i }));
    await fetch(`/api/partner-builder/sites/${siteId}/cards/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    setCards(newCards.map((c, i) => ({ ...c, sort_order: i })));
  }

  const selectedTheme    = themes.find(t => t.id === (draft.theme_id ?? site?.theme_id));
  const selectedTemplate = templates.find(t => t.id === (draft.template_id ?? site?.template_id));

  /* ─── Loading ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        Site not found.{' '}
        <Link href="/website-builder/partner-builder" className="text-violet-400 hover:underline ml-2">Go back</Link>
      </div>
    );
  }

  /* ─── Render ─────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 flex-shrink-0">
        <Link href="/website-builder/partner-builder" className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-zinc-200 truncate">{site.name}</h1>
          <span className="text-xs text-zinc-500">/p/{site.slug}</span>
        </div>

        {/* Status badge */}
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
          site.status === 'published' ? 'bg-emerald-500/15 text-emerald-400' :
          site.status === 'draft'     ? 'bg-amber-500/15 text-amber-400'    :
                                        'bg-zinc-500/15 text-zinc-400'
        }`}>
          {site.status}
        </span>

        {site.status === 'published' && (
          <a
            href={`/p/${site.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="View live site"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}

        <button
          onClick={() => setPreviewOpen(v => !v)}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
          title={previewOpen ? 'Hide preview' : 'Show preview'}
        >
          {previewOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>

        <button
          onClick={saveSite}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 text-white rounded-lg text-xs font-medium transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>

      {/* Toast */}
      {msg && (
        <div className={`px-4 py-2.5 text-xs font-medium flex items-center gap-2 ${
          msg.type === 'ok'
            ? 'bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/15 border-b border-red-500/30 text-red-300'
        }`}>
          {msg.type === 'ok' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {msg.text}
        </div>
      )}

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Editor Panel */}
        <div className={`flex flex-col ${previewOpen ? 'w-1/2 lg:w-2/5' : 'w-full'} border-r border-zinc-800 overflow-hidden transition-all`}>
          {/* Tab Bar */}
          <div className="flex border-b border-zinc-800 overflow-x-auto flex-shrink-0">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-violet-500 text-violet-300 bg-violet-500/5'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── General Tab ── */}
            {tab === 'general' && (
              <div className="space-y-4">
                <Field label="Site Name">
                  <input
                    type="text"
                    value={draft.name ?? ''}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none transition-colors"
                  />
                </Field>
                <Field label="URL Slug">
                  <div className="flex items-center">
                    <span className="bg-zinc-800 border border-r-0 border-zinc-700 rounded-l-lg px-2.5 py-2 text-xs text-zinc-500">/p/</span>
                    <input
                      type="text"
                      value={draft.slug ?? ''}
                      onChange={e => setDraft(d => ({ ...d, slug: e.target.value }))}
                      className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-r-lg px-3 py-2 text-sm text-zinc-200 outline-none transition-colors"
                    />
                  </div>
                </Field>
                <Field label="Logo URL">
                  <input
                    type="text"
                    placeholder="https://..."
                    value={draft.logo_url ?? ''}
                    onChange={e => setDraft(d => ({ ...d, logo_url: e.target.value }))}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors"
                  />
                </Field>
              </div>
            )}

            {/* ── Template Tab ── */}
            {tab === 'template' && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500">Changing the template will change the layout of your site. Your content is preserved.</p>
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setDraft(d => ({ ...d, template_id: t.id }))}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      (draft.template_id ?? site.template_id) === t.id
                        ? 'bg-violet-600/15 border-violet-500'
                        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-medium text-sm text-zinc-200">{t.name}</div>
                    {t.description && <div className="text-xs text-zinc-500 mt-0.5">{t.description}</div>}
                    {(draft.template_id ?? site.template_id) === t.id && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-violet-400">
                        <Check className="w-3 h-3" /> Active
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* ── Theme Tab ── */}
            {tab === 'theme' && (
              <div className="space-y-3">
                {themes.map(t => {
                  const vars     = t.css_variables ?? {};
                  const primary  = cssVar(vars, '--pb-primary');
                  const secondary = cssVar(vars, '--pb-secondary');
                  const accent   = cssVar(vars, '--pb-accent');
                  const bg       = cssVar(vars, '--pb-bg', '#18181b');
                  const active   = (draft.theme_id ?? site.theme_id) === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setDraft(d => ({ ...d, theme_id: t.id }))}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        active ? 'bg-violet-600/15 border-violet-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="h-10 rounded-lg mb-2 overflow-hidden flex">
                        <div className="flex-1" style={{ background: bg }} />
                        <div className="w-6" style={{ background: primary }} />
                        <div className="w-6" style={{ background: secondary }} />
                        <div className="w-4" style={{ background: accent }} />
                      </div>
                      <div className="font-medium text-sm text-zinc-200">{t.name}</div>
                      {active && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-violet-400">
                          <Check className="w-3 h-3" /> Active
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Sections Tab ── */}
            {tab === 'sections' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500">{sections.length} section{sections.length !== 1 ? 's' : ''}</p>
                  <div className="flex gap-1">
                    {SECTION_TYPES.filter(t => !sections.some(s => s.section_type === t)).map(t => (
                      <button
                        key={t}
                        onClick={() => addSection(t)}
                        className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors capitalize"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {sections.map((section, i) => (
                    <div key={section.id} className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                      section.is_enabled ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-900/50 border-zinc-800/50 opacity-60'
                    }`}>
                      <GripVertical className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                      <span className="flex-1 text-sm text-zinc-300 capitalize font-medium">{section.section_type}</span>
                      <button onClick={() => moveSectionUp(i)} disabled={i === 0} className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 disabled:opacity-30 transition-colors">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => moveSectionDown(i)} disabled={i === sections.length - 1} className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 disabled:opacity-30 transition-colors">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggleSection(section)} className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 transition-colors" title={section.is_enabled ? 'Disable' : 'Enable'}>
                        {section.is_enabled ? <ToggleRight className="w-4 h-4 text-violet-400" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => deleteSection(section.id)} className="p-1 rounded hover:bg-red-900/30 text-zinc-600 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {sections.length === 0 && (
                    <div className="text-center py-8 text-zinc-600 text-sm">
                      No sections yet. Add one above.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Cards Tab ── */}
            {tab === 'cards' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500">{cards.length} card{cards.length !== 1 ? 's' : ''}</p>
                  <button
                    onClick={addCard}
                    className="text-xs px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add Card
                  </button>
                </div>

                <div className="space-y-2">
                  {cards.map((card, i) => (
                    <div key={card.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                      {/* Card Header */}
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <span className="flex-1 text-sm font-medium text-zinc-200 truncate">{card.brand_name}</span>
                        <button onClick={() => moveCardUp(i)} disabled={i === 0} className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 disabled:opacity-30 transition-colors">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => moveCardDown(i)} disabled={i === cards.length - 1} className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 disabled:opacity-30 transition-colors">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditCard(editCard === card.id ? null : card.id)}
                          className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
                        >
                          {editCard === card.id ? 'Collapse' : 'Edit'}
                        </button>
                        <button onClick={() => deleteCard(card.id)} className="p-1 rounded hover:bg-red-900/30 text-zinc-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Inline Editor */}
                      {editCard === card.id && (
                        <CardEditor
                          card={card}
                          onSave={saveCard}
                          onCancel={() => setEditCard(null)}
                        />
                      )}
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className="text-center py-8 text-zinc-600 text-sm">
                      No cards yet. Add partner brands.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── SEO Tab ── */}
            {tab === 'seo' && (
              <div className="space-y-4">
                <Field label="Meta Title">
                  <input
                    type="text"
                    placeholder="Page title for search engines"
                    value={draft.meta_title ?? ''}
                    onChange={e => setDraft(d => ({ ...d, meta_title: e.target.value }))}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors"
                  />
                  <p className="text-xs text-zinc-600 mt-1">Recommended: 50–60 characters</p>
                </Field>
                <Field label="Meta Description">
                  <textarea
                    rows={3}
                    placeholder="Brief description for search engine results"
                    value={draft.meta_description ?? ''}
                    onChange={e => setDraft(d => ({ ...d, meta_description: e.target.value }))}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none resize-none transition-colors"
                  />
                  <p className="text-xs text-zinc-600 mt-1">Recommended: 150–160 characters</p>
                </Field>
              </div>
            )}

            {/* ── Publish Tab ── */}
            {tab === 'publish' && (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border ${
                  site.status === 'published'
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-amber-500/10 border-amber-500/30'
                }`}>
                  <div className={`font-semibold text-sm ${site.status === 'published' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {site.status === 'published' ? 'Live' : 'Draft — Not published'}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    {site.status === 'published'
                      ? `Public URL: /p/${site.slug}`
                      : 'Save your changes and publish to make this site live.'}
                  </p>
                </div>

                {site.status !== 'published' && (
                  <button
                    onClick={publishSite}
                    disabled={publishing}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                    {publishing ? 'Publishing…' : 'Publish Site'}
                  </button>
                )}

                {site.status === 'published' && (
                  <a
                    href={`/p/${site.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> View Live Site
                  </a>
                )}

                <div className="text-xs text-zinc-600 text-center">
                  Last updated: {new Date(site.updated_at).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* Bottom save button */}
          <div className="border-t border-zinc-800 px-4 py-3 flex-shrink-0">
            <button
              onClick={saveSite}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Right: Live Preview Panel */}
        {previewOpen && (
          <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </div>
              <div className="flex gap-1">
                {(['desktop', 'mobile'] as const).map(v => (
                  <button
                    key={v}
                    className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors capitalize"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview Render */}
            <div className="flex-1 overflow-auto p-4">
              <div className="max-w-2xl mx-auto">
                <PartnerSitePreview
                  site={{ ...site, ...draft }}
                  template={selectedTemplate ?? null}
                  theme={selectedTheme ?? null}
                  sections={sections.filter(s => s.is_enabled)}
                  cards={cards}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Field Wrapper ──────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

/* ─── Card Inline Editor ─────────────────────────────────── */
function CardEditor({ card, onSave, onCancel }: { card: Card; onSave: (c: Card) => void; onCancel: () => void }) {
  const [local, setLocal] = useState<Card>({ ...card });
  const set = (f: Partial<Card>) => setLocal(prev => ({ ...prev, ...f }));

  const fields: { key: keyof Card; label: string; placeholder: string; type?: string }[] = [
    { key: 'brand_name',    label: 'Brand Name *', placeholder: 'Tesla88' },
    { key: 'subtitle',      label: 'Subtitle',     placeholder: 'Premium Casino' },
    { key: 'description',   label: 'Description',  placeholder: 'Short description' },
    { key: 'badge',         label: 'Badge',        placeholder: 'HOT / NEW' },
    { key: 'welcome_bonus', label: 'Welcome Bonus', placeholder: '100% up to RM500' },
    { key: 'free_credit',   label: 'Free Credit',  placeholder: 'RM10 Free Credit' },
    { key: 'commission',    label: 'Commission',    placeholder: 'Up to 50%' },
    { key: 'promo_text',    label: 'Promo Text',   placeholder: 'Special offer' },
    { key: 'telegram_url',  label: 'Telegram URL', placeholder: 'https://t.me/...' },
    { key: 'whatsapp_url',  label: 'WhatsApp URL', placeholder: 'https://wa.me/...' },
    { key: 'website_url',   label: 'Website URL',  placeholder: 'https://...' },
    { key: 'button_text',   label: 'Button Text',  placeholder: 'Join Now' },
  ];

  return (
    <div className="border-t border-zinc-800 p-3 space-y-2.5 bg-zinc-900/50">
      <div className="grid grid-cols-2 gap-2">
        {fields.map(f => (
          <div key={f.key} className={f.key === 'description' || f.key === 'promo_text' ? 'col-span-2' : ''}>
            <label className="text-xs text-zinc-500 mb-1 block">{f.label}</label>
            <input
              type={f.type ?? 'text'}
              placeholder={f.placeholder}
              value={(local[f.key] as string) ?? ''}
              onChange={e => set({ [f.key]: e.target.value } as Partial<Card>)}
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition-colors"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(local)}
          className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-colors"
        >
          Save Card
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 border border-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── Live Preview Component ─────────────────────────────── */
function PartnerSitePreview({
  site, template, theme, sections, cards,
}: {
  site: Partial<Site>;
  template: Template | null;
  theme: Theme | null;
  sections: Section[];
  cards: Card[];
}) {
  const vars = theme?.css_variables ?? {};
  const primary  = cssVar(vars, '--pb-primary', '#7c3aed');
  const bg       = cssVar(vars, '--pb-bg', '#09090b');
  const textColor = cssVar(vars, '--pb-text', '#f4f4f5');
  const accent   = cssVar(vars, '--pb-accent', '#a78bfa');

  return (
    <div
      className="rounded-xl overflow-hidden border border-zinc-800 shadow-2xl text-sm"
      style={{ background: bg, color: textColor, minHeight: '400px' }}
    >
      {/* Preview Header */}
      <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: `${primary}30`, background: `${bg}ee` }}>
        {site.logo_url ? (
          <img src={site.logo_url} alt="logo" className="h-6 object-contain" />
        ) : (
          <div className="w-6 h-6 rounded" style={{ background: primary }} />
        )}
        <span className="font-bold text-xs" style={{ color: textColor }}>{site.name ?? 'Partner Site'}</span>
      </div>

      {/* Sections Preview */}
      {sections.map(section => (
        <div key={section.id}>
          {section.section_type === 'hero' && (
            <div className="px-4 py-8 text-center" style={{ background: `linear-gradient(135deg, ${bg}, ${primary}20)` }}>
              <div className="text-lg font-bold mb-2" style={{ color: textColor }}>
                {site.name ?? 'Welcome'}
              </div>
              <div className="text-xs mb-4" style={{ color: `${textColor}99` }}>Your trusted gaming platform</div>
              <div className="inline-block px-4 py-2 rounded-lg text-xs font-bold" style={{ background: primary, color: '#fff' }}>
                Join Now
              </div>
            </div>
          )}
          {section.section_type === 'marquee' && (
            <div className="px-4 py-3 text-xs text-center" style={{ color: `${textColor}60`, borderTop: `1px solid ${primary}20` }}>
              ✦ FEATURED PARTNERS ✦ TRUSTED BRANDS ✦ BEST BONUSES ✦
            </div>
          )}
          {section.section_type === 'partners' && (
            <div className="px-4 py-4 space-y-2">
              <div className="text-xs font-bold mb-3 text-center" style={{ color: accent }}>PARTNER BRANDS</div>
              {cards.slice(0, 3).map(card => (
                <div key={card.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: `${primary}25`, background: `${primary}08` }}>
                  <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: `${primary}30` }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs" style={{ color: textColor }}>{card.brand_name}</div>
                    {card.subtitle && <div className="text-xs" style={{ color: `${textColor}70` }}>{card.subtitle}</div>}
                    {card.welcome_bonus && <div className="text-xs mt-0.5" style={{ color: accent }}>{card.welcome_bonus}</div>}
                  </div>
                  <div className="px-2 py-1 rounded text-xs font-bold flex-shrink-0" style={{ background: primary, color: '#fff' }}>
                    {card.button_text || 'Join'}
                  </div>
                </div>
              ))}
              {cards.length === 0 && (
                <div className="text-center py-4 text-xs" style={{ color: `${textColor}40` }}>No partner cards yet</div>
              )}
            </div>
          )}
          {section.section_type === 'footer' && (
            <div className="px-4 py-3 text-center text-xs border-t" style={{ borderColor: `${primary}20`, color: `${textColor}50` }}>
              © {new Date().getFullYear()} {site.name ?? 'Partner Site'}. All rights reserved.
            </div>
          )}
        </div>
      ))}

      {/* Empty state */}
      {sections.length === 0 && (
        <div className="flex items-center justify-center h-48 text-xs" style={{ color: `${textColor}40` }}>
          Add sections to see preview
        </div>
      )}

      {/* Template/Theme info */}
      <div className="border-t px-3 py-2 flex items-center justify-between" style={{ borderColor: `${primary}20` }}>
        <span className="text-xs" style={{ color: `${textColor}40` }}>
          {template ? `Template: ${template.name}` : 'No template'}
        </span>
        <span className="text-xs" style={{ color: `${textColor}40` }}>
          {theme ? `Theme: ${theme.name}` : 'No theme'}
        </span>
      </div>
    </div>
  );
}
