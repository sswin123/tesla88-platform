'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Loader2, X, Image as ImageIcon, Palette, ChevronDown, ChevronUp, Copy } from 'lucide-react';
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

// ── Types ──────────────────────────────────────────────────────────────────────

type PickerTarget =
  | 'logo' | 'favicon' | 'loading_logo'
  | 'pwa_icon' | 'apple_touch' | 'og_image' | 'share_image' | 'splash_image'
  | null;

type UrlErrorKey =
  | 'website' | 'api' | 'erp'
  | 'facebook' | 'instagram' | 'tiktok' | 'x' | 'youtube'
  | 'og_image_url' | 'twitter_image_url' | 'canonical_url'
  | 'link_apk' | 'link_ios' | 'link_cs' | 'link_referral_base'
  | 'link_cdn' | 'link_promotion' | 'link_vip';

interface MeResponse { isSuperAdmin: boolean; permissions: string[] }
interface ErpConfig { app_version?: string; node_env?: string }

const EMPTY_FORM: FormState = {
  brand_name: '', company_name: '', tagline: '',
  short_name: '', description: '', website_name: '',
  member_id_prefix: 'SS', referral_prefix: '',
  primary_color: '#1d4ed8', secondary_color: '#1e40af', theme_mode: 'light',
  color_bg: '#0a0b14', color_card: '#111222', color_text: '#e8e8f5',
  logo_media_id: null, favicon_media_id: null,
  logo_size: 'medium', logo_align: 'left',
  loading_logo_media_id: null, pwa_icon_media_id: null,
  apple_touch_media_id: null, og_image_media_id: null,
  share_image_media_id: null, splash_image_media_id: null,
  website_domain: '', api_domain: '', erp_domain: '',
  auto_detect_domain: false,
  support_whatsapp: '', support_telegram: '', telegram_channel: '',
  facebook_url: '', instagram_url: '', tiktok_url: '', support_email: '',
  support_phone: '',
  support_line: '', support_wechat: '', support_messenger: '',
  support_discord: '', support_viber: '', support_x: '', support_youtube: '',
  seo_title: '', seo_description: '', seo_keywords: '',
  seo_author: '', canonical_url: '', robots: 'index, follow',
  og_title: '', og_description: '', og_image_url: '',
  twitter_card: 'summary_large_image',
  twitter_title: '', twitter_description: '', twitter_image_url: '',
  link_apk: '', link_ios: '', link_tg_bot: '', link_tg_channel: '',
  link_cs: '', link_referral_base: '', link_cdn: '',
  link_promotion: '', link_vip: '',
  sys_timezone: 'Asia/Kuala_Lumpur', sys_language: 'zh-CN',
  sys_country: 'MY', sys_locale: 'ms-MY',
};

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
    <div role="alert" className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg text-white shadow-lg ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      <span className="text-sm">{toast.msg}</span>
      <button onClick={onDismiss}><X size={14} /></button>
    </div>
  );
}

// ── Layout helpers ─────────────────────────────────────────────────────────────

