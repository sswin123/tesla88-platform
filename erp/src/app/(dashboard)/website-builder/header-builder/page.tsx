'use client';
import { useState, useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WidgetType =
  | 'social' | 'button' | 'language' | 'partner' | 'profile' | 'divider';

export type SocialPlatform =
  | 'whatsapp' | 'telegram' | 'facebook' | 'instagram'
  | 'tiktok' | 'youtube' | 'discord' | 'line' | 'x' | 'custom';

export type OpenMode    = 'same' | 'new' | 'popup';
export type Visibility  = 'both' | 'desktop' | 'mobile';
export type ButtonVariant = 'primary' | 'outline' | 'ghost';
export type BadgeLabel  = 'NEW' | 'HOT' | 'VIP' | 'LIVE' | '';
export type ProfileAction = 'profile' | 'login' | 'custom';

export interface SocialSettings {
  platform: SocialPlatform;
  url: string;
  label?: string;
  open: OpenMode;
}

export interface ButtonSettings {
  text: string;
  url: string;
  open: OpenMode;
  variant: ButtonVariant;
  badge: BadgeLabel;
  icon?: string;
}

export interface LanguageSettings {
  languages: Array<{ code: string; label: string; flag: string }>;
}

export interface PartnerItem {
  id: string;
  name: string;
  logo_media_id?: number;
  logo_url?: string;
  url: string;
  open: OpenMode;
  popup_title?: string;
  popup_description?: string;
  popup_whatsapp?: string;
  popup_telegram?: string;
  popup_facebook?: string;
  popup_instagram?: string;
  popup_youtube?: string;
}

export interface PartnerSettings {
  partners: PartnerItem[];
  display_type: 'single' | 'carousel' | 'list';
  display_style: 'image_only' | 'image_text' | 'text_only';
  logo_size: 'small' | 'medium' | 'large' | 'xlarge';
  shape: 'square' | 'rounded' | 'circle';
  hover_effect: 'none' | 'scale' | 'glow' | 'pulse';
  bg_style: 'transparent' | 'glass' | 'solid' | 'outline' | 'pill';
  badge: '' | 'NEW' | 'HOT' | 'VIP' | 'Official' | 'Sponsor' | 'Partner';
}

export interface ProfileSettings {
  action: ProfileAction;
  custom_url?: string;
  custom_icon?: string;
  tooltip?: string;
}

export interface HeaderWidget {
  id: string;
  type: WidgetType;
  enabled: boolean;
  visibility: Visibility;
  settings: SocialSettings | ButtonSettings | LanguageSettings | PartnerSettings | ProfileSettings | Record<string, never>;
}

export type HeaderLayout = 'left-logo' | 'center-logo' | 'right-logo';
export type HeaderStyle  = 'classic' | 'minimal' | 'glass' | 'solid' | 'gradient';

export interface HeaderConfig {
  layout: HeaderLayout;
  style: HeaderStyle;
  sticky: boolean;
  blur: boolean;
  show_menu_button: boolean;
  show_announcement: boolean;
  show_logo: boolean;
  show_brand_text: boolean;
  show_profile_widget: boolean;
  show_header_widgets: boolean;
  widgets: HeaderWidget[];
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function puid() { return `p-${Date.now()}-${Math.random().toString(36).slice(2,6)}`; }

const DEFAULT_CONFIG: HeaderConfig = {
  layout: 'left-logo',
  style: 'classic',
  sticky: true,
  blur: true,
  show_menu_button: true,
  show_announcement: true,
  show_logo: true,
  show_brand_text: false,
  show_profile_widget: true,
  show_header_widgets: true,
  widgets: [
    {
      id: 'w-whatsapp',
      type: 'social',
      enabled: true,
      visibility: 'both',
      settings: { platform: 'whatsapp', url: '', open: 'new' },
    },
    {
      id: 'w-telegram',
      type: 'social',
      enabled: true,
      visibility: 'both',
      settings: { platform: 'telegram', url: '', open: 'new' },
    },
    {
      id: 'w-language',
      type: 'language',
      enabled: true,
      visibility: 'desktop',
      settings: {
        languages: [
          { code: 'zh', label: '中文', flag: '🇨🇳' },
          { code: 'en', label: 'English', flag: '🇬🇧' },
          { code: 'ms', label: 'Malay', flag: '🇲🇾' },
        ],
      },
    },
    {
      id: 'w-profile',
      type: 'profile',
      enabled: true,
      visibility: 'both',
      settings: { action: 'profile', tooltip: '我的账户' },
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

const SOCIAL_ICONS: Record<SocialPlatform, string> = {
  whatsapp: '📱', telegram: '✈️', facebook: '👤', instagram: '📸',
  tiktok: '🎵', youtube: '▶️', discord: '🎮', line: '💬',
  x: '𝕏', custom: '🔗',
};

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  whatsapp: 'WhatsApp', telegram: 'Telegram', facebook: 'Facebook',
  instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube',
  discord: 'Discord', line: 'LINE', x: 'X (Twitter)', custom: '自定义',
};

const PLATFORMS: SocialPlatform[] = [
  'whatsapp', 'telegram', 'facebook', 'instagram',
  'tiktok', 'youtube', 'discord', 'line', 'x', 'custom',
];

function widgetLabel(w: HeaderWidget): string {
  if (w.type === 'social')   return SOCIAL_LABELS[(w.settings as SocialSettings).platform] ?? '社交';
  if (w.type === 'button')   return (w.settings as ButtonSettings).text || '自定义按钮';
  if (w.type === 'language') return '语言选择';
  if (w.type === 'partner') {
    const first = (w.settings as PartnerSettings).partners?.[0];
    return first?.name || '合作伙伴';
  }
  if (w.type === 'profile')  return '个人中心';
  if (w.type === 'divider')  return '分隔线';
  return '组件';
}

function widgetIcon(w: HeaderWidget): string {
  if (w.type === 'social')   return SOCIAL_ICONS[(w.settings as SocialSettings).platform] ?? '🔗';
  if (w.type === 'button')   return '🔘';
  if (w.type === 'language') return '🌐';
  if (w.type === 'partner')  return '🤝';
  if (w.type === 'profile')  return '👤';
  if (w.type === 'divider')  return '│';
  return '📦';
}

const STYLE_MAP: Record<HeaderStyle, { label: string; preview: string }> = {
  classic:  { label: '经典',   preview: 'bg-gray-900/95 border-b border-white/10' },
  minimal:  { label: '简约',   preview: 'bg-transparent border-b border-white/20' },
  glass:    { label: '玻璃',   preview: 'bg-white/5 backdrop-blur border-b border-white/15' },
  solid:    { label: '实色',   preview: 'bg-gray-950 border-b border-gray-800' },
  gradient: { label: '渐变',   preview: 'bg-gradient-to-r from-purple-900 to-indigo-900' },
};

const LAYOUT_OPTIONS: Array<{ value: HeaderLayout; label: string; desc: string }> = [
  { value: 'left-logo',   label: '左对齐', desc: '☰ Logo ········ 组件 👤' },
  { value: 'center-logo', label: '居中',   desc: '☰ ·· Logo ·· 组件 👤' },
  { value: 'right-logo',  label: '右对齐', desc: '组件 ········ Logo' },
];

// ── Logo size map ─────────────────────────────────────────────────────────────

const PARTNER_LOGO_SIZE: Record<string, number> = {
  small: 20, medium: 28, large: 36, xlarge: 44,
};

// ── Media Upload component ────────────────────────────────────────────────────

function MediaUploadHint({ rec, ratio, maxMB, formats, note }: {
  rec: string; ratio: string; maxMB: number; formats: string[]; note?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-600 bg-gray-800/50 px-3 py-2 text-[10px] text-gray-500 space-y-0.5">
      <p><span className="text-gray-400 font-medium">推荐尺寸：</span>{rec}</p>
      <p><span className="text-gray-400 font-medium">宽高比：</span>{ratio}</p>
      <p><span className="text-gray-400 font-medium">最大：</span>{maxMB}MB</p>
      <p><span className="text-gray-400 font-medium">格式：</span>{formats.join(' • ')}</p>
      {note && <p className="text-amber-500">{note}</p>}
    </div>
  );
}

function ImageUploadField({ label, mediaId, previewUrl, onUpload, onRemove, hint }: {
  label: string;
  mediaId?: number;
  previewUrl?: string;
  onUpload: (mediaId: number, url: string) => void;
  onRemove: () => void;
  hint: React.ReactNode;
}) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const displayUrl = mediaId ? `/api/public/media/${mediaId}` : previewUrl;

  async function handleFile(file: File) {
    setUploading(true); setErr('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('display_name', file.name);
    try {
      const res  = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const json = await res.json() as { record?: { id: number }; error?: string };
      if (!res.ok || !json.record) { setErr(json.error ?? '上传失败'); return; }
      onUpload(json.record.id, `/api/public/media/${json.record.id}`);
    } catch { setErr('上传失败'); }
    finally { setUploading(false); }
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-400">{label}</label>
      {displayUrl ? (
        <div className="relative group">
          <img src={displayUrl} alt="logo" className="h-14 object-contain rounded-lg bg-gray-800 px-2 py-1" />
          <div className="absolute inset-0 hidden group-hover:flex items-center justify-center gap-2 rounded-lg bg-black/60">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="text-xs px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-white">替换</button>
            <button type="button" onClick={onRemove}
              className="text-xs px-2 py-1 bg-red-500/80 hover:bg-red-500 rounded text-white">删除</button>
          </div>
        </div>
      ) : (
        <button type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex flex-col items-center justify-center gap-1 h-16 rounded-lg border-2 border-dashed border-gray-600 hover:border-violet-500 bg-gray-800 transition-colors text-gray-500 hover:text-violet-400 disabled:opacity-50"
        >
          {uploading ? <span className="text-xs">上传中…</span> : (
            <>
              <span className="text-lg">📁</span>
              <span className="text-xs">点击上传</span>
            </>
          )}
        </button>
      )}
      {err && <p className="text-xs text-red-400">{err}</p>}
      {hint}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
    </div>
  );
}

// ── Widget Editors ────────────────────────────────────────────────────────────

function SocialEditor({ settings, onChange }: {
  settings: SocialSettings; onChange: (s: SocialSettings) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">平台</label>
        <select value={settings.platform}
          onChange={e => onChange({ ...settings, platform: e.target.value as SocialPlatform })}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
          {PLATFORMS.map(p => (
            <option key={p} value={p}>{SOCIAL_ICONS[p]} {SOCIAL_LABELS[p]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">链接 URL</label>
        <input value={settings.url}
          onChange={e => onChange({ ...settings, url: e.target.value })}
          placeholder={settings.platform === 'whatsapp' ? 'https://wa.me/601xxxxxxxx' : 'https://t.me/username'}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">显示标签（可选）</label>
        <input value={settings.label ?? ''}
          onChange={e => onChange({ ...settings, label: e.target.value })}
          placeholder={SOCIAL_LABELS[settings.platform]}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">打开方式</label>
        <div className="flex gap-2">
          {(['new', 'same', 'popup'] as OpenMode[]).map(m => (
            <button key={m} type="button"
              onClick={() => onChange({ ...settings, open: m })}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                settings.open === m ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}>
              {m === 'new' ? '新窗口' : m === 'same' ? '当前' : '弹窗'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ButtonEditor({ settings, onChange }: {
  settings: ButtonSettings; onChange: (s: ButtonSettings) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">按钮文字</label>
        <input value={settings.text}
          onChange={e => onChange({ ...settings, text: e.target.value })}
          placeholder="VIP / 联盟 / 下载 APP"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">链接 URL</label>
        <input value={settings.url}
          onChange={e => onChange({ ...settings, url: e.target.value })}
          placeholder="/vip 或 https://..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">样式</label>
        <div className="flex gap-2">
          {(['primary', 'outline', 'ghost'] as ButtonVariant[]).map(v => (
            <button key={v} type="button"
              onClick={() => onChange({ ...settings, variant: v })}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                settings.variant === v ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}>
              {v === 'primary' ? '实心' : v === 'outline' ? '描边' : '文字'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">徽章</label>
        <div className="flex gap-2 flex-wrap">
          {(['', 'NEW', 'HOT', 'VIP', 'LIVE'] as BadgeLabel[]).map(b => (
            <button key={b || 'none'} type="button"
              onClick={() => onChange({ ...settings, badge: b })}
              className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors ${
                settings.badge === b ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}>{b || '无'}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">图标 Emoji（可选）</label>
        <input value={settings.icon ?? ''}
          onChange={e => onChange({ ...settings, icon: e.target.value })}
          placeholder="👑 🎰 ⬇️"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">打开方式</label>
        <div className="flex gap-2">
          {(['same', 'new'] as OpenMode[]).map(m => (
            <button key={m} type="button"
              onClick={() => onChange({ ...settings, open: m })}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                settings.open === m ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}>
              {m === 'new' ? '新窗口' : '当前窗口'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LanguageEditor({ settings, onChange }: {
  settings: LanguageSettings; onChange: (s: LanguageSettings) => void;
}) {
  const langs = settings.languages ?? [];
  function updateLang(i: number, field: 'code' | 'label' | 'flag', val: string) {
    onChange({ ...settings, languages: langs.map((l, idx) => idx === i ? { ...l, [field]: val } : l) });
  }
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-400">语言列表</label>
      {langs.map((l, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input value={l.flag} onChange={e => updateLang(i, 'flag', e.target.value)}
            className="w-10 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-center" placeholder="🇲🇾" />
          <input value={l.label} onChange={e => updateLang(i, 'label', e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white" placeholder="中文" />
          <input value={l.code} onChange={e => updateLang(i, 'code', e.target.value)}
            className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-400" placeholder="zh" />
          <button type="button" onClick={() => onChange({ ...settings, languages: langs.filter((_, idx) => idx !== i) })}
            className="text-red-400 text-xs px-1">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...settings, languages: [...langs, { code: '', label: '', flag: '🏳️' }] })}
        className="text-xs text-violet-400 hover:text-violet-300">+ 添加语言</button>
    </div>
  );
}

function PartnerItemForm({ item, onChange, onRemove }: {
  item: PartnerItem;
  onChange: (p: PartnerItem) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-gray-700 rounded-xl p-3 space-y-2.5 bg-gray-800/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-300">{item.name || '新合作伙伴'}</span>
        <button type="button" onClick={onRemove} className="text-red-400 text-xs hover:text-red-300">✕</button>
      </div>

      <ImageUploadField
        label="Logo / GIF"
        mediaId={item.logo_media_id}
        previewUrl={item.logo_url}
        onUpload={(id, url) => onChange({ ...item, logo_media_id: id, logo_url: url })}
        onRemove={() => onChange({ ...item, logo_media_id: undefined, logo_url: undefined })}
        hint={
          <MediaUploadHint rec="120 × 120 px" ratio="1:1" maxMB={3}
            formats={['PNG', 'WEBP', 'GIF', 'SVG']} note="推荐透明背景 PNG" />
        }
      />

      <div>
        <label className="block text-xs text-gray-400 mb-1">名称</label>
        <input value={item.name}
          onChange={e => onChange({ ...item, name: e.target.value })}
          placeholder="Menang Group"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">链接 URL</label>
        <input value={item.url}
          onChange={e => onChange({ ...item, url: e.target.value })}
          placeholder="https://partner.com"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">打开方式</label>
        <div className="flex gap-2">
          {(['new', 'same', 'popup'] as OpenMode[]).map(m => (
            <button key={m} type="button"
              onClick={() => onChange({ ...item, open: m })}
              className={`flex-1 py-1 rounded text-xs font-medium border transition-colors ${
                item.open === m ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-400'
              }`}>
              {m === 'new' ? '新窗口' : m === 'same' ? '当前' : '弹窗'}
            </button>
          ))}
        </div>
      </div>
      {item.open === 'popup' && (
        <div className="space-y-2 pt-1 border-t border-gray-700">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">弹窗内容</p>
          {[
            ['popup_title', '弹窗标题'],
            ['popup_description', '简介'],
            ['popup_whatsapp', 'WhatsApp URL'],
            ['popup_telegram', 'Telegram URL'],
            ['popup_facebook', 'Facebook URL'],
            ['popup_instagram', 'Instagram URL'],
            ['popup_youtube', 'YouTube URL'],
          ].map(([k, lbl]) => (
            <div key={k}>
              <label className="block text-[10px] text-gray-500 mb-0.5">{lbl}</label>
              <input value={(item[k as keyof PartnerItem] as string) ?? ''}
                onChange={e => onChange({ ...item, [k]: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PartnerEditor({ settings, onChange }: {
  settings: PartnerSettings; onChange: (s: PartnerSettings) => void;
}) {
  const partners = settings.partners ?? [];

  function updateItem(i: number, updated: PartnerItem) {
    onChange({ ...settings, partners: partners.map((p, idx) => idx === i ? updated : p) });
  }
  function removeItem(i: number) {
    onChange({ ...settings, partners: partners.filter((_, idx) => idx !== i) });
  }
  function addItem() {
    onChange({ ...settings, partners: [...partners, { id: puid(), name: '', url: '', open: 'new' as OpenMode }] });
  }

  return (
    <div className="space-y-3">
      {/* Display settings */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-400 mb-1">显示样式</label>
          <select value={settings.display_style}
            onChange={e => onChange({ ...settings, display_style: e.target.value as PartnerSettings['display_style'] })}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white">
            <option value="image_only">仅图片</option>
            <option value="image_text">图片+文字</option>
            <option value="text_only">仅文字</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">排列方式</label>
          <select value={settings.display_type}
            onChange={e => onChange({ ...settings, display_type: e.target.value as PartnerSettings['display_type'] })}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white">
            <option value="single">单个</option>
            <option value="carousel">轮播</option>
            <option value="list">列表</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Logo 尺寸</label>
          <select value={settings.logo_size}
            onChange={e => onChange({ ...settings, logo_size: e.target.value as PartnerSettings['logo_size'] })}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white">
            <option value="small">小 20px</option>
            <option value="medium">中 28px</option>
            <option value="large">大 36px</option>
            <option value="xlarge">超大 44px</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">形状</label>
          <select value={settings.shape}
            onChange={e => onChange({ ...settings, shape: e.target.value as PartnerSettings['shape'] })}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white">
            <option value="square">正方形</option>
            <option value="rounded">圆角</option>
            <option value="circle">圆形</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-400 mb-1">悬停效果</label>
          <select value={settings.hover_effect}
            onChange={e => onChange({ ...settings, hover_effect: e.target.value as PartnerSettings['hover_effect'] })}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white">
            <option value="none">无</option>
            <option value="scale">放大</option>
            <option value="glow">发光</option>
            <option value="pulse">脉冲</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">背景样式</label>
          <select value={settings.bg_style}
            onChange={e => onChange({ ...settings, bg_style: e.target.value as PartnerSettings['bg_style'] })}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white">
            <option value="transparent">透明</option>
            <option value="glass">玻璃</option>
            <option value="solid">实色</option>
            <option value="outline">描边</option>
            <option value="pill">胶囊</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">徽章</label>
        <div className="flex gap-1.5 flex-wrap">
          {(['', 'NEW', 'HOT', 'VIP', 'Official', 'Sponsor', 'Partner'] as PartnerSettings['badge'][]).map(b => (
            <button key={b || 'none'} type="button"
              onClick={() => onChange({ ...settings, badge: b })}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                settings.badge === b ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}>{b || '无'}</button>
          ))}
        </div>
      </div>

      {/* Partner list */}
      <div className="pt-2 border-t border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-400">合作伙伴列表</p>
          <button type="button" onClick={addItem}
            className="text-xs text-violet-400 hover:text-violet-300">+ 添加</button>
        </div>
        {partners.length === 0 && (
          <p className="text-xs text-gray-600 text-center py-4">尚未添加合作伙伴</p>
        )}
        <div className="space-y-2">
          {partners.map((p, i) => (
            <PartnerItemForm key={p.id} item={p}
              onChange={updated => updateItem(i, updated)}
              onRemove={() => removeItem(i)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileEditor({ settings, onChange }: {
  settings: ProfileSettings; onChange: (s: ProfileSettings) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">点击动作</label>
        <div className="flex flex-col gap-2">
          {([
            ['profile', '跳转个人中心', '/profile'],
            ['login',   '跳转登录页',   '/login'],
            ['custom',  '自定义 URL',   ''],
          ] as Array<[ProfileAction, string, string]>).map(([val, label, hint]) => (
            <button key={val} type="button"
              onClick={() => onChange({ ...settings, action: val })}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                settings.action === val
                  ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
              }`}>
              <span className="text-sm">{val === 'profile' ? '👤' : val === 'login' ? '🔑' : '🔗'}</span>
              <div>
                <p className="text-xs font-semibold">{label}</p>
                {hint && <p className="text-[10px] text-gray-500">{hint}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {settings.action === 'custom' && (
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1">自定义 URL</label>
          <input value={settings.custom_url ?? ''}
            onChange={e => onChange({ ...settings, custom_url: e.target.value })}
            placeholder="https://..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">自定义图标 Emoji（可选）</label>
        <input value={settings.custom_icon ?? ''}
          onChange={e => onChange({ ...settings, custom_icon: e.target.value })}
          placeholder="👤 🧑 🙋"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1">Tooltip 提示（可选）</label>
        <input value={settings.tooltip ?? ''}
          onChange={e => onChange({ ...settings, tooltip: e.target.value })}
          placeholder="我的账户"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
      </div>
    </div>
  );
}

// ── Widget Settings Router ─────────────────────────────────────────────────────

function WidgetSettingsEditor({ widget, onChange }: {
  widget: HeaderWidget; onChange: (w: HeaderWidget) => void;
}) {
  function upd(s: HeaderWidget['settings']) { onChange({ ...widget, settings: s }); }
  return (
    <div>
      {widget.type === 'social'   && <SocialEditor   settings={widget.settings as SocialSettings}   onChange={s => upd(s)} />}
      {widget.type === 'button'   && <ButtonEditor   settings={widget.settings as ButtonSettings}   onChange={s => upd(s)} />}
      {widget.type === 'language' && <LanguageEditor settings={widget.settings as LanguageSettings} onChange={s => upd(s)} />}
      {widget.type === 'partner'  && <PartnerEditor  settings={widget.settings as PartnerSettings}  onChange={s => upd(s)} />}
      {widget.type === 'profile'  && <ProfileEditor  settings={widget.settings as ProfileSettings}  onChange={s => upd(s)} />}
      {widget.type === 'divider'  && <p className="text-xs text-gray-500">分隔线无需配置</p>}

      <div className="mt-4 pt-4 border-t border-gray-700">
        <label className="block text-xs font-semibold text-gray-400 mb-2">显示设备</label>
        <div className="flex gap-2">
          {(['both', 'desktop', 'mobile'] as Visibility[]).map(v => (
            <button key={v} type="button"
              onClick={() => onChange({ ...widget, visibility: v })}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                widget.visibility === v ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}>
              {v === 'both' ? '全部' : v === 'desktop' ? '桌面' : '手机'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Header Preview ─────────────────────────────────────────────────────────────

function HeaderPreview({ config }: { config: HeaderConfig }) {
  const widgetPreview = (w: HeaderWidget) => {
    if (!w.enabled) return null;
    if (w.type === 'divider') return <div key={w.id} className="w-px h-5 bg-white/20 mx-1" />;
    if (w.type === 'social') {
      const s = w.settings as SocialSettings;
      return (
        <div key={w.id} className="flex items-center gap-1 px-1.5 py-1 rounded text-xs bg-white/10 text-white/80">
          <span>{SOCIAL_ICONS[s.platform]}</span>
        </div>
      );
    }
    if (w.type === 'language') {
      const s = w.settings as LanguageSettings;
      const first = s.languages?.[0];
      return (
        <div key={w.id} className="flex items-center gap-1 px-1.5 py-1 rounded text-xs border border-white/20 text-white/70">
          <span>{first?.flag ?? '🌐'}</span>
          <span>{first?.label?.slice(0,2) ?? 'EN'}</span>
          <span className="text-white/40 text-[9px]">▾</span>
        </div>
      );
    }
    if (w.type === 'button') {
      const s = w.settings as ButtonSettings;
      return (
        <div key={w.id} className={`relative flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
          s.variant === 'primary' ? 'bg-violet-600 text-white' :
          s.variant === 'outline' ? 'border border-white/30 text-white/80' : 'text-white/70'
        }`}>
          {s.icon && <span>{s.icon}</span>}
          <span>{s.text || '按钮'}</span>
          {s.badge && <span className="absolute -top-1 -right-1 text-[7px] px-0.5 rounded-full bg-red-500 text-white font-bold">{s.badge}</span>}
        </div>
      );
    }
    if (w.type === 'partner') {
      const s = w.settings as PartnerSettings;
      const first = s.partners?.[0];
      const logoUrl = first?.logo_media_id ? `/api/public/media/${first.logo_media_id}` : first?.logo_url;
      const sz = PARTNER_LOGO_SIZE[s.logo_size ?? 'medium'];
      return (
        <div key={w.id} className="flex items-center gap-1 px-1.5 py-1 rounded text-xs bg-white/10 text-white/70">
          {logoUrl
            ? <img src={logoUrl} alt={first?.name} style={{ height: sz, width: 'auto', maxWidth: 60 }} className="object-contain" />
            : <><span>🤝</span><span>{first?.name || '合作伙伴'}</span></>
          }
        </div>
      );
    }
    if (w.type === 'profile') {
      const s = w.settings as ProfileSettings;
      return (
        <div key={w.id} className="flex items-center justify-center w-7 h-7 rounded-full bg-white/10 text-white/70 text-sm">
          {s.custom_icon || '👤'}
        </div>
      );
    }
    return null;
  };

  const showProfile = config.show_profile_widget !== false;
  const showWidgets = config.show_header_widgets !== false;

  const profileWidgets = config.widgets.filter(w => w.type === 'profile' && w.enabled && showProfile);
  const otherWidgets   = config.widgets.filter(w => w.type !== 'profile' && w.enabled && showWidgets);

  const widgetsEl = (
    <div className="flex items-center gap-1">
      {otherWidgets.map(w => widgetPreview(w))}
      {profileWidgets.map(w => widgetPreview(w))}
    </div>
  );

  const logoEl = config.show_logo ? (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className="w-6 h-6 rounded bg-violet-600 flex items-center justify-center text-xs font-bold text-white">L</div>
      {config.show_brand_text && <span className="text-xs font-bold text-white">Brand</span>}
    </div>
  ) : null;

  const menuBtn = config.show_menu_button ? (
    <div className="flex flex-col gap-0.5 p-1 shrink-0">
      <div className="w-4 h-px bg-white/70" />
      <div className="w-4 h-px bg-white/70" />
      <div className="w-4 h-px bg-white/70" />
    </div>
  ) : null;

  const stylePreview = STYLE_MAP[config.style]?.preview ?? '';

  return (
    <div className="rounded-xl overflow-hidden border border-gray-700">
      <div className={`h-11 px-3 ${stylePreview} ${config.layout === 'center-logo' ? 'relative flex items-center' : 'flex items-center gap-2'}`}>
        {config.layout === 'left-logo' && (
          <>{menuBtn}{logoEl}<div className="flex-1" />{widgetsEl}</>
        )}
        {config.layout === 'center-logo' && (
          <>
            <div className="flex items-center gap-2 z-10">{menuBtn}</div>
            <div className="absolute left-1/2 -translate-x-1/2">{logoEl}</div>
            <div className="ml-auto flex items-center z-10">{widgetsEl}</div>
          </>
        )}
        {config.layout === 'right-logo' && (
          <>{menuBtn}<div className="flex-1 flex">{widgetsEl}</div>{logoEl}</>
        )}
      </div>
      {config.show_announcement && (
        <div className="h-5 flex items-center px-3 bg-black/20 border-t border-white/5">
          <p className="text-[9px] text-gray-400 truncate">📢 公告滚动显示区域…</p>
        </div>
      )}
    </div>
  );
}

// ── Widget Templates ──────────────────────────────────────────────────────────

const WIDGET_TEMPLATES: Array<{ type: WidgetType; label: string; desc: string; icon: string }> = [
  { type: 'social',   label: 'Social',    desc: 'WhatsApp / Telegram 等社交链接', icon: '📱' },
  { type: 'button',   label: '自定义按钮', desc: 'VIP / 联盟 / 下载 APP 等', icon: '🔘' },
  { type: 'language', label: '语言选择',  desc: '多语言下拉菜单', icon: '🌐' },
  { type: 'partner',  label: '合作伙伴',  desc: 'Partner Logo + 弹窗（支持多个）', icon: '🤝' },
  { type: 'profile',  label: '个人中心',  desc: '会员头像 / 登录按钮', icon: '👤' },
  { type: 'divider',  label: '分隔线',    desc: '组件之间的竖线分隔', icon: '│' },
];

function defaultSettings(type: WidgetType): HeaderWidget['settings'] {
  if (type === 'social')   return { platform: 'whatsapp' as SocialPlatform, url: '', open: 'new' as OpenMode };
  if (type === 'button')   return { text: '按钮', url: '/', open: 'same' as OpenMode, variant: 'outline' as ButtonVariant, badge: '' as BadgeLabel };
  if (type === 'language') return { languages: [{ code: 'zh', label: '中文', flag: '🇨🇳' }, { code: 'en', label: 'English', flag: '🇬🇧' }] };
  if (type === 'partner')  return {
    partners: [{ id: puid(), name: '', url: '', open: 'new' as OpenMode }],
    display_type: 'single' as PartnerSettings['display_type'],
    display_style: 'image_only' as PartnerSettings['display_style'],
    logo_size: 'medium' as PartnerSettings['logo_size'],
    shape: 'rounded' as PartnerSettings['shape'],
    hover_effect: 'scale' as PartnerSettings['hover_effect'],
    bg_style: 'transparent' as PartnerSettings['bg_style'],
    badge: '' as PartnerSettings['badge'],
  };
  if (type === 'profile')  return { action: 'profile' as ProfileAction, tooltip: '我的账户' };
  return {};
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HeaderBuilderPage() {
  const [config, setConfig]         = useState<HeaderConfig>(DEFAULT_CONFIG);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState('');
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    fetch('/api/website/header-config')
      .then(r => r.ok ? r.json() as Promise<HeaderConfig | null> : null)
      .then(data => {
        if (data) {
          setConfig({
            ...DEFAULT_CONFIG,
            ...data,
            show_profile_widget: data.show_profile_widget ?? true,
            show_header_widgets: data.show_header_widgets ?? true,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedWidget = config.widgets.find(w => w.id === selectedId) ?? null;

  function updateWidget(updated: HeaderWidget) {
    setConfig(c => ({ ...c, widgets: c.widgets.map(w => w.id === updated.id ? updated : w) }));
  }

  function moveWidget(id: string, dir: -1 | 1) {
    setConfig(c => {
      const ws = [...c.widgets];
      const i  = ws.findIndex(w => w.id === id);
      const j  = i + dir;
      if (j < 0 || j >= ws.length) return c;
      [ws[i], ws[j]] = [ws[j], ws[i]];
      return { ...c, widgets: ws };
    });
  }

  function deleteWidget(id: string) {
    if (selectedId === id) setSelectedId(null);
    setConfig(c => ({ ...c, widgets: c.widgets.filter(w => w.id !== id) }));
  }

  function addWidget(type: WidgetType) {
    const w: HeaderWidget = {
      id: uid(), type, enabled: true, visibility: 'both',
      settings: defaultSettings(type),
    };
    setConfig(c => ({ ...c, widgets: [...c.widgets, w] }));
    setSelectedId(w.id);
    setShowAdd(false);
  }

  async function handleSave() {
    setSaving(true); setMsg('');
    const res = await fetch('/api/website/header-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    setSaving(false);
    setMsg(res.ok ? '✓ 已保存，网站Header已更新' : '✗ 保存失败，请重试');
    setTimeout(() => setMsg(''), 3000);
  }

  const toggleOpt = (key: keyof HeaderConfig) =>
    setConfig(c => ({ ...c, [key]: !c[key as keyof HeaderConfig] }));

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-gray-800 rounded animate-pulse mb-8" />
        <div className="grid grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-64 bg-gray-800 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

      {/* Title + Save */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Header Builder</h1>
          <p className="text-sm text-gray-400 mt-0.5">自定义网站顶部导航栏的布局和组件</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && (
            <span className={`text-sm font-medium ${msg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{msg}</span>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
            {saving ? '保存中…' : '💾 保存'}
          </button>
        </div>
      </div>

      {/* Live Preview */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">实时预览</p>
        <HeaderPreview config={config} />
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-5">

        {/* Left: Layout + Style + Options */}
        <div className="space-y-4">

          {/* Layout */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">布局</h3>
            <div className="space-y-2">
              {LAYOUT_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setConfig(c => ({ ...c, layout: opt.value }))}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    config.layout === opt.value
                      ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                      : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                  }`}>
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="text-xs font-mono text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">样式</h3>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(STYLE_MAP) as HeaderStyle[]).map(s => (
                <button key={s} type="button"
                  onClick={() => setConfig(c => ({ ...c, style: s }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                    config.style === s ? 'border-violet-500 bg-violet-500/10 text-violet-300' : 'border-gray-700 bg-gray-800 text-gray-400'
                  }`}>{STYLE_MAP[s].label}</button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Header 元素</h3>
            <div className="space-y-3">
              {([
                ['show_menu_button',    '☰ 菜单按钮'],
                ['show_logo',           '🖼 Logo'],
                ['show_brand_text',     '📝 品牌名称'],
                ['show_announcement',   '📢 公告栏'],
                ['show_header_widgets', '🧩 右侧组件'],
                ['show_profile_widget', '👤 个人中心图标'],
                ['sticky',              '📌 固定在顶部'],
                ['blur',                '✨ 毛玻璃模糊'],
              ] as Array<[keyof HeaderConfig, string]>).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-gray-300">{label}</span>
                  <button type="button" onClick={() => toggleOpt(key)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${config[key as keyof HeaderConfig] ? 'bg-violet-600' : 'bg-gray-700'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${config[key as keyof HeaderConfig] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Middle: Widget list */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Header 组件</h3>
            <button type="button" onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition-colors">
              + 添加组件
            </button>
          </div>

          {showAdd && (
            <div className="mb-4 p-3 bg-gray-800 rounded-xl border border-gray-700">
              <p className="text-xs font-semibold text-gray-400 mb-2">选择组件类型</p>
              <div className="grid grid-cols-2 gap-2">
                {WIDGET_TEMPLATES.map(t => (
                  <button key={t.type} type="button" onClick={() => addWidget(t.type)}
                    className="text-left px-3 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-violet-500 transition-colors">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-base">{t.icon}</span>
                      <span className="text-xs font-semibold text-white">{t.label}</span>
                    </div>
                    <p className="text-[10px] text-gray-400">{t.desc}</p>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAdd(false)} className="mt-2 text-xs text-gray-500 hover:text-gray-400">取消</button>
            </div>
          )}

          {config.widgets.length === 0 && (
            <div className="text-center py-12 text-gray-600">
              <p className="text-2xl mb-2">📭</p>
              <p className="text-sm">暂无组件，点击上方添加</p>
            </div>
          )}

          <div className="space-y-2">
            {config.widgets.map((w, i) => (
              <div key={w.id}
                onClick={() => setSelectedId(selectedId === w.id ? null : w.id)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-all ${
                  selectedId === w.id
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}>
                <span className="text-lg shrink-0">{widgetIcon(w)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{widgetLabel(w)}</p>
                  <p className="text-xs text-gray-500">
                    {w.type}{w.visibility !== 'both' && ` · ${w.visibility === 'desktop' ? '仅桌面' : '仅手机'}`}
                  </p>
                </div>
                <button type="button" onClick={e => { e.stopPropagation(); updateWidget({ ...w, enabled: !w.enabled }); }}
                  className={`w-8 h-4 rounded-full flex-shrink-0 transition-colors relative ${w.enabled ? 'bg-violet-600' : 'bg-gray-700'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${w.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <div className="flex flex-col gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                  <button type="button" disabled={i === 0} onClick={() => moveWidget(w.id, -1)}
                    className="text-gray-500 hover:text-white disabled:opacity-30 text-xs leading-none">▲</button>
                  <button type="button" disabled={i === config.widgets.length - 1} onClick={() => moveWidget(w.id, 1)}
                    className="text-gray-500 hover:text-white disabled:opacity-30 text-xs leading-none">▼</button>
                </div>
                <button type="button" onClick={e => { e.stopPropagation(); deleteWidget(w.id); }}
                  className="text-gray-600 hover:text-red-400 text-sm shrink-0 transition-colors">✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Settings editor */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          {selectedWidget ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">{widgetIcon(selectedWidget)}</span>
                <div>
                  <h3 className="text-sm font-bold text-white">{widgetLabel(selectedWidget)}</h3>
                  <p className="text-xs text-gray-500">{selectedWidget.type} 组件设置</p>
                </div>
              </div>
              <WidgetSettingsEditor widget={selectedWidget} onChange={updateWidget} />
            </>
          ) : (
            <div className="text-center py-16 text-gray-600">
              <p className="text-2xl mb-2">👈</p>
              <p className="text-sm">点击左侧组件进行设置</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
