'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, Check, Globe, LayoutTemplate,
  Palette, Layers, CreditCard, Eye, Rocket, Plus, X,
  Loader2, Info,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────── */
type Template = { id: number; name: string; slug: string; description: string | null; preview_image_url: string | null; category: string | null };
type Theme    = { id: number; name: string; slug: string; css_variables: Record<string, string> };

type WizardState = {
  /* Step 1 */
  name: string;
  slug: string;
  logo_url: string;
  status: 'draft' | 'published';
  /* Step 2 */
  template_id: number | null;
  /* Step 3 */
  theme_id: number | null;
  /* Step 4 */
  sections: string[];
  /* Step 5 */
  cards: { brand_name: string; subtitle: string; telegram_url: string; button_text: string }[];
  /* Steps 6-7 handled by review/submit */
};

const DEFAULT_SECTIONS = ['hero', 'partners', 'footer'];

const STEPS = [
  { id: 1, label: 'Basic Info',       icon: Globe },
  { id: 2, label: 'Template',         icon: LayoutTemplate },
  { id: 3, label: 'Theme',            icon: Palette },
  { id: 4, label: 'Sections',         icon: Layers },
  { id: 5, label: 'Partner Cards',    icon: CreditCard },
  { id: 6, label: 'Preview',          icon: Eye },
  { id: 7, label: 'Publish',          icon: Rocket },
];

const ALL_SECTIONS: { key: string; label: string; desc: string }[] = [
  { key: 'hero',       label: 'Hero Banner',       desc: 'Full-width headline and call-to-action' },
  { key: 'marquee',    label: 'Partner Marquee',   desc: 'Scrolling row of partner logos' },
  { key: 'partners',   label: 'Partner Cards Grid', desc: 'Grid display of all partner cards' },
  { key: 'promotions', label: 'Promotions',         desc: 'Highlight bonuses and offers' },
  { key: 'contact',    label: 'Contact Links',      desc: 'Telegram/WhatsApp/Line buttons' },
  { key: 'footer',     label: 'Footer',             desc: 'Branding, links, copyright' },
];

/* ─── Utility ────────────────────────────────────────────── */
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function cssVar(vars: Record<string, string>, key: string, fallback = '#888') {
  return vars[key] ?? fallback;
}