function Section({ title, children, collapsible = false }: { title: string; children: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button
        type="button"
        onClick={() => collapsible && setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-6 py-4 ${collapsible ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'}`}
      >
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {collapsible && (open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />)}
      </button>
      {open && <div className="px-6 pb-6 space-y-4">{children}</div>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
  );
}

function UrlField({ label, hint, value, onChange, error, placeholder }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; error?: string; placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <TextInput value={value} onChange={onChange} placeholder={placeholder} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </Field>
  );
}

// ── Media Asset Field ──────────────────────────────────────────────────────────

function MediaAssetField({ label, hint, mediaId, onSelect, onRemove }: {
  label: string; hint?: string; mediaId: number | null; onSelect: () => void; onRemove: () => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-4">
        {mediaId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${mediaId}/thumbnail`} alt={label}
            className="w-16 h-16 object-cover rounded-lg border border-gray-200 bg-gray-50"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
            <ImageIcon size={20} className="text-gray-400" />
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onSelect}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700">
            {mediaId ? '更换' : '选择'}
          </button>
          {mediaId && (
            <button type="button" onClick={onRemove}
              className="px-3 py-1.5 text-sm border border-red-200 rounded-lg hover:bg-red-50 font-medium text-red-600">
              移除
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}

// ── Variable Badge ─────────────────────────────────────────────────────────────

function VarBadge({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(`{{${name}}}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
      <div className="min-w-0">
        <code className="text-xs text-blue-700 font-mono">{`{{${name}}}`}</code>
        <p className="text-xs text-gray-500 truncate mt-0.5">{value || '—'}</p>
      </div>
      <button type="button" onClick={copy} title="复制变量名"
        className="flex-shrink-0 text-gray-400 hover:text-gray-600">
        {copied ? <span className="text-xs text-green-600">✓</span> : <Copy size={12} />}
      </button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BrandCenterPage() {
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [loading, setLoading]     = useState(true);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
  const [pickerFor, setPickerFor] = useState<PickerTarget>(null);
  const [saving, setSaving]       = useState(false);
  const [urlErrors, setUrlErrors] = useState<Partial<Record<UrlErrorKey, string>>>({});
  const [erpConfig, setErpConfig] = useState<ErpConfig>({});
  const { toast, show, clear }    = useToast();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Permission check
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((d: MeResponse | null) => setPermitted(hasBrandPermission(d)))
      .catch(() => setPermitted(false));
    fetch('/api/erp/config')
      .then(r => r.json())
      .then((d: ErpConfig) => setErpConfig(d))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/settings/brand');
      if (r.ok) {
        const d = await r.json() as { brand: BrandSettings };
        setForm(initForm(d.brand));
      }
    } catch {
      show('加载品牌设置失败', 'error');
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
    clearUrlError(key as UrlErrorKey);
  }

  function clearUrlError(key: UrlErrorKey) {
    setUrlErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  function validateUrls(): boolean {
    const URL_FIELDS: { key: UrlErrorKey; value: string }[] = [
      { key: 'website',        value: form.website_domain },
      { key: 'api',            value: form.api_domain },
      { key: 'erp',            value: form.erp_domain },
      { key: 'facebook',       value: form.facebook_url },
      { key: 'instagram',      value: form.instagram_url },
      { key: 'tiktok',         value: form.tiktok_url },
      { key: 'x',              value: form.support_x },
      { key: 'youtube',        value: form.support_youtube },
      { key: 'og_image_url',   value: form.og_image_url },
      { key: 'twitter_image_url', value: form.twitter_image_url },
      { key: 'canonical_url',  value: form.canonical_url },
      { key: 'link_apk',       value: form.link_apk },
      { key: 'link_ios',       value: form.link_ios },
      { key: 'link_cs',        value: form.link_cs },
      { key: 'link_referral_base', value: form.link_referral_base },
      { key: 'link_cdn',       value: form.link_cdn },
      { key: 'link_promotion', value: form.link_promotion },
      { key: 'link_vip',       value: form.link_vip },
    ];
    const errs: Partial<Record<UrlErrorKey, string>> = {};
    for (const { key, value } of URL_FIELDS) {
      if (value && !isValidUrl(value)) errs[key] = '格式无效，请输入完整 URL';
    }
    setUrlErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validateUrls()) { show('请修正 URL 格式错误后再保存', 'error'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/settings/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSavePatch(form)),
      });
      let d: { ok?: boolean; error?: string; brand?: BrandSettings } = {};
      try { d = await r.json() as typeof d; } catch { /* empty */ }
      if (!r.ok) { show(d.error ?? `保存失败 (${r.status})`, 'error'); return; }
      if (d.brand) { setForm(initForm(d.brand)); }
      show('品牌设置已保存');
    } catch {
      show('网络错误，保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Auto-fill api_domain / erp_domain from website_domain when auto_detect is on
  useEffect(() => {
    if (!form.auto_detect_domain || !form.website_domain) return;
    try {
      const u = new URL(
        form.website_domain.startsWith('http') ? form.website_domain : `https://${form.website_domain}`
      );
      const host = u.hostname.replace(/^www\./, '');
      setForm(f => ({
        ...f,
        api_domain: `https://api.${host}`,
        erp_domain: `https://erp.${host}`,
      }));
    } catch { /* invalid URL, skip */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.auto_detect_domain, form.website_domain]);

  function handleMediaSelect(media: MediaRecord | MediaRecord[]) {
    const item = Array.isArray(media) ? media[0] : media;
    if (!item) return;
    const MAP: Record<NonNullable<PickerTarget>, keyof FormState> = {
      logo:         'logo_media_id',
      favicon:      'favicon_media_id',
      loading_logo: 'loading_logo_media_id',
      pwa_icon:     'pwa_icon_media_id',
      apple_touch:  'apple_touch_media_id',
      og_image:     'og_image_media_id',
      share_image:  'share_image_media_id',
      splash_image: 'splash_image_media_id',
    };
    if (pickerFor && MAP[pickerFor]) {
      setForm(f => ({ ...f, [MAP[pickerFor!]]: item.id }));
    }
    setPickerFor(null);
  }

  // Debounced auto-save on form changes (only after initial load)
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!initialLoadDone.current) { initialLoadDone.current = !loading; return; }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { /* no auto-save, keep as manual save only */ }, 0);
  }, [form, loading]);

  if (permitted === null || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  if (!permitted) return <AccessDenied />;

  // Auto-generated variables (computed from form state)
  const VARIABLES = [
    { name: 'brand_name',    value: form.brand_name },
    { name: 'website_name',  value: form.website_name || form.brand_name },
    { name: 'company_name',  value: form.company_name },
    { name: 'tagline',       value: form.tagline },
    { name: 'website',       value: form.website_domain },
    { name: 'telegram',      value: form.support_telegram },
    { name: 'whatsapp',      value: form.support_whatsapp },
    { name: 'tg_channel',    value: form.telegram_channel },
    { name: 'member_id_prefix', value: form.member_id_prefix },
    { name: 'referral_prefix', value: form.referral_prefix },
    { name: 'support_email', value: form.support_email },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {toast && <ToastBanner toast={toast} onDismiss={clear} />}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">品牌中心</h1>
          <p className="text-sm text-gray-500 mt-1">品牌身份、资产、域名、联系方式的单一配置源</p>
        </div>
        <button onClick={() => void handleSave()} disabled={saving}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
          {saving && <Loader2 size={14} className="animate-spin" />}
          保存
        </button>
      </div>

      {/* 1. 品牌身份 */}
      <Section title="1. 品牌身份">
        <div className="grid grid-cols-2 gap-4">
          <Field label="品牌名称">
            <TextInput value={form.brand_name} onChange={v => set('brand_name', v)} placeholder="Tesla88" />
          </Field>
          <Field label="公司名称">
            <TextInput value={form.company_name} onChange={v => set('company_name', v)} placeholder="Tesla88 Sdn Bhd" />
          </Field>
          <Field label="网站名称 (website_name)">
            <TextInput value={form.website_name} onChange={v => set('website_name', v)} placeholder="与品牌名相同则留空" />
          </Field>
          <Field label="简称 (short_name)">
            <TextInput value={form.short_name} onChange={v => set('short_name', v)} placeholder="T88" />
          </Field>
          <Field label="会员 ID 前缀" hint="2–6位，仅限 A–Z 0–9，仅影响新注册">
            <TextInput
              value={form.member_id_prefix}
              onChange={v => set('member_id_prefix', v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="SS"
            />
          </Field>
          <Field label="推荐码前缀 (referral_prefix)">
            <TextInput
              value={form.referral_prefix}
              onChange={v => set('referral_prefix', v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="REF"
            />
          </Field>
        </div>
        <Field label="标语 (Tagline)">
          <TextInput value={form.tagline} onChange={v => set('tagline', v)} placeholder="Best Online Casino in Malaysia" />
        </Field>
        <Field label="品牌简介">
          <TextArea value={form.description} onChange={v => set('description', v)} placeholder="一段描述品牌的文字，用于 About 页面、SEO 等" rows={3} />
        </Field>
      </Section>

      {/* 2. 品牌资产 */}
      <Section title="2. 品牌资产">
        <div className="grid grid-cols-2 gap-6">
          <MediaAssetField label="Logo" hint="推荐 512×512 PNG，< 200 KB"
            mediaId={form.logo_media_id}
            onSelect={() => setPickerFor('logo')} onRemove={() => set('logo_media_id', null)} />
          <MediaAssetField label="Favicon" hint="推荐 128×128 ICO/PNG，< 50 KB"
            mediaId={form.favicon_media_id}
            onSelect={() => setPickerFor('favicon')} onRemove={() => set('favicon_media_id', null)} />
          <MediaAssetField label="加载 Logo (loading_logo)" hint="启动屏/Loading 动画用，SVG 或 PNG"
            mediaId={form.loading_logo_media_id}
            onSelect={() => setPickerFor('loading_logo')} onRemove={() => set('loading_logo_media_id', null)} />
          <MediaAssetField label="PWA 图标 (192×192)" hint="Android 主屏图标，PNG"
            mediaId={form.pwa_icon_media_id}
            onSelect={() => setPickerFor('pwa_icon')} onRemove={() => set('pwa_icon_media_id', null)} />
          <MediaAssetField label="Apple Touch 图标 (180×180)" hint="iOS 主屏图标，PNG"
            mediaId={form.apple_touch_media_id}
            onSelect={() => setPickerFor('apple_touch')} onRemove={() => set('apple_touch_media_id', null)} />
          <MediaAssetField label="OG 分享图" hint="1200×630 推荐，社交媒体预览图"
            mediaId={form.og_image_media_id}
            onSelect={() => setPickerFor('og_image')} onRemove={() => set('og_image_media_id', null)} />
          <MediaAssetField label="Share 图片" hint="通用分享图，PNG / JPG"
            mediaId={form.share_image_media_id}
            onSelect={() => setPickerFor('share_image')} onRemove={() => set('share_image_media_id', null)} />
          <MediaAssetField label="Splash Screen" hint="APP 启动屏背景，建议 1242×2688"
            mediaId={form.splash_image_media_id}
            onSelect={() => setPickerFor('splash_image')} onRemove={() => set('splash_image_media_id', null)} />
        </div>
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
          <Field label="Logo 尺寸">
            <select value={form.logo_size} onChange={e => set('logo_size', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="small">Small (32px)</option>
              <option value="medium">Medium (48px)</option>
              <option value="large">Large (64px)</option>
              <option value="xlarge">Extra Large (80px)</option>
            </select>
          </Field>
          <Field label="Logo 对齐">
            <div className="flex gap-2">
              {(['left', 'center', 'right'] as const).map(a => (
                <button key={a} type="button" onClick={() => set('logo_align', a)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${form.logo_align === a ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  {a === 'left' ? '◀ 左' : a === 'center' ? '● 中' : '右 ▶'}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      {/* 3. 主题（仅跳转，颜色在设计系统管理）*/}
      <Section title="3. 主题">
        <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <Palette size={28} className="text-blue-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-900">品牌配色在设计系统中管理</p>
            <p className="text-xs text-blue-700 mt-0.5">主色、辅色、背景色、卡片色、文字色 → 在设计系统中统一配置，不在品牌中心重复设置</p>
          </div>
          <Link href="/design-system"
            className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">
            前往设计系统 →
          </Link>
        </div>
      </Section>

      {/* 4. 域名 */}
      <Section title="4. 域名">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <input type="checkbox" id="auto_detect" checked={form.auto_detect_domain}
            onChange={e => set('auto_detect_domain', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300" />
          <label htmlFor="auto_detect" className="text-sm text-gray-700 cursor-pointer select-none">
            自动检测子域名（根据 Website 域名自动生成 api. 和 erp. 前缀）
          </label>
        </div>
        <UrlField label="Website 域名" placeholder="https://apidemo.club"
          value={form.website_domain} onChange={v => set('website_domain', v)}
          error={urlErrors.website} />
        <UrlField label="API 域名" placeholder="https://api.apidemo.club"
          value={form.api_domain} onChange={v => set('api_domain', v)}
          error={urlErrors.api} hint={form.auto_detect_domain ? '已开启自动检测，此字段自动填充' : undefined} />
        <UrlField label="ERP 后台域名" placeholder="https://erp.apidemo.club"
          value={form.erp_domain} onChange={v => set('erp_domain', v)}
          error={urlErrors.erp} hint={form.auto_detect_domain ? '已开启自动检测，此字段自动填充' : undefined} />
      </Section>

      {/* 5. 联系方式 */}
      <Section title="5. 联系方式" collapsible>
        <div className="grid grid-cols-2 gap-4">
          <Field label="WhatsApp">
            <TextInput value={form.support_whatsapp} onChange={v => set('support_whatsapp', v)} placeholder="+601234567890" />
          </Field>
          <Field label="Telegram">
            <TextInput value={form.support_telegram} onChange={v => set('support_telegram', v)} placeholder="@support_bot" />
          </Field>
          <Field label="Telegram 频道">
            <TextInput value={form.telegram_channel} onChange={v => set('telegram_channel', v)} placeholder="@mybrand_channel" />
          </Field>
          <Field label="Facebook">
            <TextInput value={form.facebook_url} onChange={v => set('facebook_url', v)} placeholder="https://facebook.com/mybrand" />
            {urlErrors.facebook && <p className="text-xs text-red-500 mt-1">{urlErrors.facebook}</p>}
          </Field>
          <Field label="Instagram">
            <TextInput value={form.instagram_url} onChange={v => set('instagram_url', v)} placeholder="https://instagram.com/mybrand" />
            {urlErrors.instagram && <p className="text-xs text-red-500 mt-1">{urlErrors.instagram}</p>}
          </Field>
          <Field label="TikTok">
            <TextInput value={form.tiktok_url} onChange={v => set('tiktok_url', v)} placeholder="https://tiktok.com/@mybrand" />
            {urlErrors.tiktok && <p className="text-xs text-red-500 mt-1">{urlErrors.tiktok}</p>}
          </Field>
          <Field label="X / Twitter">
            <TextInput value={form.support_x} onChange={v => set('support_x', v)} placeholder="https://x.com/mybrand" />
            {urlErrors.x && <p className="text-xs text-red-500 mt-1">{urlErrors.x}</p>}
          </Field>
          <Field label="YouTube">
            <TextInput value={form.support_youtube} onChange={v => set('support_youtube', v)} placeholder="https://youtube.com/@mybrand" />
            {urlErrors.youtube && <p className="text-xs text-red-500 mt-1">{urlErrors.youtube}</p>}
          </Field>
          <Field label="Line">
            <TextInput value={form.support_line} onChange={v => set('support_line', v)} placeholder="@mybrand_line" />
          </Field>
          <Field label="WeChat">
            <TextInput value={form.support_wechat} onChange={v => set('support_wechat', v)} placeholder="mybrand_wechat" />
          </Field>
          <Field label="Messenger">
            <TextInput value={form.support_messenger} onChange={v => set('support_messenger', v)} placeholder="https://m.me/mybrand" />
          </Field>
          <Field label="Discord">
            <TextInput value={form.support_discord} onChange={v => set('support_discord', v)} placeholder="https://discord.gg/mybrand" />
          </Field>
          <Field label="Viber">
            <TextInput value={form.support_viber} onChange={v => set('support_viber', v)} placeholder="viber://chat?number=601234567890" />
          </Field>
          <Field label="支持邮箱">
            <TextInput type="email" value={form.support_email} onChange={v => set('support_email', v)} placeholder="support@apidemo.club" />
          </Field>
          <Field label="支持电话">
            <TextInput value={form.support_phone} onChange={v => set('support_phone', v)} placeholder="+60123456789" />
          </Field>
        </div>
      </Section>

      {/* 6. SEO */}
      <Section title="6. SEO" collapsible>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">基础 SEO</p>
        <Field label="页面标题 (title)">
          <TextInput value={form.seo_title} onChange={v => set('seo_title', v)} placeholder="Tesla88 — Best Online Casino" />
        </Field>
        <Field label="描述 (description)">
          <TextArea value={form.seo_description} onChange={v => set('seo_description', v)} placeholder="Meta description..." />
        </Field>
        <Field label="关键词 (keywords)">
          <TextInput value={form.seo_keywords} onChange={v => set('seo_keywords', v)} placeholder="casino, slots, malaysia" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="作者 (author)">
            <TextInput value={form.seo_author} onChange={v => set('seo_author', v)} placeholder="Tesla88 Team" />
          </Field>
          <Field label="Robots">
            <select value={form.robots} onChange={e => set('robots', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="index, follow">index, follow</option>
              <option value="noindex, nofollow">noindex, nofollow</option>
              <option value="noindex, follow">noindex, follow</option>
              <option value="index, nofollow">index, nofollow</option>
            </select>
          </Field>
        </div>
        <UrlField label="Canonical URL (可选)" value={form.canonical_url} onChange={v => set('canonical_url', v)} error={urlErrors.canonical_url} placeholder="https://apidemo.club" />

        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">Open Graph</p>
          <div className="space-y-3">
            <Field label="OG 标题">
              <TextInput value={form.og_title} onChange={v => set('og_title', v)} placeholder="与 SEO 标题相同则留空" />
            </Field>
            <Field label="OG 描述">
              <TextArea value={form.og_description} onChange={v => set('og_description', v)} placeholder="与 SEO 描述相同则留空" />
            </Field>
            <UrlField label="OG 图片 URL" value={form.og_image_url} onChange={v => set('og_image_url', v)} error={urlErrors.og_image_url} placeholder="https://apidemo.club/og.jpg（或使用上方 OG 分享图媒体）" />
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">Twitter Card</p>
          <div className="space-y-3">
            <Field label="Card 类型">
              <select value={form.twitter_card} onChange={e => set('twitter_card', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="summary_large_image">summary_large_image</option>
                <option value="summary">summary</option>
              </select>
            </Field>
            <Field label="Twitter 标题">
              <TextInput value={form.twitter_title} onChange={v => set('twitter_title', v)} placeholder="与 OG 标题相同则留空" />
            </Field>
            <Field label="Twitter 描述">
              <TextArea value={form.twitter_description} onChange={v => set('twitter_description', v)} placeholder="与 OG 描述相同则留空" />
            </Field>
            <UrlField label="Twitter 图片 URL" value={form.twitter_image_url} onChange={v => set('twitter_image_url', v)} error={urlErrors.twitter_image_url} placeholder="https://apidemo.club/twitter.jpg" />
          </div>
        </div>
      </Section>

      {/* 7. 品牌链接 */}
      <Section title="7. 品牌链接" collapsible>
        <div className="grid grid-cols-2 gap-4">
          <UrlField label="APK 下载链接" value={form.link_apk} onChange={v => set('link_apk', v)} error={urlErrors.link_apk} placeholder="https://cdn.apidemo.club/app.apk" />
          <UrlField label="iOS / App Store" value={form.link_ios} onChange={v => set('link_ios', v)} error={urlErrors.link_ios} placeholder="https://apps.apple.com/..." />
          <Field label="TG Bot 链接">
            <TextInput value={form.link_tg_bot} onChange={v => set('link_tg_bot', v)} placeholder="https://t.me/mybrand_bot" />
          </Field>
          <Field label="TG 频道链接">
            <TextInput value={form.link_tg_channel} onChange={v => set('link_tg_channel', v)} placeholder="https://t.me/mybrand_channel" />
          </Field>
          <UrlField label="客服链接 (CS)" value={form.link_cs} onChange={v => set('link_cs', v)} error={urlErrors.link_cs} placeholder="https://wa.me/601234567890" />
          <UrlField label="推荐基础 URL" value={form.link_referral_base} onChange={v => set('link_referral_base', v)} error={urlErrors.link_referral_base} placeholder="https://apidemo.club/ref/" />
          <UrlField label="CDN URL" value={form.link_cdn} onChange={v => set('link_cdn', v)} error={urlErrors.link_cdn} placeholder="https://cdn.apidemo.club" />
          <UrlField label="优惠活动 URL" value={form.link_promotion} onChange={v => set('link_promotion', v)} error={urlErrors.link_promotion} placeholder="https://apidemo.club/promotions" />
          <UrlField label="VIP 页面 URL" value={form.link_vip} onChange={v => set('link_vip', v)} error={urlErrors.link_vip} placeholder="https://apidemo.club/vip" />
        </div>
      </Section>

      {/* 8. 系统信息 */}
      <Section title="8. 系统信息" collapsible>
        <div className="grid grid-cols-2 gap-4">
          <Field label="时区">
            <select value={form.sys_timezone} onChange={e => set('sys_timezone', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {[
                'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Bangkok', 'Asia/Jakarta',
                'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei', 'Asia/Seoul',
                'Asia/Tokyo', 'UTC',
              ].map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </Field>
          <Field label="语言">
            <select value={form.sys_language} onChange={e => set('sys_language', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {[
                ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en', 'English'],
                ['ms', 'Bahasa Malaysia'], ['th', 'ภาษาไทย'], ['id', 'Bahasa Indonesia'],
                ['vi', 'Tiếng Việt'], ['ko', '한국어'], ['ja', '日本語'],
              ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="国家/地区">
            <select value={form.sys_country} onChange={e => set('sys_country', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {[['MY', '🇲🇾 Malaysia'], ['SG', '🇸🇬 Singapore'], ['TH', '🇹🇭 Thailand'],
                ['ID', '🇮🇩 Indonesia'], ['HK', '🇭🇰 Hong Kong'], ['CN', '🇨🇳 China'],
                ['TW', '🇹🇼 Taiwan'], ['KR', '🇰🇷 Korea'], ['JP', '🇯🇵 Japan'], ['VN', '🇻🇳 Vietnam'],
              ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Locale">
            <select value={form.sys_locale} onChange={e => set('sys_locale', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {[
                'ms-MY', 'en-MY', 'zh-CN', 'zh-TW', 'en-SG', 'th-TH',
                'id-ID', 'vi-VN', 'ko-KR', 'ja-JP',
              ].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
        </div>

        {/* Read-only system info */}
        <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
          {[
            ['App Version', erpConfig.app_version ?? '—'],
            ['Environment', erpConfig.node_env ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-500">{k}:</span>
              <span className="font-medium text-gray-900">{v}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 9. 变量（只读） */}
      <Section title="9. 模板变量（只读）" collapsible>
        <p className="text-xs text-gray-500">在 Widget 文字中使用这些变量，发布时自动替换为实际值</p>
        <div className="grid grid-cols-2 gap-2">
          {VARIABLES.map(v => <VarBadge key={v.name} name={v.name} value={v.value} />)}
        </div>
      </Section>

      {/* Save button (bottom) */}
      <div className="flex justify-end pb-8">
        <button onClick={() => void handleSave()} disabled={saving}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
          {saving && <Loader2 size={14} className="animate-spin" />}
          保存品牌设置
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
