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
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
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
  hint,
  mediaId,
  onSelect,
  onRemove,
}: {
  label: string;
  hint?: string;
  mediaId: number | null;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <Field label={label}>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
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

type UrlErrorKey = 'website' | 'api' | 'erp' | 'facebook' | 'instagram' | 'tiktok';

const EMPTY_FORM: FormState = {
  brand_name: '', company_name: '', tagline: '', member_id_prefix: 'SS',
  logo_media_id: null, favicon_media_id: null,
  logo_size: 'medium', logo_align: 'left',
  primary_color: '#1d4ed8', secondary_color: '#1e40af', theme_mode: 'light',
  color_bg: '#0a0b14', color_card: '#111222', color_text: '#e8e8f5',
  website_domain: '', api_domain: '', erp_domain: '',
  support_whatsapp: '', support_telegram: '', telegram_channel: '',
  facebook_url: '', instagram_url: '', tiktok_url: '', support_email: '',
  seo_title: '', seo_description: '', seo_keywords: '',
};

function needsMigrationCheck(b: BrandSettings): boolean {
  // Detect whether Migration 024/025 columns are missing by checking if both
  // logo and color fields are still at hardcoded fallback defaults.
  const logoAtDefaults  = (b.logo_size ?? 'medium') === 'medium' && (b.logo_align ?? 'left') === 'left';
  const colorAtDefaults = (b.color_bg ?? '#0a0b14') === '#0a0b14' &&
                          (b.color_card ?? '#111222') === '#111222' &&
                          (b.color_text ?? '#e8e8f5') === '#e8e8f5';
  return logoAtDefaults || colorAtDefaults;
}

export default function BrandCenterPage() {
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [loading, setLoading]     = useState(true);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
  const [pickerFor, setPickerFor] = useState<PickerTarget>(null);
  const [saving, setSaving]       = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [urlErrors, setUrlErrors] = useState<Partial<Record<UrlErrorKey, string>>>({});
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
        setNeedsMigration(needsMigrationCheck(d.brand));
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

  function clearUrlError(key: UrlErrorKey) {
    setUrlErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  function validateUrls(): boolean {
    const errs: Partial<Record<UrlErrorKey, string>> = {};
    if (form.website_domain && !isValidUrl(form.website_domain))  errs.website   = 'Invalid URL format';
    if (form.api_domain      && !isValidUrl(form.api_domain))     errs.api       = 'Invalid URL format';
    if (form.erp_domain      && !isValidUrl(form.erp_domain))     errs.erp       = 'Invalid URL format';
    if (form.facebook_url    && !isValidUrl(form.facebook_url))   errs.facebook  = 'Invalid URL format';
    if (form.instagram_url   && !isValidUrl(form.instagram_url))  errs.instagram = 'Invalid URL format';
    if (form.tiktok_url      && !isValidUrl(form.tiktok_url))     errs.tiktok    = 'Invalid URL format';
    setUrlErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validateUrls()) { show('Please fix URL errors before saving', 'error'); return; }
    setSaving(true);
    const patch = buildSavePatch(form);
    try {
      const r = await fetch('/api/settings/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      let d: { ok?: boolean; error?: string; brand?: BrandSettings } = {};
      try { d = await r.json() as typeof d; } catch { /* non-JSON response */ }
      if (!r.ok) { show(d.error ?? `Save failed (${r.status})`, 'error'); return; }
      if (d.brand) {
        const returned = d.brand;
        const migrationFieldsSaved =
          returned.color_bg   === patch.color_bg &&
          returned.color_card === patch.color_card &&
          returned.color_text === patch.color_text &&
          returned.logo_size  === patch.logo_size &&
          returned.logo_align === patch.logo_align;
        if (!migrationFieldsSaved) {
          setForm(f => ({
            ...initForm(returned),
            color_bg:   f.color_bg,
            color_card: f.color_card,
            color_text: f.color_text,
            logo_size:  f.logo_size,
            logo_align: f.logo_align,
          }));
          setNeedsMigration(true);
          show('已保存（主题颜色和Logo设置需运行数据库迁移才能生效）', 'error');
        } else {
          setForm(initForm(returned));
          setNeedsMigration(false);
          show('Brand settings saved successfully');
        }
      }
    } catch (err) {
      console.error('[brand/save]', err);
      show('Network error — could not save', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleMigrate() {
    setMigrating(true);
    try {
      const r = await fetch('/api/settings/migrate', { method: 'POST' });
      const d = await r.json() as { ok?: boolean; results?: string[] };
      if (r.ok && d.ok) {
        show('数据库迁移成功，现在可以保存主题颜色了');
        setNeedsMigration(false);
        await load();
      } else {
        show('迁移失败: ' + (d.results?.join(', ') ?? '未知错误'), 'error');
      }
    } catch {
      show('迁移请求失败', 'error');
    } finally {
      setMigrating(false);
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
            placeholder="e.g. MyBrand88"
          />
        </Field>
        <Field label="Company Name">
          <TextInput
            value={form.company_name}
            onChange={v => set('company_name', v)}
            placeholder="e.g. MyBrand Sdn Bhd"
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
            placeholder="e.g. MB"
          />
          <p className="mt-1 text-xs text-gray-400">
            New member IDs will use this prefix, e.g. {form.member_id_prefix || 'MB'}1000001. Only affects new registrations.
          </p>
        </Field>
      </Section>

      {/* 2. Brand Assets */}
      <Section title="Brand Assets">
        <MediaAssetField
          label="Logo"
          hint="推荐 512×512 PNG / WEBP，文件 < 200 KB"
          mediaId={form.logo_media_id}
          onSelect={() => setPickerFor('logo')}
          onRemove={() => set('logo_media_id', null)}
        />
        <MediaAssetField
          label="Favicon"
          hint="推荐 128×128 PNG / ICO，文件 < 50 KB"
          mediaId={form.favicon_media_id}
          onSelect={() => setPickerFor('favicon')}
          onRemove={() => set('favicon_media_id', null)}
        />

        {/* Logo display settings */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
          <Field label="Logo Size">
            <select
              value={form.logo_size}
              onChange={e => set('logo_size', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="small">Small (32px)</option>
              <option value="medium">Medium (48px)</option>
              <option value="large">Large (64px)</option>
              <option value="xlarge">Extra Large (80px)</option>
            </select>
          </Field>
          <Field label="Logo Alignment">
            <div className="flex gap-2">
              {(['left', 'center', 'right'] as const).map(align => (
                <button
                  key={align}
                  type="button"
                  onClick={() => set('logo_align', align)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.logo_align === align
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {align === 'left' ? '◀ 左' : align === 'center' ? '● 中' : '右 ▶'}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      {/* 3. Theme */}
      <Section title="Theme">
        {needsMigration && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <span className="mt-0.5 shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="font-medium">数据库需要迁移才能保存主题颜色和 Logo 设置</p>
              <p className="text-xs mt-0.5 text-amber-700">点击右边按钮一键运行 Migration 024/025（安全，不影响现有数据）</p>
            </div>
            <button
              type="button"
              onClick={() => void handleMigrate()}
              disabled={migrating}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {migrating && <Loader2 size={12} className="animate-spin" />}
              {migrating ? '迁移中...' : '运行迁移'}
            </button>
          </div>
        )}
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
          <Field label="Website Background">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color_bg}
                onChange={e => set('color_bg', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200 p-0.5"
                aria-label="Background color picker"
              />
              <TextInput
                value={form.color_bg}
                onChange={v => set('color_bg', v)}
                placeholder="#0a0b14"
              />
            </div>
          </Field>
          <Field label="Card / Surface Color">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color_card}
                onChange={e => set('color_card', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200 p-0.5"
                aria-label="Card color picker"
              />
              <TextInput
                value={form.color_card}
                onChange={v => set('color_card', v)}
                placeholder="#111222"
              />
            </div>
          </Field>
          <Field label="Text Color">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color_text}
                onChange={e => set('color_text', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200 p-0.5"
                aria-label="Text color picker"
              />
              <TextInput
                value={form.color_text}
                onChange={v => set('color_text', v)}
                placeholder="#e8e8f5"
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
            onChange={v => { set('website_domain', v); clearUrlError('website'); }}
            placeholder="https://apidemo.club"
          />
          {urlErrors.website && <p className="text-xs text-red-500 mt-1">{urlErrors.website}</p>}
        </Field>
        <Field label="API Domain">
          <TextInput
            value={form.api_domain}
            onChange={v => { set('api_domain', v); clearUrlError('api'); }}
            placeholder="https://api.apidemo.club"
          />
          {urlErrors.api && <p className="text-xs text-red-500 mt-1">{urlErrors.api}</p>}
        </Field>
        <Field label="ERP Admin Domain">
          <TextInput
            value={form.erp_domain}
            onChange={v => { set('erp_domain', v); clearUrlError('erp'); }}
            placeholder="https://erp.apidemo.club"
          />
          {urlErrors.erp && <p className="text-xs text-red-500 mt-1">{urlErrors.erp}</p>}
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
            placeholder="@mybrand_channel"
          />
        </Field>
        <Field label="Facebook">
          <TextInput
            value={form.facebook_url}
            onChange={v => { set('facebook_url', v); clearUrlError('facebook'); }}
            placeholder="https://facebook.com/mybrand"
          />
          {urlErrors.facebook && <p className="text-xs text-red-500 mt-1">{urlErrors.facebook}</p>}
        </Field>
        <Field label="Instagram">
          <TextInput
            value={form.instagram_url}
            onChange={v => { set('instagram_url', v); clearUrlError('instagram'); }}
            placeholder="https://instagram.com/mybrand"
          />
          {urlErrors.instagram && <p className="text-xs text-red-500 mt-1">{urlErrors.instagram}</p>}
        </Field>
        <Field label="TikTok">
          <TextInput
            value={form.tiktok_url}
            onChange={v => { set('tiktok_url', v); clearUrlError('tiktok'); }}
            placeholder="https://tiktok.com/@mybrand"
          />
          {urlErrors.tiktok && <p className="text-xs text-red-500 mt-1">{urlErrors.tiktok}</p>}
        </Field>
        <Field label="Support Email">
          <TextInput
            type="email"
            value={form.support_email}
            onChange={v => set('support_email', v)}
            placeholder="support@apidemo.club"
          />
        </Field>
      </Section>

      {/* 6. SEO */}
      <Section title="SEO">
        <Field label="Title">
          <TextInput
            value={form.seo_title}
            onChange={v => set('seo_title', v)}
            placeholder="MyBrand88 — Best Online Casino"
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