/* ─── Component ──────────────────────────────────────────── */
export default function CreatePartnerWizard() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [themes, setThemes]       = useState<Theme[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const [slugError, setSlugError]     = useState('');

  const [form, setForm] = useState<WizardState>({
    name: '', slug: '', logo_url: '', status: 'draft',
    template_id: null, theme_id: null,
    sections: [...DEFAULT_SECTIONS],
    cards: [],
  });

  useEffect(() => {
    Promise.all([
      fetch('/api/partner-builder/templates').then(r => r.json()),
      fetch('/api/partner-builder/themes').then(r => r.json()),
    ]).then(([t, th]) => {
      setTemplates(Array.isArray(t) ? t : []);
      setThemes(Array.isArray(th) ? th : []);
    }).finally(() => setLoadingData(false));
  }, []);

  /* Auto-slug from name */
  function handleNameChange(v: string) {
    setForm(f => ({ ...f, name: v, slug: slugify(v) }));
    setSlugError('');
  }

  async function checkSlug(slug: string) {
    if (!slug) return;
    const r = await fetch(`/api/partner-builder/sites?slug=${encodeURIComponent(slug)}`);
    const data = await r.json();
    if (Array.isArray(data) && data.some((s: { slug: string }) => s.slug === slug)) {
      setSlugError('This slug is already taken.');
    } else {
      setSlugError('');
    }
  }

  /* Validation per step */
  function canProceed(): boolean {
    if (step === 1) return !!form.name.trim() && !!form.slug.trim() && !slugError;
    if (step === 2) return form.template_id !== null;
    if (step === 3) return form.theme_id !== null;
    return true;
  }

  /* Section toggle */
  function toggleSection(key: string) {
    setForm(f => ({
      ...f,
      sections: f.sections.includes(key) ? f.sections.filter(s => s !== key) : [...f.sections, key],
    }));
  }

  /* Card helpers */
  function addCard() {
    setForm(f => ({
      ...f,
      cards: [...f.cards, { brand_name: '', subtitle: '', telegram_url: '', button_text: 'Join Now' }],
    }));
  }

  function updateCard(i: number, field: string, value: string) {
    setForm(f => {
      const cards = [...f.cards];
      cards[i] = { ...cards[i], [field]: value };
      return { ...f, cards };
    });
  }

  function removeCard(i: number) {
    setForm(f => ({ ...f, cards: f.cards.filter((_, idx) => idx !== i) }));
  }

  /* Final submit */
  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      /* Create site */
      const siteRes = await fetch('/api/partner-builder/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          status: form.status,
          logo_url: form.logo_url || null,
          template_id: form.template_id,
          theme_id: form.theme_id,
        }),
      });
      if (!siteRes.ok) {
        const err = await siteRes.json();
        throw new Error(err.error ?? 'Failed to create site');
      }
      const site = await siteRes.json();

      /* Create sections */
      for (let i = 0; i < form.sections.length; i++) {
        await fetch(`/api/partner-builder/sites/${site.id}/sections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section_type: form.sections[i], sort_order: i }),
        });
      }

      /* Create cards */
      for (let i = 0; i < form.cards.length; i++) {
        const c = form.cards[i];
        if (!c.brand_name.trim()) continue;
        await fetch(`/api/partner-builder/sites/${site.id}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...c, sort_order: i }),
        });
      }

      /* Publish if chosen */
      if (form.status === 'published') {
        await fetch(`/api/partner-builder/sites/${site.id}/publish`, { method: 'POST' });
      }

      router.push(`/website-builder/partner-builder/${site.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTemplate = templates.find(t => t.id === form.template_id);
  const selectedTheme    = themes.find(t => t.id === form.theme_id);

  /* ─── Render ─────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top Nav */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <Link href="/website-builder/partner-builder" className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-semibold text-zinc-50">Create Partner Site</h1>
      </div>

      {/* Step Indicator */}
      <div className="border-b border-zinc-800 px-6 py-4 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {STEPS.map((s, i) => {
            const done    = s.id < step;
            const current = s.id === step;
            return (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  onClick={() => done && setStep(s.id)}
                  disabled={!done}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    current ? 'bg-violet-600 text-white' :
                    done    ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer' :
                              'text-zinc-600 cursor-default'
                  }`}
                >
                  {done ? <Check className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.id}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`w-4 h-px ${s.id < step ? 'bg-violet-600' : 'bg-zinc-700'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="max-w-3xl mx-auto p-6">

        {/* ── Step 1: Basic Info ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-50">Basic Information</h2>
              <p className="text-sm text-zinc-400 mt-1">Set the name and URL for your partner site.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Site Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Tesla88 Partners"
                  value={form.name}
                  onChange={e => handleNameChange(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">URL Slug *</label>
                <div className="flex items-center gap-0">
                  <span className="bg-zinc-800 border border-r-0 border-zinc-700 rounded-l-lg px-3 py-2.5 text-sm text-zinc-500 select-none">/p/</span>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={e => { setForm(f => ({ ...f, slug: slugify(e.target.value) })); setSlugError(''); }}
                    onBlur={e => checkSlug(e.target.value)}
                    className={`flex-1 bg-zinc-900 border rounded-r-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors ${
                      slugError ? 'border-red-500 focus:border-red-400' : 'border-zinc-700 focus:border-violet-500'
                    }`}
                  />
                </div>
                {slugError && <p className="text-xs text-red-400 mt-1">{slugError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Logo URL <span className="text-zinc-600">(optional)</span></label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={form.logo_url}
                  onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))}
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Initial Status</label>
                <div className="flex gap-3">
                  {(['draft', 'published'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all capitalize ${
                        form.status === s
                          ? s === 'published'
                            ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                            : 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Template ── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-50">Choose a Template</h2>
              <p className="text-sm text-zinc-400 mt-1">Templates define the layout and component structure of your site.</p>
            </div>
            {loadingData ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setForm(f => ({ ...f, template_id: t.id }))}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      form.template_id === t.id
                        ? 'bg-violet-600/15 border-violet-500 ring-1 ring-violet-500/30'
                        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="h-20 rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center mb-3 border border-zinc-700 overflow-hidden">
                      {t.preview_image_url ? (
                        <img src={t.preview_image_url} alt={t.name} className="w-full h-full object-cover" />
                      ) : (
                        <LayoutTemplate className="w-8 h-8 text-zinc-600" />
                      )}
                    </div>
                    <div className="font-medium text-zinc-200 text-sm">{t.name}</div>
                    {t.category && (
                      <div className="text-xs text-zinc-500 mt-0.5 capitalize">{t.category}</div>
                    )}
                    {t.description && (
                      <div className="text-xs text-zinc-500 mt-1 line-clamp-2">{t.description}</div>
                    )}
                    {form.template_id === t.id && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-violet-400 font-medium">
                        <Check className="w-3 h-3" /> Selected
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Theme ── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-50">Choose a Color Theme</h2>
              <p className="text-sm text-zinc-400 mt-1">Themes apply CSS custom properties to control the visual style.</p>
            </div>
            {loadingData ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {themes.map(t => {
                  const vars = t.css_variables ?? {};
                  const primary   = cssVar(vars, '--pb-primary');
                  const secondary = cssVar(vars, '--pb-secondary');
                  const accent    = cssVar(vars, '--pb-accent');
                  const bg        = cssVar(vars, '--pb-bg', '#18181b');
                  return (
                    <button
                      key={t.id}
                      onClick={() => setForm(f => ({ ...f, theme_id: t.id }))}
                      className={`text-left p-4 rounded-xl border transition-all ${
                        form.theme_id === t.id
                          ? 'bg-violet-600/15 border-violet-500 ring-1 ring-violet-500/30'
                          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {/* Color swatches */}
                      <div className="h-16 rounded-lg mb-3 overflow-hidden flex">
                        <div className="flex-1" style={{ background: bg }} />
                        <div className="w-8" style={{ background: primary }} />
                        <div className="w-8" style={{ background: secondary }} />
                        <div className="w-6" style={{ background: accent }} />
                      </div>
                      <div className="font-medium text-zinc-200 text-sm">{t.name}</div>
                      {form.theme_id === t.id && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-violet-400 font-medium">
                          <Check className="w-3 h-3" /> Selected
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Sections ── */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-50">Configure Sections</h2>
              <p className="text-sm text-zinc-400 mt-1">Choose which sections to include. You can reorder them in the editor.</p>
            </div>
            <div className="space-y-2">
              {ALL_SECTIONS.map(s => {
                const enabled = form.sections.includes(s.key);
                return (
                  <div
                    key={s.key}
                    onClick={() => toggleSection(s.key)}
                    className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                      enabled
                        ? 'bg-violet-600/10 border-violet-500/50'
                        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-all ${
                      enabled ? 'bg-violet-600 border-violet-600' : 'border-zinc-600'
                    }`}>
                      {enabled && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-zinc-200">{s.label}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{s.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-start gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-500">
              <Info className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-0.5" />
              You can add, remove, and reorder sections anytime in the site editor.
            </div>
          </div>
        )}

        {/* ── Step 5: Partner Cards ── */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-50">Add Partner Cards</h2>
              <p className="text-sm text-zinc-400 mt-1">Cards represent individual brands/partners displayed on your site. You can add more later.</p>
            </div>
            <div className="space-y-3">
              {form.cards.map((card, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-300">Card #{i + 1}</span>
                    <button onClick={() => removeCard(i)} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Brand Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Tesla88"
                        value={card.brand_name}
                        onChange={e => updateCard(i, 'brand_name', e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Subtitle</label>
                      <input
                        type="text"
                        placeholder="e.g. Premium Casino"
                        value={card.subtitle}
                        onChange={e => updateCard(i, 'subtitle', e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Telegram URL</label>
                      <input
                        type="text"
                        placeholder="https://t.me/..."
                        value={card.telegram_url}
                        onChange={e => updateCard(i, 'telegram_url', e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Button Text</label>
                      <input
                        type="text"
                        placeholder="Join Now"
                        value={card.button_text}
                        onChange={e => updateCard(i, 'button_text', e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={addCard}
                className="w-full py-3 border border-dashed border-zinc-700 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Partner Card
              </button>
            </div>
          </div>
        )}

        {/* ── Step 6: Preview ── */}
        {step === 6 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-50">Review Your Setup</h2>
              <p className="text-sm text-zinc-400 mt-1">Check all your settings before creating the site.</p>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Site Name', value: form.name },
                { label: 'URL',       value: `/p/${form.slug}` },
                { label: 'Status',    value: form.status },
                { label: 'Template',  value: selectedTemplate?.name ?? '—' },
                { label: 'Theme',     value: selectedTheme?.name ?? '—' },
                { label: 'Sections',  value: form.sections.join(', ') || '—' },
                { label: 'Cards',     value: `${form.cards.filter(c => c.brand_name.trim()).length} partner card(s)` },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                  <span className="text-sm text-zinc-500 w-28 flex-shrink-0">{row.label}</span>
                  <span className="text-sm text-zinc-200 font-medium">{row.value}</span>
                </div>
              ))}
            </div>
            {selectedTheme && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-xs text-zinc-500 mb-2">Theme Preview</div>
                <div className="h-12 rounded-lg overflow-hidden flex">
                  {Object.entries(selectedTheme.css_variables).slice(0, 8).map(([k, v]) => (
                    <div key={k} className="flex-1" style={{ background: v }} title={k} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 7: Publish ── */}
        {step === 7 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-50">Create Your Site</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Ready to go! Your site will be created{form.status === 'published' ? ' and published immediately' : ' as a draft'}.
              </p>
            </div>

            <div className={`p-5 rounded-xl border ${
              form.status === 'published'
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}>
              <div className={`font-semibold text-sm ${form.status === 'published' ? 'text-emerald-300' : 'text-amber-300'}`}>
                {form.status === 'published' ? '🚀 Ready to Publish' : '📋 Saving as Draft'}
              </div>
              <p className="text-xs mt-1.5 text-zinc-400">
                {form.status === 'published'
                  ? `Your site will be live at /p/${form.slug} immediately after creation.`
                  : `Your site will be saved as a draft. You can publish it from the editor anytime.`}
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setForm(f => ({ ...f, status: f.status === 'published' ? 'draft' : 'published' }))}
                className="flex-1 py-2.5 border border-zinc-700 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors capitalize"
              >
                Switch to {form.status === 'published' ? 'Draft' : 'Published'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-violet-900/30"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                ) : (
                  <><Rocket className="w-4 h-4" /> Create Site</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-8 mt-8 border-t border-zinc-800">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          {step < 7 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium transition-colors disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
