'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, X, Image as ImageIcon } from 'lucide-react';
import { AccessDenied } from '@/components/access-denied';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { BrandSettings } from '@/lib/repositories/brand_repo';
import type { MediaRecord } from '@/lib/media/types';
import {
  isValidUrl,
  hasBrandPermission,
  buildSavePatch,
  initForm,
  type FormState,
} from '@/lib/brand-page-helpers';

// ── Toast ──────────────────────────────────────────────────────────────────────

interface Toast { msg: string; type: 'success' | 'error' }

function useToast() {
  const [t, setT] = useState<Toast | null>(null);
  const show = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setT({ msg, type });
    setTimeout(() => setT(null), 3500);
  }, []);
  return { toast: t, show, clear: useCallback(() => setT(null), []) };
}

function ToastBanner({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg text-white shadow-lg ${
        toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
      }`}
    >
      <span className="text-sm">{toast.msg}</span>
      <button onClick={onDismiss} aria-label="Dismiss"><X size={14} /></button>
    </div>
  );
}

// ── Layout helpers ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  );
}

// ── Media Asset Field ──────────────────────────────────────────────────────────

function MediaAssetField({
  label,
  mediaId,
  onSelect,
  onRemove,
}: {
  label: string;
  mediaId: number | null;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-4">
        {mediaId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/${mediaId}/thumbnail`}
            alt={`${label} preview`}
            className="w-16 h-16 object-cover rounded-lg border border-gray-200 bg-gray-50"
            onError={e => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
            <ImageIcon size={20} className="text-gray-400" />
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelect}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700"
          >
            {mediaId ? 'Change' : 'Select'}
          </button>
          {mediaId && (
            <button
              type="button"
              onClick={onRemove}
              className="px-3 py-1.5 text-sm border border-red-200 rounded-lg hover:bg-red-50 font-medium text-red-600"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}

// ── Theme Preview ──────────────────────────────────────────────────────────────

function ThemePreview({
  primary,
  secondary,
  mode,
}: {
  primary: string;
  secondary: string;
  mode: string;
}) {
  const isDark    = mode === 'dark';
  const bg        = isDark ? '#1a1a2e' : '#f8fafc';
  const headerBg  = isDark ? '#16213e' : '#ffffff';
  const cardBg    = isDark ? '#0f3460' : '#ffffff';
  const borderCol = isDark ? '#334155' : '#e2e8f0';
  const textCol   = isDark ? '#e2e8f0' : '#1e293b';

  return (
    <div
      aria-label="Theme preview"
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: bg, borderColor: borderCol }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ backgroundColor: headerBg, borderColor: borderCol }}
      >
        <div className="w-6 h-6 rounded" style={{ backgroundColor: primary }} />
        <span className="text-sm font-semibold" style={{ color: textCol }}>Brand Preview</span>
      </div>
      {/* Body */}
      <div className="p-4 flex flex-wrap gap-3 items-start">
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-white text-sm font-medium shadow-sm"
          style={{ backgroundColor: primary }}
        >
          Primary Button
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-white text-sm font-medium shadow-sm"
          style={{ backgroundColor: secondary }}
        >
          Secondary
        </button>
        <div
          className="rounded-lg border p-3 min-w-[140px]"
          style={{ backgroundColor: cardBg, borderColor: borderCol }}
        >
          <div className="h-1.5 rounded w-3/4 mb-2" style={{ backgroundColor: primary }} />
          <div className="h-1.5 rounded w-1/2 mb-2" style={{ backgroundColor: secondary, opacity: 0.6 }} />
          <div className="text-xs" style={{ color: textCol, opacity: 0.7 }}>Sample card</div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type PickerTarget = 'logo' | 'favicon' | null;

interface MeResponse { isSuperAdmin: boolean; permissions: string[] }

const EMPTY_FORM: FormState = {
  brand_name: '', company_name: '', tagline: '', member_id_prefix: 'SS',
  logo_media_id: null, favicon_media_id: null,
  primary_color: '#1d4ed8', secondary_color: '#1e40af', theme_mode: 'light',
  website_domain: '', api_domain: '',
  support_whatsapp: '', support_telegram: '', telegram_channel: '', facebook_url: '',
  seo_title: '', seo_description: '', seo_keywords: '',
};

export default function BrandCenterPage() {
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [loading, setLoading]     = useState(true);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
  const [pickerFor, setPickerFor] = useState<PickerTarget>(null);
  const [saving, setSaving]       = useState(false);
  const [urlErrors, setUrlErrors] = useState<{ website?: string; api?: string }>({});
  const { toast, show, clear }    = useToast();

  // Permission check
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((d: MeResponse | null) => setPermitted(hasBrandPermission(d)))
      .catch(() => setPermitted(false));
  }, []);

  // Load brand settings
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/settings/brand');
      if (r.ok) {
        const d = await r.json() as { brand: BrandSettings };
        setForm(initForm(d.brand));
      }
    } catch {
      show('Failed to load brand settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    if (permitted === true) void load();
    else if (permitted === false) setLoading(false);
  }, [permitted, load]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function validateUrls(): boolean {
    const errs: { website?: string; api?: string } = {};
    if (form.website_domain && !isValidUrl(form.website_domain))
      errs.website = 'Invalid URL format';
    if (form.api_domain && !isValidUrl(form.api_domain))
      errs.api = 'Invalid URL format';
    setUrlErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validateUrls()) { show('Please fix URL errors before saving', 'error'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/settings/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSavePatch(form)),
      });
      const d = await r.json() as { ok?: boolean; error?: string; brand?: BrandSettings };
      if (!r.ok) { show(d.error ?? 'Failed to save', 'error'); return; }
      if (d.brand) setForm(initForm(d.brand));
      show('Brand settings saved successfully');
    } catch {
      show('Network error — could not save', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleMediaSelect(media: MediaRecord | MediaRecord[]) {
    const item = Array.isArray(media) ? media[0] : media;
    if (!item) return;
    if (pickerFor === 'logo')    set('logo_media_id', item.id);
    if (pickerFor === 'favicon') set('favicon_media_id', item.id);
    setPickerFor(null);
  }

  if (permitted === null || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  if (!permitted) return <AccessDenied />;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {toast && <ToastBanner toast={toast} onDismiss={clear} />}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Brand Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure brand identity, assets, theme, and SEO settings
        </p>
      </div>

      {/* 1. Brand Identity */}
      <Section title="Brand Identity">
        <Field label="Brand Name">
          <TextInput
            value={form.brand_name}
            onChange={v => set('brand_name', v)}
            placeholder="e.g. SSWIN88"
          />
        </Field>
        <Field label="Company Name">
          <TextInput
            value={form.company_name}
            onChange={v => set('company_name', v)}
            placeholder="e.g. SSWIN88 Sdn Bhd"
          />
        </Field>
        <Field label="Tagline">
          <TextInput
            value={form.tagline}
            onChange={v => set('tagline', v)}
            placeholder="Optional brand tagline"
          />
        </Field>
        <Field label="Member ID Prefix (2–6 chars, A–Z 0–9)">
          <TextInput
            value={form.member_id_prefix}
            onChange={v => set('member_id_prefix', v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="e.g. SS"
          />
          <p className="mt-1 text-xs text-gray-400">
            New member IDs will use this prefix, e.g. {form.member_id_prefix || 'SS'}1000001. Only affects new registrations.
          </p>
        </Field>
      </Section>

      {/* 2. Brand Assets */}
      <Section title="Brand Assets">
        <MediaAssetField
          label="Logo"
          mediaId={form.logo_media_id}
          onSelect={() => setPickerFor('logo')}
          onRemove={() => set('logo_media_id', null)}
        />
        <MediaAssetField
          label="Favicon"
          mediaId={form.favicon_media_id}
          onSelect={() => setPickerFor('favicon')}
          onRemove={() => set('favicon_media_id', null)}
        />
      </Section>

      {/* 3. Theme */}
      <Section title="Theme">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Primary Color">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.primary_color}
                onChange={e => set('primary_color', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200 p-0.5"
                aria-label="Primary color picker"
              />
              <TextInput
                value={form.primary_color}
                onChange={v => set('primary_color', v)}
                placeholder="#1d4ed8"
              />
            </div>
          </Field>
          <Field label="Secondary Color">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.secondary_color}
                onChange={e => set('secondary_color', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200 p-0.5"
                aria-label="Secondary color picker"
              />
              <TextInput
                value={form.secondary_color}
                onChange={v => set('secondary_color', v)}
                placeholder="#1e40af"
              />
            </div>
          </Field>
        </div>
        <Field label="Theme Mode">
          <select
            value={form.theme_mode}
            onChange={e => set('theme_mode', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </Field>
        <Field label="Preview">
          <ThemePreview
            primary={form.primary_color}
            secondary={form.secondary_color}
            mode={form.theme_mode}
          />
        </Field>
      </Section>

      {/* 4. Domain */}
      <Section title="Domain">
        <Field label="Website Domain">
          <TextInput
            value={form.website_domain}
            onChange={v => {
              set('website_domain', v);
              setUrlErrors(e => ({ ...e, website: undefined }));
            }}
            placeholder="https://sswin88.com"
          />
          {urlErrors.website && (
            <p className="text-xs text-red-500 mt-1">{urlErrors.website}</p>
          )}
        </Field>
        <Field label="API Domain">
          <TextInput
            value={form.api_domain}
            onChange={v => {
              set('api_domain', v);
              setUrlErrors(e => ({ ...e, api: undefined }));
            }}
            placeholder="https://api.sswin88.com"
          />
          {urlErrors.api && (
            <p className="text-xs text-red-500 mt-1">{urlErrors.api}</p>
          )}
        </Field>
      </Section>

      {/* 5. Contact */}
      <Section title="Contact">
        <Field label="WhatsApp">
          <TextInput
            value={form.support_whatsapp}
            onChange={v => set('support_whatsapp', v)}
            placeholder="+601234567890"
          />
        </Field>
        <Field label="Telegram">
          <TextInput
            value={form.support_telegram}
            onChange={v => set('support_telegram', v)}
            placeholder="@support_bot"
          />
        </Field>
        <Field label="Telegram Channel">
          <TextInput
            value={form.telegram_channel}
            onChange={v => set('telegram_channel', v)}
            placeholder="@sswin88_channel"
          />
        </Field>
        <Field label="Facebook">
          <TextInput
            value={form.facebook_url}
            onChange={v => set('facebook_url', v)}
            placeholder="https://facebook.com/sswin88"
          />
        </Field>
      </Section>

      {/* 6. SEO */}
      <Section title="SEO">
        <Field label="Title">
          <TextInput
            value={form.seo_title}
            onChange={v => set('seo_title', v)}
            placeholder="SSWIN88 — Best Online Casino"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={form.seo_description}
            onChange={e => set('seo_description', e.target.value)}
            placeholder="Meta description for search engines..."
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </Field>
        <Field label="Keywords">
          <TextInput
            value={form.seo_keywords}
            onChange={v => set('seo_keywords', v)}
            placeholder="casino, slots, betting, malaysia"
          />
        </Field>
      </Section>

      {/* Save */}
      <div className="flex justify-end pb-8">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save Changes
        </button>
      </div>

      {/* Media Picker */}
      {pickerFor && (
        <MediaPicker
          mode="single"
          typeFilter={['IMAGE', 'GIF']}
          onSelect={handleMediaSelect}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
