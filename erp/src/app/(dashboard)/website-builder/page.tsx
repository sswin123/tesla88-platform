'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';
import {
  ChevronUp, ChevronDown, Trash2, Plus, Pencil, Eye, EyeOff,
  GripVertical, X, Save, AlertTriangle, Copy, Search,
} from 'lucide-react';
import JackpotEditor from './JackpotEditor';
import GameLobbyEditor from './GameLobbyEditor';
import { NumericInput } from '@/components/ui/NumericInput';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HomepageSection {
  id: number;
  section_type: SectionType;
  name: string;
  config: Record<string, unknown>;
  display_order: number;
  is_enabled: boolean;
  start_at: string | null;
  end_at: string | null;
}

type SectionType =
  | 'hero' | 'marquee' | 'quick_menu' | 'promotions' | 'providers'
  | 'live_tx' | 'member_zone' | 'custom_html'
  | 'game_lobby' | 'cta_card' | 'announcement' | 'notice_popup'
  | 'jackpot' | 'footer_banner' | 'floating_button';

interface HeroSlide {
  id: string;
  title: string;
  subtitle: string;
  button_text: string;
  button_url: string;
  desktop_media_id: number | null;
  desktop_media_url: string;
  desktop_media_type: string;
  desktop_mime_type: string;
  mobile_media_id: number | null;
  mobile_media_url: string;
  mobile_media_type: string;
  mobile_mime_type: string;
  enabled: boolean;
  display_order: number;
}

interface PopupSlide {
  id: string;
  title?: string;
  subtitle?: string;
  description?: string;
  button_text?: string;
  button_url?: string;
  button_target?: '_self' | '_blank';
  image_click_url?: string;
  image_click_target?: '_self' | '_blank';
  desktop_media_id: number | null;
  desktop_media_url: string;
  desktop_media_type: string;
  desktop_mime_type: string;
  mobile_media_id: number | null;
  mobile_media_url: string;
  mobile_media_type: string;
  mobile_mime_type: string;
  start_time?: string;
  end_time?: string;
  enabled: boolean;
  display_order: number;
}

interface QuickMenuItem {
  id: string;
  label: string;
  emoji: string;
  url: string;
  enabled: boolean;
  display_order: number;
  media_id: number | null;
  badge: string;
  // undefined → fill_container (image fills the button by default)
  image_mode?: 'icon' | 'fill_container' | 'cover' | 'contain' | 'original' | 'banner' | 'full_button';
  btn_width?: string;       // e.g. '100%', '300px'
  btn_height_val?: string;  // legacy; use card_height instead
  card_height?: 'auto' | 'small' | 'medium' | 'large' | string; // 'auto'=natural height, 'small'=80px, 'medium'=120px, 'large'=180px, or custom '240px'
  btn_radius?: string;
  btn_padding?: string;
  btn_bg_type?: 'transparent' | 'solid' | 'gradient' | 'glass';
  btn_bg_color?: string;
  btn_bg_gradient?: string;
  img_position?: string;
  img_scale?: number;
  // legacy compat
  btn_size?: 'small' | 'medium' | 'large' | 'custom';
  btn_custom_width?: number;
  btn_custom_height?: number;
  btn_height?: 'small' | 'medium' | 'large' | 'auto' | string;
  img_fit?: 'contain' | 'cover' | 'stretch' | 'original';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  hero:             '横幅轮播',
  marquee:          '跑马灯',
  quick_menu:       '快捷菜单',
  promotions:       '精选优惠',
  providers:        '游戏平台',
  live_tx:          '实时交易',
  member_zone:      '会员钱包区',
  custom_html:      '自定义内容',
  game_lobby:       '游戏大厅',
  cta_card:         'CTA 卡片',
  announcement:     '公告栏',
  notice_popup:     '弹窗公告',
  jackpot:          '奖池计数器',
  footer_banner:    '底部横幅',
  floating_button:  '悬浮按钮',
};

const SECTION_TYPE_COLORS: Record<SectionType, string> = {
  hero:             'bg-blue-100 text-blue-700',
  marquee:          'bg-yellow-100 text-yellow-700',
  quick_menu:       'bg-purple-100 text-purple-700',
  promotions:       'bg-green-100 text-green-700',
  providers:        'bg-orange-100 text-orange-700',
  live_tx:          'bg-teal-100 text-teal-700',
  member_zone:      'bg-indigo-100 text-indigo-700',
  custom_html:      'bg-gray-100 text-gray-700',
  game_lobby:       'bg-cyan-100 text-cyan-700',
  cta_card:         'bg-pink-100 text-pink-700',
  announcement:     'bg-amber-100 text-amber-700',
  notice_popup:     'bg-rose-100 text-rose-700',
  jackpot:          'bg-yellow-100 text-yellow-800',
  footer_banner:    'bg-slate-100 text-slate-700',
  floating_button:  'bg-violet-100 text-violet-700',
};

// ─── Widget Library Catalog ───────────────────────────────────────────────────

const WIDGET_CATEGORIES = {
  hero:      { label: '横幅',  color: 'bg-blue-100 text-blue-700' },
  promotion: { label: '优惠',  color: 'bg-green-100 text-green-700' },
  member:    { label: '会员',  color: 'bg-indigo-100 text-indigo-700' },
  game:      { label: '游戏',  color: 'bg-cyan-100 text-cyan-700' },
  support:   { label: '客服',  color: 'bg-rose-100 text-rose-700' },
  marketing: { label: '营销',  color: 'bg-amber-100 text-amber-700' },
  media:     { label: '媒体',  color: 'bg-gray-100 text-gray-700' },
  layout:    { label: '布局',  color: 'bg-purple-100 text-purple-700' },
} as const;

type WidgetCategory = keyof typeof WIDGET_CATEGORIES;

interface WidgetDef {
  type: SectionType;
  category: WidgetCategory;
  label: string;
  description: string;
  icon: string;
  isNew?: boolean;
}

const WIDGET_CATALOG: WidgetDef[] = [
  { type: 'hero',            category: 'hero',      icon: '🖼',  label: '横幅轮播',    description: '多 Slide 横幅，支持图片 / 视频、标题、CTA 按钮' },
  { type: 'promotions',      category: 'promotion', icon: '🎁',  label: '精选优惠',    description: '展示首页优惠活动卡片列表，支持自定义数量' },
  { type: 'member_zone',     category: 'member',    icon: '👤',  label: '会员钱包区',  description: '登录/注册按钮、会员余额、存款/提款快捷入口' },
  { type: 'game_lobby',      category: 'game',      icon: '🎮',  label: '游戏大厅',    description: '全功能游戏大厅，支持分类标签、搜索、排序' },
  { type: 'providers',       category: 'game',      icon: '🏢',  label: '游戏平台',    description: '展示合作游戏平台 Logo，支持横向/网格布局' },
  { type: 'live_tx',         category: 'game',      icon: '⚡',  label: '实时交易',    description: '实时滚动展示最新存款 / 提款动态记录' },
  { type: 'jackpot',         category: 'game',      icon: '💰',  label: '奖池计数器',  description: '动态滚动累积奖池数字，支持多种样式' },
  { type: 'notice_popup',    category: 'support',   icon: '🔔',  label: '弹窗公告',    description: '网站加载时弹出的公告 Slider，支持图片 / 文字' },
  { type: 'marquee',         category: 'marketing', icon: '📢',  label: '跑马灯',      description: '横向滚动的文字公告条，支持自定义颜色' },
  { type: 'announcement',    category: 'marketing', icon: '📣',  label: '公告栏',      description: '固定在区块顶部的横幅式公告，支持链接' },
  { type: 'floating_button', category: 'marketing', icon: '💬',  label: '悬浮按钮',    description: '屏幕固定位置的悬浮按钮，常用于客服 / 快捷入口' },
  { type: 'custom_html',     category: 'media',     icon: '🔧',  label: '自定义内容',  description: '自由输入 HTML / CSS / SVG，通过 SafeHtmlBlock 安全渲染' },
  { type: 'footer_banner',   category: 'media',     icon: '🖼',  label: '底部横幅',    description: '页面底部图片横幅，支持桌面端 / 移动端不同图片' },
  { type: 'quick_menu',      category: 'layout',    icon: '⬛',  label: '快捷菜单',    description: '可自定义图标的快速导航按钮组，支持多列布局' },
  { type: 'cta_card',        category: 'layout',    icon: '🃏',  label: 'CTA 卡片',   description: '含背景图、标题、描述、行动号召按钮的内容卡片' },
];

const DEFAULT_CONFIGS: Record<SectionType, Record<string, unknown>> = {
  hero:        { slides: [], autoplay_interval: 5000, show_arrows: true, show_dots: true },
  marquee:     { messages: ['欢迎来到本平台！'], speed: 40, color: '#f59e0b', bg_color: '', icon: '📢' },
  quick_menu:  { items: [], columns: 4, style: 'filled', layout: 'icon_text', hover: 'scale_glow', spacing: 'medium' },
  promotions:  { title: '精选优惠', subtitle: '', show_all_link: '/promotions', max_items: 6 },
  providers:   { title: '游戏合作伙伴', columns: 4 },
  live_tx:     { title: '实时交易', limit: 10 },
  member_zone: {
    login_button:    { media_id: null, media_url: '', media_type: '', text: 'Login',    url: '/login',    enabled: true },
    register_button: { media_id: null, media_url: '', media_type: '', text: 'Register', url: '/register', enabled: true },
    bg_media_id: null, bg_media_url: '', bg_media_type: '', bg_gradient: '', border_color: '', border_radius: '16px',
    deposit_button:  { text: '存款 Deposit',  media_id: null, media_url: '', enabled: true },
    withdraw_button: { text: '提款 Withdraw', media_id: null, media_url: '', enabled: true },
  },
  custom_html:     { html: '', title: '' },
  game_lobby: {
    tabs_enabled: true, tab_style: 'rounded', tab_icon_mode: 'icon_text', tab_scroll: 'scrollable',
    show_provider_filter: true, provider_source: 'website', provider_style: 'horizontal', provider_display: 'logo_text', provider_size: 'medium', provider_hover: 'lift',
    card_style: 'classic', card_image_mode: 'cover', card_ratio: '3:4', card_shadow: 'medium', card_border: 'none', card_hover: 'lift',
    show_game_name: true, show_hot_badge: true, show_new_badge: true, show_play_button: false, show_demo_button: false, button_style: 'rounded',
    search_enabled: false, default_sort: 'popular', pagination_type: 'load_more',
    card_animation: 'fade', scroll_animation: false,
    font: 'system', font_weight: 'regular',
    columns_desktop: 5, columns_tablet: 3, columns_mobile: 2,
    card_gap: '10px',
  },
  cta_card:        { title: '', subtitle: '', button_text: '', link_url: '', desktop_media_id: null, desktop_media_url: '', desktop_media_type: '', mobile_media_id: null, mobile_media_url: '', mobile_media_type: '', bg_color: '', text_color: '', align: 'center' },
  announcement:    { text: '', bg_color: '#1e293b', text_color: '#f59e0b', icon: '📢', link_url: '', button_text: '' },
  notice_popup: {
    slides: [],
    autoplay: true,
    autoplay_interval: 5000,
    pause_on_hover: true,
    loop: true,
    show_indicators: true,
    show_arrows: true,
    animation: 'slide',
    frequency: 'session',
    bg_color: '',
    text_color: '',
  },
  jackpot: {
    mode: 'single',
    layout: 'vertical',
    counters: [{
      id: 'default',
      title: '今日奖池',
      prefix: 'RM',
      data_source: 'realtime',
      initial_value: 1000000,
      manual_value: 1000000,
      increment_per_second: 3.5,
      decimal_places: 2,
      sync_interval: 3,
      style_preset: 'classic_gold',
      number_effect: 'smooth',
      animation: 'glow',
      size: 'medium',
      icon: '💰',
      icon_media_id: null,
      title_color: '', number_color: '', currency_color: '',
      glow_color: '', bg_type: '', bg_color: '', bg_gradient: '',
      border_style: '', border_color: '', border_radius: '16px', font_style: 'classic',
    }],
  },
  footer_banner:   { desktop_media_id: null, desktop_media_url: '', desktop_media_type: '', mobile_media_id: null, mobile_media_url: '', mobile_media_type: '', link_url: '' },
  floating_button: { text: '客服', icon: '💬', link_url: '/chat', position: 'bottom-right', bg_color: '', text_color: '' },
};

// ─── Upload Hint ──────────────────────────────────────────────────────────────

function UploadHint({ recSize, ratio, maxMB, formats, note }: {
  recSize: string; ratio?: string; maxMB: number; formats: string; note?: string;
}) {
  return (
    <div className="mt-1.5 rounded-md bg-gray-50 border border-gray-100 px-2.5 py-2 text-[10px] text-gray-400 leading-relaxed space-y-0.5">
      <p><span className="font-semibold text-gray-500">推荐尺寸：</span>{recSize}{ratio && ` · ${ratio}`}</p>
      <p><span className="font-semibold text-gray-500">最大：</span>{maxMB} MB · <span className="font-semibold text-gray-500">格式：</span>{formats}</p>
      {note && <p className="text-gray-400">{note}</p>}
    </div>
  );
}

// ─── Section List Card ────────────────────────────────────────────────────────

function SectionCard({
  section,
  index,
  total,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
  onMove,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  section: HomepageSection;
  index: number;
  total: number;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: 'up' | 'down') => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}) {
  const typeLabel = SECTION_TYPE_LABELS[section.section_type] ?? section.section_type;
  const typeColor = SECTION_TYPE_COLORS[section.section_type] ?? 'bg-gray-100 text-gray-700';

  const now = new Date();
  const scheduled = section.start_at && new Date(section.start_at) > now;
  const expired = section.end_at && new Date(section.end_at) < now;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
        isDragging  ? 'opacity-40 scale-95' :
        isDragOver  ? 'border-blue-400 bg-blue-50 shadow-md' :
        section.is_enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'
      }`}
    >
      <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor}`}>
            {typeLabel}
          </span>
          <span className="text-sm font-medium text-gray-800 truncate">{section.name}</span>
          {scheduled && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200">定时</span>
          )}
          {expired && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">已过期</span>
          )}
        </div>
        {(section.start_at || section.end_at) && (
          <p className="text-xs text-gray-400 mt-0.5">
            {section.start_at && `开始: ${new Date(section.start_at).toLocaleDateString('zh-CN')}`}
            {section.start_at && section.end_at && ' · '}
            {section.end_at && `结束: ${new Date(section.end_at).toLocaleDateString('zh-CN')}`}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onMove('up')}
          disabled={index === 0}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title="上移"
        >
          <ChevronUp className="w-4 h-4 text-gray-500" />
        </button>
        <button
          onClick={() => onMove('down')}
          disabled={index === total - 1}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title="下移"
        >
          <ChevronDown className="w-4 h-4 text-gray-500" />
        </button>
        <button
          onClick={onToggle}
          className="p-1.5 rounded hover:bg-gray-100"
          title={section.is_enabled ? '隐藏' : '显示'}
        >
          {section.is_enabled
            ? <Eye className="w-4 h-4 text-green-600" />
            : <EyeOff className="w-4 h-4 text-gray-400" />}
        </button>
        <button
          onClick={onEdit}
          className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
          title="编辑"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDuplicate}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          title="复制"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-red-50 text-red-500"
          title="删除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Hero Slides Editor ────────────────────────────────────────────────────────

// ─── Slide Media Upload Card ──────────────────────────────────────────────────

function SlideMediaCard({
  label,
  hint,
  recTitle,
  recSize,
  maxMB,
  mediaUrl,
  mediaType,
  mimeType,
  onPickClick,
  onDelete,
}: {
  label: string;
  hint: string;
  recTitle: string;
  recSize: string;
  maxMB: number;
  mediaUrl: string;
  mediaType: string;
  mimeType: string;
  onPickClick: () => void;
  onDelete: () => void;
}) {
  const hasMedia  = !!mediaUrl;
  const isVideoM  = mediaType === 'VIDEO' || mimeType.startsWith('video/');
  const isGifM    = mediaType === 'GIF'   || mimeType === 'image/gif';

  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">{label}</p>

      {/* Preview / Upload area */}
      {hasMedia ? (
        <div
          className="relative rounded-lg overflow-hidden border-2 border-gray-200 bg-black cursor-pointer group"
          style={{ height: 96 }}
          onClick={onPickClick}
          title="点击更换媒体"
        >
          {isVideoM ? (
            <video src={mediaUrl} className="w-full h-full object-cover opacity-80" muted controls={false} />
          ) : (
            <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
          )}
          {/* Hover overlay: "点击更换" */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all">
            <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              点击更换
            </span>
          </div>
          {/* Media type badge */}
          <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold bg-black/60 text-white px-1.5 py-0.5 rounded">
            {isVideoM ? 'VIDEO' : isGifM ? 'GIF' : 'IMAGE'}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPickClick}
          className="w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50 transition-colors"
          style={{ height: 96 }}
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs">选择媒体</span>
        </button>
      )}

      {/* Delete button */}
      {hasMedia && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-1 flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
        >
          <Trash2 className="w-3 h-3" /> 删除媒体
        </button>
      )}

      {/* Upload guidelines */}
      <div className="mt-2 rounded-md bg-gray-50 border border-gray-100 px-2.5 py-2 text-[10px] text-gray-400 leading-relaxed space-y-0.5">
        <p><span className="font-semibold text-gray-500">推荐：</span>{recTitle} / {recSize}</p>
        <p><span className="font-semibold text-gray-500">最大：</span>{maxMB} MB</p>
        <p><span className="font-semibold text-gray-500">{hint}</span></p>
      </div>
    </div>
  );
}

// ─── Hero Editor ──────────────────────────────────────────────────────────────

function HeroEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const slides: HeroSlide[] = (config.slides as HeroSlide[]) ?? [];
  const [pickerFor, setPickerFor] = useState<{ slideId: string; field: 'desktop' | 'mobile' } | null>(null);

  function updateSlide(id: string, patch: Partial<HeroSlide>) {
    onChange({
      ...config,
      slides: slides.map(s => s.id === id ? { ...s, ...patch } : s),
    });
  }

  function clearMedia(slideId: string, field: 'desktop' | 'mobile') {
    updateSlide(slideId, {
      [`${field}_media_id`]:   null,
      [`${field}_media_url`]:  '',
      [`${field}_media_type`]: '',
      [`${field}_mime_type`]:  '',
    } as Partial<HeroSlide>);
  }

  function addSlide() {
    const newSlide: HeroSlide = {
      id: Date.now().toString(),
      title: '', subtitle: '', button_text: '', button_url: '',
      desktop_media_id: null, desktop_media_url: '', desktop_media_type: '', desktop_mime_type: '',
      mobile_media_id:  null, mobile_media_url:  '', mobile_media_type:  '', mobile_mime_type:  '',
      enabled: true,
      display_order: slides.length * 10,
    };
    onChange({ ...config, slides: [...slides, newSlide] });
  }

  function removeSlide(id: string) {
    if (!confirm('确定要删除此幻灯片吗？')) return;
    onChange({ ...config, slides: slides.filter(s => s.id !== id) });
  }

  function moveSlide(idx: number, dir: 'up' | 'down') {
    const next = [...slides];
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...config, slides: next.map((s, i) => ({ ...s, display_order: i * 10 })) });
  }

  function handleMediaSelect(media: MediaRecord | MediaRecord[]) {
    if (!pickerFor) return;
    const single = Array.isArray(media) ? media[0] : media;
    if (!single) return;
    const { slideId, field } = pickerFor;
    updateSlide(slideId, {
      [`${field}_media_id`]:   single.id,
      [`${field}_media_url`]:  `/api/public/media/${single.id}`,
      [`${field}_media_type`]: single.mediaType ?? 'IMAGE',
      [`${field}_mime_type`]:  single.mimeType  ?? 'image/jpeg',
    } as Partial<HeroSlide>);
    setPickerFor(null);
  }

  return (
    <div className="space-y-4">
      {/* Global settings */}
      <div className="flex flex-wrap gap-4 items-center">
        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">自动播放间隔 (毫秒)</span>
          <NumericInput
            className="w-32 border rounded-lg px-3 py-1.5 text-sm"
            value={(config.autoplay_interval as number) ?? 5000}
            min={1000} step={500}
            onChange={n => onChange({ ...config, autoplay_interval: n })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer pt-4">
          <input
            type="checkbox"
            checked={(config.show_arrows as boolean) ?? true}
            onChange={e => onChange({ ...config, show_arrows: e.target.checked })}
            className="rounded"
          />
          显示左右箭头
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer pt-4">
          <input
            type="checkbox"
            checked={(config.show_dots as boolean) ?? true}
            onChange={e => onChange({ ...config, show_dots: e.target.checked })}
            className="rounded"
          />
          显示圆点导航
        </label>
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700">幻灯片列表（{slides.length} 张）</h4>
          <button
            type="button"
            onClick={addSlide}
            className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3 h-3" /> 添加幻灯片
          </button>
        </div>

        <div className="space-y-4">
          {slides.length === 0 && (
            <div className="text-center py-8 border-2 border-dashed rounded-xl bg-gray-50">
              <p className="text-sm text-gray-400 mb-2">暂无幻灯片</p>
              <button
                type="button"
                onClick={addSlide}
                className="text-xs text-blue-600 hover:underline"
              >
                点击「添加幻灯片」开始
              </button>
            </div>
          )}

          {slides.map((slide, idx) => (
            <div key={slide.id} className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
              {/* Slide header bar */}
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-gray-300" />
                  <span className="text-xs font-semibold text-gray-600">幻灯片 {idx + 1}</span>
                  {!slide.desktop_media_url && (
                    <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded">缺少桌面图片</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Up/Down */}
                  <button type="button" onClick={() => moveSlide(idx, 'up')} disabled={idx === 0}
                    className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors" title="上移">
                    <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <button type="button" onClick={() => moveSlide(idx, 'down')} disabled={idx === slides.length - 1}
                    className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors" title="下移">
                    <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  {/* Visible toggle */}
                  <button type="button"
                    onClick={() => updateSlide(slide.id, { enabled: !slide.enabled })}
                    className={`p-1 rounded transition-colors ${slide.enabled ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
                    title={slide.enabled ? '已显示（点击隐藏）' : '已隐藏（点击显示）'}
                  >
                    {slide.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  {/* Delete slide */}
                  <button type="button" onClick={() => removeSlide(slide.id)}
                    className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors" title="删除幻灯片">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Slide content */}
              <div className="p-3 space-y-3">
                {/* Text fields */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">标题（可选）</label>
                    <input
                      placeholder="幻灯片标题"
                      className="w-full border rounded-lg px-2 py-1.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                      value={slide.title}
                      onChange={e => updateSlide(slide.id, { title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">副标题（可选）</label>
                    <input
                      placeholder="幻灯片副标题"
                      className="w-full border rounded-lg px-2 py-1.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                      value={slide.subtitle}
                      onChange={e => updateSlide(slide.id, { subtitle: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">按钮文字（可选）</label>
                    <input
                      placeholder="例：立即游戏"
                      className="w-full border rounded-lg px-2 py-1.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                      value={slide.button_text}
                      onChange={e => updateSlide(slide.id, { button_text: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">按钮链接（可选）</label>
                    <input
                      placeholder="例：/promotions"
                      className="w-full border rounded-lg px-2 py-1.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                      value={slide.button_url}
                      onChange={e => updateSlide(slide.id, { button_url: e.target.value })}
                    />
                  </div>
                </div>

                {/* Media pickers */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <SlideMediaCard
                    label="桌面端图片 / 视频"
                    hint="格式：JPG · PNG · WEBP · GIF · MP4"
                    recTitle="1920 × 600 px"
                    recSize="宽高比 16:5"
                    maxMB={10}
                    mediaUrl={slide.desktop_media_url}
                    mediaType={slide.desktop_media_type}
                    mimeType={slide.desktop_mime_type}
                    onPickClick={() => setPickerFor({ slideId: slide.id, field: 'desktop' })}
                    onDelete={() => clearMedia(slide.id, 'desktop')}
                  />
                  <SlideMediaCard
                    label="移动端图片 / 视频（可选）"
                    hint="格式：JPG · PNG · WEBP · GIF · MP4"
                    recTitle="1080 × 1350 px"
                    recSize="宽高比 4:5"
                    maxMB={8}
                    mediaUrl={slide.mobile_media_url}
                    mediaType={slide.mobile_media_type}
                    mimeType={slide.mobile_mime_type}
                    onPickClick={() => setPickerFor({ slideId: slide.id, field: 'mobile' })}
                    onDelete={() => clearMedia(slide.id, 'mobile')}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {pickerFor && (
        <MediaPicker
          mode="single"
          typeFilter={['IMAGE', 'GIF', 'VIDEO']}
          onSelect={handleMediaSelect}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}

// ─── PopupSlider Editor ───────────────────────────────────────────────────────

function PopupSliderEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const slides: PopupSlide[] = (config.slides as PopupSlide[]) ?? [];
  const [pickerFor, setPickerFor] = useState<{ slideId: string; field: 'desktop' | 'mobile' } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(slides[0]?.id ?? null);

  function updateSlide(id: string, patch: Partial<PopupSlide>) {
    onChange({ ...config, slides: slides.map(s => s.id === id ? { ...s, ...patch } : s) });
  }

  function clearMedia(slideId: string, field: 'desktop' | 'mobile') {
    updateSlide(slideId, {
      [`${field}_media_id`]:   null,
      [`${field}_media_url`]:  '',
      [`${field}_media_type`]: '',
      [`${field}_mime_type`]:  '',
    } as Partial<PopupSlide>);
  }

  function addSlide() {
    const newSlide: PopupSlide = {
      id: Date.now().toString(),
      title: '', subtitle: '', description: '',
      button_text: '', button_url: '', button_target: '_self',
      image_click_url: '', image_click_target: '_self',
      desktop_media_id: null, desktop_media_url: '', desktop_media_type: '', desktop_mime_type: '',
      mobile_media_id:  null, mobile_media_url:  '', mobile_media_type:  '', mobile_mime_type:  '',
      start_time: '', end_time: '',
      enabled: true,
      display_order: slides.length * 10,
    };
    const next = [...slides, newSlide];
    onChange({ ...config, slides: next });
    setExpanded(newSlide.id);
  }

  function duplicateSlide(slide: PopupSlide) {
    const dup: PopupSlide = { ...slide, id: Date.now().toString(), display_order: slides.length * 10 };
    onChange({ ...config, slides: [...slides, dup] });
    setExpanded(dup.id);
  }

  function removeSlide(id: string) {
    if (!confirm('确定要删除此 Slide 吗？')) return;
    onChange({ ...config, slides: slides.filter(s => s.id !== id) });
    if (expanded === id) setExpanded(null);
  }

  function moveSlide(idx: number, dir: 'up' | 'down') {
    const next = [...slides];
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...config, slides: next.map((s, i) => ({ ...s, display_order: i * 10 })) });
  }

  function handleMediaSelect(media: MediaRecord | MediaRecord[]) {
    if (!pickerFor) return;
    const single = Array.isArray(media) ? media[0] : media;
    if (!single) return;
    updateSlide(pickerFor.slideId, {
      [`${pickerFor.field}_media_id`]:   single.id,
      [`${pickerFor.field}_media_url`]:  `/api/public/media/${single.id}`,
      [`${pickerFor.field}_media_type`]: single.mediaType ?? 'IMAGE',
      [`${pickerFor.field}_mime_type`]:  single.mimeType  ?? 'image/jpeg',
    } as Partial<PopupSlide>);
    setPickerFor(null);
  }

  const iField = 'w-full border rounded-lg px-2 py-1.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300';

  return (
    <div className="space-y-5">
      {/* ── Global popup settings ─────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">弹窗全局设置</p>

        {/* Row 1: autoplay + interval */}
        <div className="flex flex-wrap gap-4 items-end">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded"
              checked={(config.autoplay as boolean) ?? true}
              onChange={e => onChange({ ...config, autoplay: e.target.checked })} />
            自动播放
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">间隔（毫秒）</span>
            <NumericInput className="w-28 border rounded-lg px-3 py-1.5 text-sm"
              value={(config.autoplay_interval as number) ?? 5000}
              min={1000} step={500}
              onChange={n => onChange({ ...config, autoplay_interval: n })} />
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-4">
            <input type="checkbox" className="rounded"
              checked={(config.pause_on_hover as boolean) ?? true}
              onChange={e => onChange({ ...config, pause_on_hover: e.target.checked })} />
            Hover 暂停
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-4">
            <input type="checkbox" className="rounded"
              checked={(config.loop as boolean) ?? true}
              onChange={e => onChange({ ...config, loop: e.target.checked })} />
            循环播放
          </label>
        </div>

        {/* Row 2: display */}
        <div className="flex flex-wrap gap-4 items-end">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded"
              checked={(config.show_indicators as boolean) ?? true}
              onChange={e => onChange({ ...config, show_indicators: e.target.checked })} />
            显示指示点
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded"
              checked={(config.show_arrows as boolean) ?? true}
              onChange={e => onChange({ ...config, show_arrows: e.target.checked })} />
            显示左右箭头
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">动画效果</span>
            <select className="border rounded-lg px-2 py-1.5 text-sm"
              value={(config.animation as string) ?? 'slide'}
              onChange={e => onChange({ ...config, animation: e.target.value })}>
              <option value="slide">Slide 滑动</option>
              <option value="fade">Fade 淡入淡出</option>
              <option value="zoom">Zoom 缩放</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">显示频率</span>
            <select className="border rounded-lg px-2 py-1.5 text-sm"
              value={(config.frequency as string) ?? 'session'}
              onChange={e => onChange({ ...config, frequency: e.target.value })}>
              <option value="always">每次访问</option>
              <option value="session">每个会话</option>
              <option value="daily">每天一次</option>
              <option value="weekly">每周一次</option>
              <option value="once">只显示一次</option>
            </select>
          </label>
        </div>

        {/* Row 3: colors */}
        <div className="flex gap-4 flex-wrap">
          {[['bg_color', '背景颜色', '#18181b'], ['text_color', '文字颜色', '#ffffff']].map(([key, label, def]) => (
            <div key={key}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <div className="flex items-center gap-2">
                <input type="color"
                  value={(config[key] as string) || def}
                  onChange={e => onChange({ ...config, [key]: e.target.value })}
                  className="w-7 h-7 rounded border cursor-pointer flex-shrink-0" />
                <input type="text" placeholder="透明"
                  className="w-24 border rounded-lg px-2 py-1.5 text-xs font-mono"
                  value={(config[key] as string) ?? ''}
                  onChange={e => onChange({ ...config, [key]: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Slides list ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700">Slides（{slides.length} 张）</h4>
          <button type="button" onClick={addSlide}
            className="flex items-center gap-1 text-xs bg-rose-600 text-white px-3 py-1.5 rounded-lg hover:bg-rose-700 transition-colors">
            <Plus className="w-3 h-3" /> 添加 Slide
          </button>
        </div>

        <div className="space-y-3">
          {slides.length === 0 && (
            <div className="text-center py-8 border-2 border-dashed rounded-xl bg-gray-50">
              <p className="text-sm text-gray-400 mb-2">暂无 Slide，点击「添加 Slide」开始</p>
            </div>
          )}

          {slides.map((slide, idx) => {
            const isOpen = expanded === slide.id;
            return (
              <div key={slide.id} className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                {/* Header bar */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <button type="button" className="flex items-center gap-2 flex-1 text-left"
                    onClick={() => setExpanded(isOpen ? null : slide.id)}>
                    <GripVertical className="w-4 h-4 text-gray-300" />
                    <span className="text-xs font-semibold text-gray-600">Slide {idx + 1}</span>
                    {slide.title && <span className="text-xs text-gray-400 truncate max-w-32">{slide.title}</span>}
                    {!slide.desktop_media_url && (
                      <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded">缺少图片</span>
                    )}
                  </button>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveSlide(idx, 'up')} disabled={idx === 0}
                      className="p-1 rounded hover:bg-gray-200 disabled:opacity-30" title="上移">
                      <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button type="button" onClick={() => moveSlide(idx, 'down')} disabled={idx === slides.length - 1}
                      className="p-1 rounded hover:bg-gray-200 disabled:opacity-30" title="下移">
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button type="button"
                      onClick={() => updateSlide(slide.id, { enabled: !slide.enabled })}
                      className={`p-1 rounded ${slide.enabled ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
                      title={slide.enabled ? '已启用' : '已停用'}>
                      {slide.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button type="button" onClick={() => duplicateSlide(slide)}
                      className="p-1 rounded hover:bg-blue-50 text-blue-400" title="复制">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => removeSlide(slide.id)}
                      className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600" title="删除">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Slide body (collapsible) */}
                {isOpen && (
                  <div className="p-3 space-y-3">
                    {/* Text fields */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-400 mb-0.5 block">标题（可选）</label>
                        <input className={iField} placeholder="弹窗标题"
                          value={slide.title ?? ''}
                          onChange={e => updateSlide(slide.id, { title: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 mb-0.5 block">副标题（可选）</label>
                        <input className={iField} placeholder="副标题"
                          value={slide.subtitle ?? ''}
                          onChange={e => updateSlide(slide.id, { subtitle: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-gray-400 mb-0.5 block">说明文字（可选）</label>
                        <textarea className={`${iField} resize-none`} rows={2} placeholder="弹窗内容"
                          value={slide.description ?? ''}
                          onChange={e => updateSlide(slide.id, { description: e.target.value })} />
                      </div>
                    </div>

                    {/* CTA Button */}
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-2 space-y-2">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase">CTA 按钮（留空则不显示）</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-400 mb-0.5 block">按钮文字</label>
                          <input className={iField} placeholder="例：立即参与"
                            value={slide.button_text ?? ''}
                            onChange={e => updateSlide(slide.id, { button_text: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 mb-0.5 block">打开方式</label>
                          <select className={iField}
                            value={slide.button_target ?? '_self'}
                            onChange={e => updateSlide(slide.id, { button_target: e.target.value as '_self' | '_blank' })}>
                            <option value="_self">当前窗口</option>
                            <option value="_blank">新标签页</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-gray-400 mb-0.5 block">按钮链接</label>
                          <input className={iField} placeholder="https://... 或 /页面路径"
                            value={slide.button_url ?? ''}
                            onChange={e => updateSlide(slide.id, { button_url: e.target.value })} />
                        </div>
                      </div>
                    </div>

                    {/* Image Click Link */}
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-2 space-y-2">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase">图片点击链接（留空则图片不可点击）</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <label className="text-[10px] text-gray-400 mb-0.5 block">图片链接</label>
                          <input className={iField} placeholder="https://... 或 /页面路径"
                            value={slide.image_click_url ?? ''}
                            onChange={e => updateSlide(slide.id, { image_click_url: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 mb-0.5 block">打开方式</label>
                          <select className={iField}
                            value={slide.image_click_target ?? '_self'}
                            onChange={e => updateSlide(slide.id, { image_click_target: e.target.value as '_self' | '_blank' })}>
                            <option value="_self">当前窗口</option>
                            <option value="_blank">新标签页</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Schedule */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-400 mb-0.5 block">上架时间（可选）</label>
                        <input type="datetime-local" className={iField}
                          value={slide.start_time ?? ''}
                          onChange={e => updateSlide(slide.id, { start_time: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 mb-0.5 block">下架时间（可选）</label>
                        <input type="datetime-local" className={iField}
                          value={slide.end_time ?? ''}
                          onChange={e => updateSlide(slide.id, { end_time: e.target.value })} />
                      </div>
                    </div>

                    {/* Media pickers */}
                    <div className="grid grid-cols-2 gap-3">
                      <SlideMediaCard
                        label="桌面端图片"
                        hint="JPG · PNG · WEBP · GIF"
                        recTitle="600 × 400 px"
                        recSize="宽高比 3:2"
                        maxMB={5}
                        mediaUrl={slide.desktop_media_url}
                        mediaType={slide.desktop_media_type}
                        mimeType={slide.desktop_mime_type}
                        onPickClick={() => setPickerFor({ slideId: slide.id, field: 'desktop' })}
                        onDelete={() => clearMedia(slide.id, 'desktop')}
                      />
                      <SlideMediaCard
                        label="移动端图片（可选）"
                        hint="JPG · PNG · WEBP · GIF"
                        recTitle="480 × 320 px"
                        recSize="宽高比 3:2"
                        maxMB={3}
                        mediaUrl={slide.mobile_media_url}
                        mediaType={slide.mobile_media_type}
                        mimeType={slide.mobile_mime_type}
                        onPickClick={() => setPickerFor({ slideId: slide.id, field: 'mobile' })}
                        onDelete={() => clearMedia(slide.id, 'mobile')}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

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

// ─── Marquee Editor ───────────────────────────────────────────────────────────

function MarqueeEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const messages: string[] = (config.messages as string[]) ?? [];

  function updateMessage(idx: number, val: string) {
    const next = [...messages];
    next[idx] = val;
    onChange({ ...config, messages: next });
  }

  function addMessage() {
    onChange({ ...config, messages: [...messages, ''] });
  }

  function removeMessage(idx: number) {
    onChange({ ...config, messages: messages.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">文字颜色</span>
          <div className="flex items-center gap-2">
            <input type="color" value={(config.color as string) || '#f59e0b'}
              onChange={e => onChange({ ...config, color: e.target.value })}
              className="w-8 h-8 rounded border cursor-pointer" />
            <input type="text" value={(config.color as string) || '#f59e0b'}
              onChange={e => onChange({ ...config, color: e.target.value })}
              className="flex-1 border rounded-lg px-2 py-1.5 text-sm font-mono" />
          </div>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">背景颜色（可选）</span>
          <input type="text" placeholder="透明" value={(config.bg_color as string) || ''}
            onChange={e => onChange({ ...config, bg_color: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">滚动速度 (px/s)</span>
          <NumericInput min={10} max={200} value={(config.speed as number) ?? 40}
            onChange={n => onChange({ ...config, speed: n })}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">前置图标（emoji）</span>
          <input type="text" value={(config.icon as string) || ''}
            onChange={e => onChange({ ...config, icon: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">公告内容 ({messages.length})</span>
          <button onClick={addMessage}
            className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
            <Plus className="w-3 h-3" /> 添加
          </button>
        </div>
        <div className="space-y-2">
          {messages.map((msg, idx) => (
            <div key={idx} className="flex gap-2">
              <input value={msg} onChange={e => updateMessage(idx, e.target.value)}
                placeholder={`公告 ${idx + 1}`}
                className="flex-1 border rounded-lg px-3 py-2 text-sm" />
              <button onClick={() => removeMessage(idx)}
                className="p-2 rounded-lg hover:bg-red-50 text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {messages.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-3 border-2 border-dashed rounded-xl">
              暂无内容
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quick Menu Editor ────────────────────────────────────────────────────────

// ─── Quick Menu style option lists ──────────────────────────────────────────

const QM_STYLE_OPTIONS = [
  { value: 'filled',       label: '填充 (Filled)',          desc: '默认卡片风格' },
  { value: 'transparent',  label: '透明 (Transparent)',     desc: '无背景边框' },
  { value: 'glass',        label: '玻璃 (Glass)',           desc: '磨砂玻璃效果' },
  { value: 'neon_outline', label: '霓虹描边 (Neon Outline)',desc: '品牌色描边发光' },
  { value: 'floating',     label: '漂浮 (Floating)',        desc: '无背景阴影漂浮' },
  { value: 'minimal',      label: '极简 (Minimal)',         desc: '纯文字极简' },
  { value: 'luxury',       label: '豪华 (Luxury)',          desc: '黑金奢华风格' },
  { value: 'cyber',        label: '赛博 (Cyber)',           desc: '科技感深色' },
  { value: 'dark_glass',   label: '暗玻璃 (Dark Glass)',    desc: '深色磨砂玻璃' },
  { value: 'modern',       label: '现代 (Modern)',          desc: '简约现代风' },
  { value: 'rounded',      label: '圆角 (Rounded)',         desc: '圆形卡片' },
  { value: 'square',       label: '方形 (Square)',          desc: '方正锐角风' },
  { value: 'compact',      label: '紧凑 (Compact)',         desc: '小尺寸密集' },
];

const QM_LAYOUT_OPTIONS = [
  { value: 'icon_text', label: '图标 + 文字' },
  { value: 'icon_only', label: '仅图标' },
  { value: 'text_only', label: '仅文字' },
  { value: 'floating',  label: '漂浮图标' },
  { value: 'compact',   label: '紧凑模式' },
];

const QM_HOVER_OPTIONS = [
  { value: 'none',       label: '无效果' },
  { value: 'scale',      label: '放大' },
  { value: 'glow',       label: '发光' },
  { value: 'scale_glow', label: '放大 + 发光' },
  { value: 'pulse',      label: '脉冲' },
  { value: 'float',      label: '漂浮' },
];

const QM_SPACING_OPTIONS = [
  { value: 'small',  label: '紧凑 (6px)' },
  { value: 'medium', label: '中等 (8px)' },
  { value: 'large',  label: '宽松 (16px)' },
];

// ─── Mini preview for Quick Menu styles ──────────────────────────────────────

function QMStylePreview({ style, layout }: { style: string; layout: string }) {
  const previewItems = ['🎰', '💰', '🎁', '👑'];
  const labels = ['Slots', 'Deposit', 'Promo', 'VIP'];

  const getPreviewItemStyle = (s: string): React.CSSProperties => {
    switch (s) {
      case 'glass':
        return { background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8 };
      case 'neon_outline':
        return { background: 'transparent', border: '1px solid #7c3aed', borderRadius: 8, boxShadow: '0 0 6px rgba(124,58,237,0.3)' };
      case 'luxury':
        return { background: '#050300', border: '1px solid #d97706', borderRadius: 8 };
      case 'cyber':
        return { background: 'rgba(0,10,30,0.85)', border: '1px solid #7c3aed', borderRadius: 6 };
      case 'dark_glass':
        return { background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 };
      case 'rounded':
        return { background: '#1f2937', border: '1px solid #374151', borderRadius: 999 };
      case 'square':
        return { background: '#1f2937', border: '1px solid #374151', borderRadius: 4 };
      case 'modern':
        return { background: '#1f2937', border: '1px solid #374151', borderRadius: 8 };
      case 'compact':
        return { background: '#111827', borderRadius: 6, padding: '2px' };
      case 'filled':
        return { background: '#1f2937', border: '1px solid #374151', borderRadius: 10 };
      default:
        return { background: 'transparent', borderRadius: 8 };
    }
  };

  const textColor = style === 'luxury' ? '#d97706' : style === 'neon_outline' ? '#a78bfa' : '#e5e7eb';
  const showText = layout !== 'icon_only';
  const showIcon = layout !== 'text_only';

  return (
    <div style={{ background: '#0f172a', borderRadius: 10, padding: '10px 8px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
      {previewItems.map((emoji, i) => (
        <div key={i} style={{ ...getPreviewItemStyle(style), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 4px', gap: 2 }}>
          {showIcon && <span style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</span>}
          {showText && <span style={{ fontSize: 9, color: textColor, fontWeight: 600, lineHeight: 1.2 }}>{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── QuickMenuEditor ──────────────────────────────────────────────────────────

function QuickMenuEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const items: QuickMenuItem[] = (config.items as QuickMenuItem[]) ?? [];
  const style    = (config.style    as string) ?? 'filled';
  const layout   = (config.layout   as string) ?? 'icon_text';
  const hover    = (config.hover    as string) ?? 'scale_glow';
  const spacing  = (config.spacing  as string) ?? 'medium';
  const customSt = (config.custom_style as Record<string, unknown>) ?? {};
  const [pickerForItem, setPickerForItem] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(Object.keys(customSt).length > 0);

  function set(key: string, val: unknown) {
    onChange({ ...config, [key]: val });
  }
  function setCustomField(key: string, val: unknown) {
    const next = { ...customSt };
    if (val === '' || val === null || val === undefined) {
      delete next[key];
    } else {
      next[key] = val;
    }
    onChange({ ...config, custom_style: next });
  }
  function updateItem(id: string, patch: Partial<QuickMenuItem>) {
    onChange({ ...config, items: items.map(i => i.id === id ? { ...i, ...patch } : i) });
  }
  function addItem() {
    const newItem: QuickMenuItem = {
      id: Date.now().toString(),
      label: '', emoji: '🎯', url: '',
      enabled: true, display_order: items.length * 10,
      media_id: null, badge: '',
    };
    onChange({ ...config, items: [...items, newItem] });
  }
  function removeItem(id: string) {
    onChange({ ...config, items: items.filter(i => i.id !== id) });
  }
  function moveItem(idx: number, dir: 'up' | 'down') {
    const next = [...items];
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...config, items: next.map((it, i) => ({ ...it, display_order: i * 10 })) });
  }

  return (
    <div className="space-y-5">

      {/* ── Style & Layout ── */}
      <div className="border rounded-xl p-3 space-y-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">外观风格</p>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">卡片样式</span>
            <select value={style} onChange={e => set('style', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {QM_STYLE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400 mt-0.5 block">
              {QM_STYLE_OPTIONS.find(o => o.value === style)?.desc}
            </span>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">布局模式</span>
            <select value={layout} onChange={e => set('layout', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {QM_LAYOUT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">每行列数</span>
            <select value={(config.columns as number) ?? 4}
              onChange={e => set('columns', parseInt(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} 列</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">悬停效果</span>
            <select value={hover} onChange={e => set('hover', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {QM_HOVER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">间距</span>
            <select value={spacing} onChange={e => set('spacing', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {QM_SPACING_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Mini preview */}
        <div>
          <p className="text-xs text-gray-500 mb-1.5">预览效果</p>
          <QMStylePreview style={style} layout={layout} />
        </div>
      </div>

      {/* ── Custom Style Overrides ── */}
      <div className="border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowCustom(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700">
          <span>自定义样式覆盖</span>
          <span className="text-xs text-gray-400">{showCustom ? '▲ 收起' : '▼ 展开'}</span>
        </button>
        {showCustom && (
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">背景颜色</span>
                <div className="flex gap-1">
                  <input type="color" value={(customSt.bg_color as string) || '#1f2937'}
                    onChange={e => setCustomField('bg_color', e.target.value)}
                    className="h-8 w-10 rounded border cursor-pointer" />
                  <input type="text" placeholder="#1f2937" value={(customSt.bg_color as string) ?? ''}
                    onChange={e => setCustomField('bg_color', e.target.value)}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-xs font-mono" />
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">背景透明度 (0–1)</span>
                <input type="text" inputMode="decimal"
                  placeholder="1" value={(customSt.bg_opacity as number) ?? ''}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setCustomField('bg_opacity', isNaN(v) ? undefined : Math.min(1, Math.max(0, v)));
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">边框颜色</span>
                <div className="flex gap-1">
                  <input type="color" value={(customSt.border_color as string) || '#374151'}
                    onChange={e => setCustomField('border_color', e.target.value)}
                    className="h-8 w-10 rounded border cursor-pointer" />
                  <input type="text" placeholder="#374151" value={(customSt.border_color as string) ?? ''}
                    onChange={e => setCustomField('border_color', e.target.value)}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-xs font-mono" />
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">边框宽度</span>
                <input type="text" placeholder="1px"
                  value={(customSt.border_width as string) ?? ''}
                  onChange={e => setCustomField('border_width', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">圆角大小</span>
                <input type="text" placeholder="12px"
                  value={(customSt.border_radius as string) ?? ''}
                  onChange={e => setCustomField('border_radius', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">发光颜色</span>
                <div className="flex gap-1">
                  <input type="color" value={(customSt.glow_color as string) || '#7c3aed'}
                    onChange={e => setCustomField('glow_color', e.target.value)}
                    className="h-8 w-10 rounded border cursor-pointer" />
                  <input type="text" placeholder="#7c3aed" value={(customSt.glow_color as string) ?? ''}
                    onChange={e => setCustomField('glow_color', e.target.value)}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-xs font-mono" />
                </div>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">悬停背景色</span>
                <div className="flex gap-1">
                  <input type="color" value={(customSt.hover_color as string) || '#374151'}
                    onChange={e => setCustomField('hover_color', e.target.value)}
                    className="h-8 w-10 rounded border cursor-pointer" />
                  <input type="text" placeholder="#374151" value={(customSt.hover_color as string) ?? ''}
                    onChange={e => setCustomField('hover_color', e.target.value)}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-xs font-mono" />
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">文字颜色</span>
                <div className="flex gap-1">
                  <input type="color" value={(customSt.text_color as string) || '#e5e7eb'}
                    onChange={e => setCustomField('text_color', e.target.value)}
                    className="h-8 w-10 rounded border cursor-pointer" />
                  <input type="text" placeholder="#e5e7eb" value={(customSt.text_color as string) ?? ''}
                    onChange={e => setCustomField('text_color', e.target.value)}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-xs font-mono" />
                </div>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">图标颜色</span>
                <div className="flex gap-1">
                  <input type="color" value={(customSt.icon_color as string) || '#ffffff'}
                    onChange={e => setCustomField('icon_color', e.target.value)}
                    className="h-8 w-10 rounded border cursor-pointer" />
                  <input type="text" placeholder="#ffffff" value={(customSt.icon_color as string) ?? ''}
                    onChange={e => setCustomField('icon_color', e.target.value)}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-xs font-mono" />
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">图标大小 (px)</span>
                <input type="text" inputMode="numeric" placeholder="28"
                  value={(customSt.icon_size as number) ?? ''}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    setCustomField('icon_size', isNaN(v) ? undefined : v);
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">文字大小 (px)</span>
                <input type="text" inputMode="numeric" placeholder="12"
                  value={(customSt.font_size as number) ?? ''}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    setCustomField('font_size', isNaN(v) ? undefined : v);
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">内间距</span>
                <input type="text" placeholder="8px 6px"
                  value={(customSt.padding as string) ?? ''}
                  onChange={e => setCustomField('padding', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">卡片高度</span>
                <input type="text" placeholder="80px"
                  value={(customSt.card_height as string) ?? ''}
                  onChange={e => setCustomField('card_height', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 mb-1 block">卡片宽度</span>
                <input type="text" placeholder="auto"
                  value={(customSt.card_width as string) ?? ''}
                  onChange={e => setCustomField('card_width', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
            {Object.keys(customSt).length > 0 && (
              <button
                onClick={() => { onChange({ ...config, custom_style: {} }); }}
                className="text-xs text-red-500 hover:underline">
                清除所有自定义样式
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Menu Items ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">菜单项 ({items.length})</span>
          <button onClick={addItem}
            className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
            <Plus className="w-3 h-3" /> 添加
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="border rounded-xl p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => moveItem(idx, 'up')} disabled={idx === 0}
                    className="p-1 rounded hover:bg-white disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  <button onClick={() => moveItem(idx, 'down')} disabled={idx === items.length - 1}
                    className="p-1 rounded hover:bg-white disabled:opacity-30">
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input type="checkbox" checked={item.enabled}
                      onChange={e => updateItem(item.id, { enabled: e.target.checked })}
                      className="rounded" />
                    显示
                  </label>
                </div>
                <button onClick={() => removeItem(item.id)}
                  className="p-1 rounded hover:bg-red-50 text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <input placeholder="图标" value={item.emoji}
                  onChange={e => updateItem(item.id, { emoji: e.target.value })}
                  className="border rounded-lg px-2 py-1.5 text-sm text-center bg-white" />
                <input placeholder="标签名称" value={item.label}
                  onChange={e => updateItem(item.id, { label: e.target.value })}
                  className="border rounded-lg px-2 py-1.5 text-sm bg-white col-span-2" />
                <input placeholder="徽章（可选）" value={item.badge ?? ''}
                  onChange={e => updateItem(item.id, { badge: e.target.value })}
                  className="border rounded-lg px-2 py-1.5 text-sm bg-white" />
              </div>
              <input placeholder="跳转链接，例如 /deposit" value={item.url}
                onChange={e => updateItem(item.id, { url: e.target.value })}
                className="mt-2 w-full border rounded-lg px-2 py-1.5 text-sm bg-white" />
              <div className="mt-2 space-y-2">
                <p className="text-xs text-gray-500">自定义图片（覆盖emoji）</p>

                {/* ── Image picker ── */}
                {item.media_id ? (
                  <div className="flex items-center gap-2">
                    <img src={`/api/public/media/${item.media_id}`} alt=""
                      className="w-12 h-8 rounded-lg object-cover border" />
                    <button onClick={() => setPickerForItem(item.id)}
                      className="text-xs text-blue-500 hover:underline">更换</button>
                    <button onClick={() => updateItem(item.id, { media_id: null, image_mode: undefined })}
                      className="text-xs text-red-400 hover:underline">删除</button>
                  </div>
                ) : (
                  <button onClick={() => setPickerForItem(item.id)}
                    className="text-xs text-blue-500 border border-dashed border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50 w-full">
                    + 选择图片 / 上传 Banner
                  </button>
                )}

                {/* ── Image settings (only when image is set) ── */}
                {item.media_id ? (
                  <div className="space-y-2">
                    {/* Image Mode */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1">图片模式 Image Mode</p>
                      <div className="grid grid-cols-2 gap-1">
                        {([
                          { v: 'fill_container', l: '🖼 填满按钮 Fill' },
                          { v: 'cover',          l: '✂️ Cover（裁剪）' },
                          { v: 'contain',        l: '📐 Contain（完整）' },
                          { v: 'original',       l: '📷 原始尺寸' },
                          { v: 'icon',           l: '🔷 小图标 Icon' },
                        ] as const).map(m => (
                          <button key={m.v}
                            onClick={() => updateItem(item.id, { image_mode: m.v })}
                            className={`py-1.5 px-2 text-xs rounded-lg border font-medium transition-colors text-left ${
                              (item.image_mode == null ? 'fill_container' : (item.image_mode === 'full_button' || item.image_mode === 'banner') ? 'cover' : item.image_mode) === m.v
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'border-gray-300 text-gray-600 hover:border-blue-300 bg-white'
                            }`}>
                            {m.l}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {!item.image_mode || item.image_mode === 'fill_container'
                          ? 'object-fit: fill — 图片完全填满卡片，可能拉伸'
                          : item.image_mode === 'cover' ? 'object-fit: cover — 保持比例填充，边缘裁剪'
                          : item.image_mode === 'contain' ? 'object-fit: contain — 完整显示，不裁剪'
                          : item.image_mode === 'original' ? 'object-fit: none — 按原始像素尺寸显示'
                          : '缩小为图标（适合小标志 / Logo）'}
                      </p>
                    </div>

                    {/* Settings for non-icon modes */}
                    {item.image_mode !== 'icon' && (
                      <div className="space-y-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                        {/* Card Height — auto by default (image drives container height) */}
                        <div>
                          <p className="text-xs text-gray-500 mb-1">卡片高度 Card Height</p>
                          <div className="flex gap-1 flex-wrap">
                            {[
                              { v: 'auto',   label: 'Auto（推荐）' },
                              { v: 'small',  label: 'Small 80px'  },
                              { v: 'medium', label: 'Medium 120px' },
                              { v: 'large',  label: 'Large 180px' },
                            ].map(opt => (
                              <button key={opt.v}
                                onClick={() => updateItem(item.id, { card_height: opt.v })}
                                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                                  (item.card_height ?? 'auto') === opt.v
                                    ? 'bg-blue-500 text-white border-blue-500'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                                }`}>
                                {opt.label}
                              </button>
                            ))}
                            <button
                              onClick={() => {
                                const cur = item.card_height;
                                const isCustom = cur && !['auto','small','medium','large'].includes(cur);
                                updateItem(item.id, { card_height: isCustom ? cur : '200px' });
                              }}
                              className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                                item.card_height && !['auto','small','medium','large'].includes(item.card_height)
                                  ? 'bg-blue-500 text-white border-blue-500'
                                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                              }`}>
                              Custom
                            </button>
                          </div>
                          {item.card_height && !['auto','small','medium','large'].includes(item.card_height) && (
                            <div className="mt-1.5">
                              <p className="text-xs text-gray-500 mb-0.5">高度 Height</p>
                              <input type="text" placeholder="200px"
                                value={item.card_height}
                                onChange={e => updateItem(item.id, { card_height: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-xs bg-white font-mono" />
                              <p className="text-xs text-gray-400 mt-0.5">支持: 120px · 180px · 240px · 320px · 400px</p>
                            </div>
                          )}
                          <div className="mt-1 space-y-0.5">
                            <p className="text-xs text-gray-400">
                              <span className="font-medium text-gray-500">Auto:</span> 卡片高度跟随图片自动调整
                            </p>
                            <p className="text-xs text-gray-400">
                              <span className="font-medium text-gray-500">固定高度:</span> 图片按选择的模式填充卡片
                            </p>
                          </div>
                        </div>

                        {/* Border radius + padding */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">圆角 Radius</p>
                            <input type="text" placeholder="12px（跟随卡片）"
                              value={item.btn_radius ?? ''}
                              onChange={e => updateItem(item.id, { btn_radius: e.target.value })}
                              className="w-full border rounded px-2 py-1 text-xs bg-white" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">内边距 Padding</p>
                            <input type="text" placeholder="0"
                              value={item.btn_padding ?? ''}
                              onChange={e => updateItem(item.id, { btn_padding: e.target.value })}
                              className="w-full border rounded px-2 py-1 text-xs bg-white" />
                          </div>
                        </div>

                        {/* Background */}
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">背景 Background</p>
                          <select
                            value={item.btn_bg_type ?? 'transparent'}
                            onChange={e => updateItem(item.id, { btn_bg_type: e.target.value as QuickMenuItem['btn_bg_type'] })}
                            className="w-full border rounded px-2 py-1.5 text-xs bg-white">
                            <option value="transparent">透明 Transparent</option>
                            <option value="solid">纯色 Solid</option>
                            <option value="gradient">渐变 Gradient</option>
                            <option value="glass">玻璃 Glass</option>
                          </select>
                          {item.btn_bg_type === 'solid' && (
                            <div className="flex items-center gap-2 mt-1">
                              <input type="color" value={item.btn_bg_color || '#000000'}
                                onChange={e => updateItem(item.id, { btn_bg_color: e.target.value })}
                                className="w-7 h-7 rounded border cursor-pointer" />
                              <input type="text" value={item.btn_bg_color ?? ''}
                                onChange={e => updateItem(item.id, { btn_bg_color: e.target.value })}
                                className="flex-1 border rounded px-2 py-1 text-xs font-mono bg-white" />
                            </div>
                          )}
                          {item.btn_bg_type === 'gradient' && (
                            <input type="text" placeholder="linear-gradient(135deg, #000 0%, #222 100%)"
                              value={item.btn_bg_gradient ?? ''}
                              onChange={e => updateItem(item.id, { btn_bg_gradient: e.target.value })}
                              className="mt-1 w-full border rounded px-2 py-1 text-xs font-mono bg-white" />
                          )}
                        </div>

                        {/* Image Position */}
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">图片位置 Position</p>
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { v: 'top center',    l: '↑ 上' },
                              { v: 'center',        l: '● 中' },
                              { v: 'bottom center', l: '↓ 下' },
                              { v: 'left center',   l: '← 左' },
                              { v: 'right center',  l: '→ 右' },
                            ].map(pos => (
                              <button key={pos.v}
                                onClick={() => updateItem(item.id, { img_position: pos.v })}
                                className={`py-1 text-xs rounded border transition-colors ${
                                  (item.img_position ?? 'center') === pos.v
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'border-gray-300 text-gray-600 hover:border-blue-300 bg-white'
                                }`}>
                                {pos.l}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Image Scale */}
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">
                            缩放 Scale: <span className="font-semibold text-blue-600">{item.img_scale ?? 100}%</span>
                          </p>
                          <input type="range" min={50} max={200} step={5}
                            value={item.img_scale ?? 100}
                            onChange={e => updateItem(item.id, { img_scale: parseInt(e.target.value) })}
                            className="w-full" />
                          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                            <span>50%</span><span>100%</span><span>150%</span><span>200%</span>
                          </div>
                        </div>

                        <UploadHint recSize="1200×400 / 1000×300 / 800×250" ratio="横幅 3:1 或 4:1" maxMB={5} formats="PNG · WEBP · GIF · SVG" note="GIF 动图可正常播放" />
                      </div>
                    )}

                    {item.image_mode === 'icon' && (
                      <UploadHint recSize="128 × 128 px" ratio="1:1" maxMB={2} formats="PNG · GIF · WEBP · SVG" note="透明背景 PNG 效果最佳" />
                    )}
                  </div>
                ) : (
                  <UploadHint recSize="1200×400 / 800×250" ratio="横幅 3:1 或 4:1" maxMB={5} formats="PNG · WEBP · GIF · SVG" note="上传图片后自动填满按钮" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {pickerForItem && (
        <MediaPicker
          mode="single"
          typeFilter={['IMAGE', 'GIF']}
          onSelect={(media) => {
            const single = Array.isArray(media) ? media[0] : media;
            if (single) {
              // Default to fill_container so the image fills the button area immediately
              const cur = items.find(it => it.id === pickerForItem);
              updateItem(pickerForItem, {
                media_id:   single.id,
                image_mode: cur?.image_mode ?? 'fill_container',
              });
            }
            setPickerForItem(null);
          }}
          onClose={() => setPickerForItem(null)}
        />
      )}
    </div>
  );
}

// ─── Simple Config Editors ─────────────────────────────────────────────────────

function PromotionsEditor({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs text-gray-500 mb-1 block">标题</span>
        <input className="w-full border rounded-lg px-3 py-2 text-sm"
          value={(config.title as string) ?? ''}
          onChange={e => onChange({ ...config, title: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-xs text-gray-500 mb-1 block">副标题（可选）</span>
        <input className="w-full border rounded-lg px-3 py-2 text-sm"
          value={(config.subtitle as string) ?? ''}
          onChange={e => onChange({ ...config, subtitle: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-xs text-gray-500 mb-1 block">查看全部链接</span>
        <input className="w-full border rounded-lg px-3 py-2 text-sm"
          value={(config.show_all_link as string) ?? '/promotions'}
          onChange={e => onChange({ ...config, show_all_link: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-xs text-gray-500 mb-1 block">最多显示数量</span>
        <input type="number" min={1} max={20} className="w-full border rounded-lg px-3 py-2 text-sm"
          value={(config.max_items as number) ?? 6}
          onChange={e => onChange({ ...config, max_items: parseInt(e.target.value) || 6 })} />
      </label>
    </div>
  );
}

function ProvidersEditor({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs text-gray-500 mb-1 block">标题</span>
        <input className="w-full border rounded-lg px-3 py-2 text-sm"
          value={(config.title as string) ?? ''}
          onChange={e => onChange({ ...config, title: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-xs text-gray-500 mb-1 block">每行列数</span>
        <select className="border rounded-lg px-3 py-2 text-sm"
          value={(config.columns as number) ?? 4}
          onChange={e => onChange({ ...config, columns: parseInt(e.target.value) })}>
          {[3, 4, 5, 6].map(n => <option key={n} value={n}>{n} 列</option>)}
        </select>
      </label>
    </div>
  );
}

const LIVE_TX_THEME_OPTIONS = [
  { value: 'classic_purple', label: '经典紫' },
  { value: 'cyber_neon',     label: '赛博霓虹' },
  { value: 'blue_tech',      label: '科技蓝' },
  { value: 'red_luxury',     label: '红色豪华' },
  { value: 'gold_vip',       label: '金色 VIP' },
  { value: 'emerald_green',  label: '翡翠绿' },
  { value: 'dark_glass',     label: '暗黑玻璃' },
  { value: 'cyberpunk',      label: 'Cyberpunk' },
  { value: 'matrix',         label: 'Matrix' },
  { value: 'minimal',        label: '极简' },
  { value: 'titanium',       label: '钛金' },
  { value: 'future_ai',      label: '未来 AI' },
  { value: 'custom',         label: '自定义…' },
];

const LIVE_TX_FONT_OPTIONS = [
  { value: 'default',    label: '默认字体' },
  { value: 'monospace',  label: '等宽 (Courier)' },
  { value: 'modern',     label: '现代 (Segoe UI)' },
  { value: 'serif',      label: '衬线 (Georgia)' },
  { value: 'tech',       label: '科技 (Courier)' },
  { value: 'luxury',     label: '奢华 (Palatino)' },
];

const CUSTOM_COLOR_FIELDS: { key: string; label: string }[] = [
  { key: 'card_bg',       label: '卡片背景色' },
  { key: 'card_border',   label: '边框颜色' },
  { key: 'deposit_color', label: '充值文字颜色' },
  { key: 'deposit_bg',    label: '充值行背景' },
  { key: 'withdraw_color',label: '提款文字颜色' },
  { key: 'withdraw_bg',   label: '提款行背景' },
  { key: 'row_bg',        label: '行背景色' },
  { key: 'divider',       label: '分隔线颜色' },
  { key: 'live_dot',      label: 'LIVE 指示点颜色' },
  { key: 'badge_bg',      label: '游戏徽章背景' },
  { key: 'badge_text',    label: '游戏徽章文字' },
  { key: 'time_color',    label: '时间文字颜色' },
  { key: 'phone_color',   label: '手机号文字颜色' },
];

// Simple live preview for ERP editor
function LiveTxMiniPreview({ themeId, customTheme, fontStyle }: {
  themeId: string;
  customTheme: Record<string, string>;
  fontStyle: string;
}) {
  const DEMO_ROWS = [
    { phone: '6012*****789', amount: 500,  provider: '918KISS', type: 'd' },
    { phone: '6018*****456', amount: 1500, provider: 'MEGA888',  type: 'w' },
    { phone: '6011*****234', amount: 200,  provider: 'MEGA888',  type: 'd' },
  ];

  const THEMES: Record<string, { cardBg: string; cardBorder: string; depositColor: string; withdrawColor: string; rowBg: string; badgeBg: string; badgeText: string; timeColor: string; phoneColor: string; fontFamily?: string }> = {
    classic_purple: { cardBg:'#1e1b2e', cardBorder:'rgba(168,85,247,0.3)', depositColor:'#22c55e', withdrawColor:'#a855f7', rowBg:'rgba(255,255,255,0.05)', badgeBg:'rgba(251,191,36,0.12)', badgeText:'#d97706', timeColor:'rgba(255,255,255,0.3)', phoneColor:'rgba(255,255,255,0.85)' },
    cyber_neon:     { cardBg:'#0d1117', cardBorder:'#00e5ff', depositColor:'#00e5ff', withdrawColor:'#ff0080', rowBg:'rgba(0,229,255,0.04)', badgeBg:'rgba(0,229,255,0.12)', badgeText:'#00e5ff', timeColor:'rgba(0,229,255,0.5)', phoneColor:'#00e5ff', fontFamily:'"Courier New",monospace' },
    blue_tech:      { cardBg:'#0f172a', cardBorder:'rgba(96,165,250,0.3)', depositColor:'#60a5fa', withdrawColor:'#818cf8', rowBg:'rgba(96,165,250,0.05)', badgeBg:'rgba(96,165,250,0.12)', badgeText:'#60a5fa', timeColor:'rgba(148,163,184,0.6)', phoneColor:'#e2e8f0' },
    red_luxury:     { cardBg:'#1a0505', cardBorder:'rgba(239,68,68,0.4)', depositColor:'#f87171', withdrawColor:'#fbbf24', rowBg:'rgba(239,68,68,0.05)', badgeBg:'rgba(251,191,36,0.12)', badgeText:'#fbbf24', timeColor:'rgba(248,113,113,0.5)', phoneColor:'#fecaca' },
    gold_vip:       { cardBg:'#0a0800', cardBorder:'rgba(217,119,6,0.6)', depositColor:'#d97706', withdrawColor:'#94a3b8', rowBg:'rgba(217,119,6,0.04)', badgeBg:'rgba(217,119,6,0.15)', badgeText:'#d97706', timeColor:'rgba(217,119,6,0.5)', phoneColor:'#fbbf24' },
    emerald_green:  { cardBg:'#071f10', cardBorder:'rgba(16,185,129,0.3)', depositColor:'#10b981', withdrawColor:'#6ee7b7', rowBg:'rgba(16,185,129,0.05)', badgeBg:'rgba(16,185,129,0.12)', badgeText:'#34d399', timeColor:'rgba(16,185,129,0.5)', phoneColor:'#a7f3d0' },
    dark_glass:     { cardBg:'rgba(10,10,20,0.85)', cardBorder:'rgba(255,255,255,0.1)', depositColor:'#22c55e', withdrawColor:'#c084fc', rowBg:'rgba(255,255,255,0.04)', badgeBg:'rgba(255,255,255,0.08)', badgeText:'#d1d5db', timeColor:'rgba(255,255,255,0.3)', phoneColor:'rgba(255,255,255,0.8)' },
    cyberpunk:      { cardBg:'#0a0014', cardBorder:'#ec4899', depositColor:'#facc15', withdrawColor:'#ec4899', rowBg:'rgba(236,72,153,0.04)', badgeBg:'rgba(250,204,21,0.12)', badgeText:'#facc15', timeColor:'rgba(236,72,153,0.5)', phoneColor:'#f0abfc', fontFamily:'"Courier New",monospace' },
    matrix:         { cardBg:'#000900', cardBorder:'#00ff41', depositColor:'#00ff41', withdrawColor:'#00cc33', rowBg:'rgba(0,255,65,0.04)', badgeBg:'rgba(0,255,65,0.12)', badgeText:'#00ff41', timeColor:'rgba(0,255,65,0.5)', phoneColor:'#39ff14', fontFamily:'"Courier New",monospace' },
    minimal:        { cardBg:'#ffffff', cardBorder:'#e5e7eb', depositColor:'#16a34a', withdrawColor:'#7c3aed', rowBg:'#f9fafb', badgeBg:'#f3f4f6', badgeText:'#6b7280', timeColor:'#9ca3af', phoneColor:'#111827' },
    titanium:       { cardBg:'#111827', cardBorder:'rgba(148,163,184,0.3)', depositColor:'#94a3b8', withdrawColor:'#64748b', rowBg:'rgba(148,163,184,0.05)', badgeBg:'rgba(148,163,184,0.12)', badgeText:'#cbd5e1', timeColor:'rgba(100,116,139,0.6)', phoneColor:'#e2e8f0' },
    future_ai:      { cardBg:'rgba(2,6,23,0.95)', cardBorder:'rgba(56,189,248,0.3)', depositColor:'#38bdf8', withdrawColor:'#818cf8', rowBg:'rgba(56,189,248,0.04)', badgeBg:'rgba(56,189,248,0.10)', badgeText:'#7dd3fc', timeColor:'rgba(56,189,248,0.4)', phoneColor:'#bae6fd' },
  };

  let t = themeId === 'custom'
    ? { cardBg: customTheme.card_bg||'#1e1b2e', cardBorder: customTheme.card_border||'rgba(168,85,247,0.3)', depositColor: customTheme.deposit_color||'#22c55e', withdrawColor: customTheme.withdraw_color||'#a855f7', rowBg: customTheme.row_bg||'rgba(255,255,255,0.05)', badgeBg: customTheme.badge_bg||'rgba(251,191,36,0.12)', badgeText: customTheme.badge_text||'#d97706', timeColor: customTheme.time_color||'rgba(255,255,255,0.3)', phoneColor: customTheme.phone_color||'rgba(255,255,255,0.85)', fontFamily: undefined as string|undefined }
    : (THEMES[themeId] ?? THEMES.classic_purple);

  const FONT_MAP: Record<string, string> = { monospace: '"Courier New",monospace', modern: '"Segoe UI",sans-serif', serif: 'Georgia,serif', tech: '"Courier New",monospace', luxury: 'Georgia,serif' };
  if (fontStyle && fontStyle !== 'default' && FONT_MAP[fontStyle]) t = { ...t, fontFamily: FONT_MAP[fontStyle] };

  const deposits    = DEMO_ROWS.filter(r => r.type === 'd');
  const withdrawals = DEMO_ROWS.filter(r => r.type === 'w');

  return (
    <div className="rounded-xl p-3 mt-3" style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, fontFamily: t.fontFamily }}>
      <div className="flex gap-2">
        {[{ rows: deposits, label: 'TOP UP', color: t.depositColor }, { rows: withdrawals, label: 'WITHDRAW', color: t.withdrawColor }].map((col, ci) => (
          <div key={ci} className="flex-1 min-w-0">
            <div className="text-center text-[9px] font-bold py-0.5 rounded mb-1" style={{ color: col.color, background: ci === 0 ? `${t.depositColor}18` : `${t.withdrawColor}18` }}>{col.label}</div>
            {col.rows.map((row, ri) => (
              <div key={ri} className="rounded px-1.5 py-0.5 mb-0.5" style={{ background: t.rowBg }}>
                <div className="flex justify-between"><span style={{ color: t.phoneColor, fontSize: 9 }}>{row.phone}</span><span style={{ color: col.color, fontSize: 9, fontWeight: 700 }}>RM{row.amount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
                <div className="flex justify-between"><span style={{ background: t.badgeBg, color: t.badgeText, fontSize: 7, padding: '0 3px', borderRadius: 2 }}>{row.provider}</span><span style={{ color: t.timeColor, fontSize: 7 }}>2分前</span></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const LTX_DATA_SOURCE_OPTIONS = [
  { value: 'smart_mix',      label: '智能混合 (Smart Mix)',      desc: '真实数据 + 生成数据补齐' },
  { value: 'real',           label: '仅真实数据 (Real Only)',    desc: '只显示DB真实交易记录' },
  { value: 'auto_generated', label: '自动生成 (Auto Generated)', desc: '纯模拟数据，不读取DB' },
];

const LTX_SPEED_OPTIONS = [
  { value: 'slow',   label: '慢速 (15s)' },
  { value: 'normal', label: '正常 (8s)' },
  { value: 'fast',   label: '快速 (3s)' },
];

const LTX_ANIMATION_OPTIONS = [
  { value: 'none',     label: '无动画' },
  { value: 'fade_in',  label: '淡入' },
  { value: 'slide_in', label: '滑入' },
  { value: 'bounce',   label: '弹跳' },
];

const LTX_AMOUNT_OPTIONS = [
  { value: 'full',   label: '显示金额 (RM500.00)' },
  { value: 'range',  label: '显示区间 (RM500-599)' },
  { value: 'hidden', label: '隐藏金额 (***)' },
];

const LTX_PROVIDER_OPTIONS = [
  { value: 'badge', label: '徽章 Badge' },
  { value: 'chip',  label: '描边 Chip' },
  { value: 'text',  label: '纯文字' },
];

const LTX_TIMESTAMP_OPTIONS = [
  { value: 'relative', label: '相对时间 (2分前)' },
  { value: 'absolute', label: '绝对时间 (14:32)' },
  { value: 'hidden',   label: '隐藏时间' },
];

const LTX_INDICATOR_OPTIONS = [
  { value: 'pulse_dot', label: '脉冲点 (默认)' },
  { value: 'dot',       label: '静态点' },
  { value: 'ring',      label: '光圈' },
  { value: 'text_only', label: '文字标记' },
];

const LTX_PROFILE_OPTIONS = [
  { value: 'conservative',  label: '保守 Conservative (RM30–500)' },
  { value: 'normal',        label: '正常 Normal (RM100–2000)' },
  { value: 'high_roller',   label: '大额 High Value (RM500–10000)' },
  { value: 'vip',           label: 'VIP (RM2000–50000)' },
  { value: 'random',        label: '随机混合 Random Mix' },
  { value: 'custom_range',  label: '自定义范围 Custom Range' },
];

function LiveTxEditor({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const themeId          = (config.theme            as string) || 'classic_purple';
  const fontStyle        = (config.font_style        as string) || 'default';
  const customTheme      = (config.custom_theme      as Record<string, string>) || {};
  const dataSource       = (config.data_source       as string) || 'smart_mix';
  const generationProfile= (config.generation_profile as string) || 'normal';
  const activitySpeed    = (config.activity_speed    as string) || 'normal';
  const animStyle        = (config.animation_style   as string) || 'fade_in';
  const amountStyle      = (config.amount_style      as string) || 'full';
  const providerStyle    = (config.provider_style    as string) || 'badge';
  const timestampStyle   = (config.timestamp_style   as string) || 'relative';
  const indicatorStyle   = (config.indicator_style   as string) || 'pulse_dot';

  function setCustomColor(key: string, value: string) {
    onChange({ ...config, custom_theme: { ...customTheme, [key]: value } });
  }

  return (
    <div className="space-y-4">

      {/* ── 基础设置 ── */}
      <div className="border rounded-xl p-3 space-y-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">基础设置</p>

        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">标题</span>
          <input className="w-full border rounded-lg px-3 py-2 text-sm"
            value={(config.title as string) ?? ''}
            onChange={e => onChange({ ...config, title: e.target.value })} />
        </label>

        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">显示条数（每列，1–20）</span>
          <input
            type="number" min={1} max={20}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={(config.limit as number) ?? 8}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={e => {
              const v = e.target.value;
              if (v === '') { onChange({ ...config, limit: '' }); return; }
              const n = parseInt(v, 10);
              if (!isNaN(n)) onChange({ ...config, limit: Math.min(20, Math.max(1, n)) });
            }}
            onBlur={e => {
              const n = parseInt(e.target.value, 10);
              onChange({ ...config, limit: isNaN(n) ? 8 : Math.min(20, Math.max(1, n)) });
            }}
          />
        </label>
      </div>

      {/* ── 数据源模式 ── */}
      <div className="border rounded-xl p-3 space-y-3">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">数据源模式</p>

        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">活动数据来源</span>
          <select value={dataSource} onChange={e => onChange({ ...config, data_source: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            {LTX_DATA_SOURCE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400 mt-0.5 block">
            {LTX_DATA_SOURCE_OPTIONS.find(o => o.value === dataSource)?.desc}
          </span>
        </label>

        {(dataSource === 'smart_mix' || dataSource === 'auto_generated') && (
          <>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">生成金额档次</span>
              <select value={generationProfile}
                onChange={e => onChange({ ...config, generation_profile: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {LTX_PROFILE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            {generationProfile === 'custom_range' && (
              <div className="border rounded-xl p-3 space-y-3 bg-white">
                <p className="text-xs font-semibold text-gray-700">自定义金额范围</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-gray-500 mb-1 block">存款最低 (RM)</span>
                    <NumericInput min={1} className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={(config.custom_dep_min as number) ?? 50}
                      onChange={n => onChange({ ...config, custom_dep_min: n })} />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500 mb-1 block">存款最高 (RM)</span>
                    <NumericInput min={1} className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={(config.custom_dep_max as number) ?? 2000}
                      onChange={n => onChange({ ...config, custom_dep_max: n })} />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500 mb-1 block">取款最低 (RM)</span>
                    <NumericInput min={1} className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={(config.custom_wth_min as number) ?? 100}
                      onChange={n => onChange({ ...config, custom_wth_min: n })} />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500 mb-1 block">取款最高 (RM)</span>
                    <NumericInput min={1} className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={(config.custom_wth_max as number) ?? 5000}
                      onChange={n => onChange({ ...config, custom_wth_max: n })} />
                  </label>
                </div>
              </div>
            )}
          </>
        )}

        {dataSource !== 'real' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            生成的交易数据仅供展示，绝不写入数据库
          </div>
        )}
      </div>

      {/* ── 供应商来源 ── */}
      <div className="border rounded-xl p-3 space-y-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">游戏供应商来源</p>

        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">供应商数据来源</span>
          <select
            value={(config.provider_source as string) ?? 'website_providers'}
            onChange={e => onChange({ ...config, provider_source: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="website_providers">网站已配置供应商（自动同步）</option>
            <option value="custom_list">自定义列表</option>
          </select>
          <span className="text-xs text-gray-400 mt-0.5 block">
            {(config.provider_source as string) === 'custom_list'
              ? '手动输入供应商名称，每行一个'
              : '自动读取 Website CMS → 游戏平台 中启用的供应商'}
          </span>
        </label>

        {(config.provider_source as string) === 'custom_list' && (
          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">供应商列表（每行一个）</span>
            <textarea
              rows={6}
              placeholder={'MEGA888\nPussy888\nJOKER\nLive22\nXE88'}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              value={((config.custom_providers as string[]) ?? []).join('\n')}
              onChange={e => {
                // Split by newline, trim each line but preserve empty lines so
                // the cursor stays in place while the user types.
                const lines = e.target.value.split('\n').map(l => l.trimStart());
                onChange({ ...config, custom_providers: lines });
              }}
              onBlur={e => {
                // On blur: strip trailing empty lines and fully trim each line
                const lines = e.target.value.split('\n').map(l => l.trim()).filter(Boolean);
                onChange({ ...config, custom_providers: lines });
              }}
            />
            <span className="text-xs text-gray-400">
              已输入 {((config.custom_providers as string[]) ?? []).filter(Boolean).length} 个供应商
            </span>
          </label>
        )}
      </div>

      {/* ── 生成设置（Smart Mix & Auto Generated） ── */}
      {(dataSource === 'smart_mix' || dataSource === 'auto_generated') && (
        <div className="border rounded-xl p-3 space-y-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">生成设置</p>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">存款出现概率 %</span>
              <NumericInput min={0} max={100} className="w-full border rounded-lg px-3 py-2 text-sm"
                value={(config.deposit_chance as number) ?? 70}
                onChange={n => onChange({ ...config, deposit_chance: n })} />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block">取款出现概率 %</span>
              <NumericInput min={0} max={100} className="w-full border rounded-lg px-3 py-2 text-sm"
                value={(config.withdraw_chance as number) ?? 25}
                onChange={n => onChange({ ...config, withdraw_chance: n })} />
            </label>
          </div>

          <div>
            <span className="text-xs text-gray-500 mb-1 block">存款刷新间隔（秒）</span>
            <div className="flex items-center gap-2">
              <NumericInput min={2} max={120} placeholder="最小"
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                value={(config.deposit_interval_min as number) ?? 6}
                onChange={n => onChange({ ...config, deposit_interval_min: n })} />
              <span className="text-gray-400 text-xs">~</span>
              <NumericInput min={2} max={120} placeholder="最大"
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                value={(config.deposit_interval_max as number) ?? 12}
                onChange={n => onChange({ ...config, deposit_interval_max: n })} />
              <span className="text-xs text-gray-400">秒</span>
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-500 mb-1 block">取款刷新间隔（秒）</span>
            <div className="flex items-center gap-2">
              <NumericInput min={2} max={300} placeholder="最小"
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                value={(config.withdraw_interval_min as number) ?? 15}
                onChange={n => onChange({ ...config, withdraw_interval_min: n })} />
              <span className="text-gray-400 text-xs">~</span>
              <NumericInput min={2} max={300} placeholder="最大"
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                value={(config.withdraw_interval_max as number) ?? 45}
                onChange={n => onChange({ ...config, withdraw_interval_max: n })} />
              <span className="text-xs text-gray-400">秒</span>
            </div>
          </div>

          <div className="text-xs text-gray-400 bg-white border rounded-lg px-3 py-2 space-y-0.5">
            <p>📊 默认行为：存款 70% / 取款 25%</p>
            <p>⏱ 存款 6-12 秒独立刷新，取款 15-45 秒独立刷新</p>
            <p>✅ 两列完全独立生成，不会同步出现</p>
          </div>
        </div>
      )}

      {/* ── 主题 & 字体 ── */}
      <div className="border rounded-xl p-3 space-y-3">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">主题 & 字体</p>

        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">主题样式</span>
          <select className="w-full border rounded-lg px-3 py-2 text-sm"
            value={themeId} onChange={e => onChange({ ...config, theme: e.target.value })}>
            {LIVE_TX_THEME_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">字体风格</span>
          <select className="w-full border rounded-lg px-3 py-2 text-sm"
            value={fontStyle} onChange={e => onChange({ ...config, font_style: e.target.value })}>
            {LIVE_TX_FONT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        {themeId === 'custom' && (
          <div className="border rounded-xl p-3 space-y-2 bg-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-2">自定义颜色</p>
            {CUSTOM_COLOR_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <input type="color" className="w-8 h-8 rounded border cursor-pointer flex-shrink-0"
                  value={customTheme[key] || '#000000'}
                  onChange={e => setCustomColor(key, e.target.value)} />
                <span className="text-xs text-gray-600 flex-1">{label}</span>
                <input type="text" className="border rounded px-2 py-1 text-xs w-32"
                  value={customTheme[key] || ''} placeholder="rgba / hex / var(…)"
                  onChange={e => setCustomColor(key, e.target.value)} />
              </div>
            ))}
          </div>
        )}

        <div>
          <p className="text-xs text-gray-500 mb-1">效果预览</p>
          <LiveTxMiniPreview themeId={themeId} customTheme={customTheme} fontStyle={fontStyle} />
        </div>
      </div>

      {/* ── 外观选项 ── */}
      <div className="border rounded-xl p-3 space-y-3">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">外观 & 动效</p>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">刷新速度</span>
            <select value={activitySpeed} onChange={e => onChange({ ...config, activity_speed: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {LTX_SPEED_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">行动画</span>
            <select value={animStyle} onChange={e => onChange({ ...config, animation_style: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {LTX_ANIMATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">金额显示</span>
            <select value={amountStyle} onChange={e => onChange({ ...config, amount_style: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {LTX_AMOUNT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">游戏商标签</span>
            <select value={providerStyle} onChange={e => onChange({ ...config, provider_style: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {LTX_PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">时间戳显示</span>
            <select value={timestampStyle} onChange={e => onChange({ ...config, timestamp_style: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {LTX_TIMESTAMP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">LIVE 指示器</span>
            <select value={indicatorStyle} onChange={e => onChange({ ...config, indicator_style: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {LTX_INDICATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

function MemberZoneEditor({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  type ButtonKey = 'login_button' | 'register_button' | 'deposit_button' | 'withdraw_button';
  function updateButton(key: ButtonKey, patch: Record<string, unknown>) {
    onChange({ ...config, [key]: { ...(config[key] as Record<string, unknown> ?? {}), ...patch } });
  }

  function handleBgMedia(media: MediaRecord | MediaRecord[]) {
    const s = Array.isArray(media) ? media[0] : media;
    if (!s) return;
    onChange({ ...config, bg_media_id: s.id, bg_media_url: `/api/public/media/${s.id}`, bg_media_type: s.mediaType ?? 'IMAGE' });
    setPickerFor(null);
  }

  function handleButtonMedia(key: ButtonKey, media: MediaRecord | MediaRecord[]) {
    const s = Array.isArray(media) ? media[0] : media;
    if (!s) return;
    updateButton(key, { media_id: s.id, media_url: `/api/public/media/${s.id}`, media_type: s.mediaType ?? 'IMAGE' });
    setPickerFor(null);
  }

  const bg = config as Record<string, unknown>;
  const loginBtn    = (bg.login_button    as Record<string, unknown>) ?? {};
  const registerBtn = (bg.register_button as Record<string, unknown>) ?? {};
  const depositBtn  = (bg.deposit_button  as Record<string, unknown>) ?? {};
  const withdrawBtn = (bg.withdraw_button as Record<string, unknown>) ?? {};

  return (
    <div className="space-y-5">
      {/* Background */}
      <div className="border rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">卡片背景</h4>
        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className="text-xs text-gray-500 mb-1 block">渐变背景（CSS gradient）</span>
            <input placeholder="linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-xs"
              value={(bg.bg_gradient as string) ?? ''}
              onChange={e => onChange({ ...config, bg_gradient: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">边框颜色</span>
            <div className="flex items-center gap-2">
              <input type="color" value={(bg.border_color as string) || '#ffffff'}
                onChange={e => onChange({ ...config, border_color: e.target.value })}
                className="w-8 h-8 rounded border cursor-pointer" />
              <input type="text" value={(bg.border_color as string) ?? ''}
                onChange={e => onChange({ ...config, border_color: e.target.value })}
                className="flex-1 border rounded-lg px-2 py-1.5 text-sm font-mono" />
            </div>
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block">圆角</span>
            <input placeholder="16px" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={(bg.border_radius as string) ?? '16px'}
              onChange={e => onChange({ ...config, border_radius: e.target.value })} />
          </label>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">背景图片/GIF/视频（可选）</p>
          {bg.bg_media_url ? (
            <div className="flex items-center gap-2">
              <img src={bg.bg_media_url as string} alt="" className="w-16 h-10 rounded-lg object-cover border" />
              <button onClick={() => setPickerFor('bg')} className="text-xs text-blue-500 hover:underline">更换</button>
              <button onClick={() => onChange({ ...config, bg_media_id: null, bg_media_url: '', bg_media_type: '' })}
                className="text-xs text-red-400 hover:underline">删除</button>
            </div>
          ) : (
            <button onClick={() => setPickerFor('bg')}
              className="text-xs text-blue-500 border border-dashed border-blue-300 rounded-lg px-3 py-1 hover:bg-blue-50">
              + 选择背景媒体
            </button>
          )}
          <UploadHint recSize="1200 × 400 px" ratio="3:1" maxMB={8} formats="JPG · PNG · WEBP · GIF · MP4" note="图片会裁剪为卡片宽度" />
        </div>
      </div>

      {/* Login / Register buttons */}
      <div className="border rounded-xl p-4 space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">登录 / 注册按钮（未登录时显示）</h4>
        {([
          ['login_button',    loginBtn,    '登录按钮'] as const,
          ['register_button', registerBtn, '注册按钮'] as const,
        ] as const).map(([key, btn, label]) => (
          <div key={key} className="border rounded-lg p-3 space-y-2 bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">{label}</span>
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={(btn.enabled as boolean) !== false}
                  onChange={e => updateButton(key, { enabled: e.target.checked })} className="rounded" />
                显示
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="按钮文字" value={(btn.text as string) ?? ''}
                onChange={e => updateButton(key, { text: e.target.value })}
                className="border rounded-lg px-2 py-1.5 text-sm bg-white" />
              <input placeholder="跳转链接" value={(btn.url as string) ?? ''}
                onChange={e => updateButton(key, { url: e.target.value })}
                className="border rounded-lg px-2 py-1.5 text-sm bg-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">按钮图片/GIF（覆盖文字按钮）</p>
              {btn.media_url ? (
                <div className="flex items-center gap-2">
                  <img src={btn.media_url as string} alt="" className="h-10 rounded-lg object-cover border" />
                  <button onClick={() => setPickerFor(key)} className="text-xs text-blue-500 hover:underline">更换</button>
                  <button onClick={() => updateButton(key, { media_id: null, media_url: '', media_type: '' })}
                    className="text-xs text-red-400 hover:underline">删除</button>
                </div>
              ) : (
                <button onClick={() => setPickerFor(key)}
                  className="text-xs text-blue-500 border border-dashed border-blue-300 rounded-lg px-3 py-1 hover:bg-blue-50">
                  + 选择按钮图片
                </button>
              )}
              <UploadHint recSize="300 × 80 px" ratio="15:4" maxMB={2} formats="PNG · GIF · WEBP" note="透明背景 PNG 效果最佳" />
            </div>
          </div>
        ))}
      </div>

      {/* Deposit / Withdraw buttons */}
      <div className="border rounded-xl p-4 space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">存款 / 提款按钮（已登录时显示）</h4>
        {([
          ['deposit_button',  depositBtn,  '存款按钮'] as const,
          ['withdraw_button', withdrawBtn, '提款按钮'] as const,
        ] as const).map(([key, btn, label]) => (
          <div key={key} className="border rounded-lg p-3 space-y-2 bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">{label}</span>
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={(btn.enabled as boolean) !== false}
                  onChange={e => updateButton(key, { enabled: e.target.checked })} className="rounded" />
                显示
              </label>
            </div>
            <input placeholder={label} value={(btn.text as string) ?? ''}
              onChange={e => updateButton(key, { text: e.target.value })}
              className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white" />
            <div>
              <p className="text-xs text-gray-500 mb-1">按钮图片（可选）</p>
              {btn.media_url ? (
                <div className="flex items-center gap-2">
                  <img src={btn.media_url as string} alt="" className="h-10 rounded-lg object-cover border" />
                  <button onClick={() => setPickerFor(key)} className="text-xs text-blue-500 hover:underline">更换</button>
                  <button onClick={() => updateButton(key, { media_id: null, media_url: '', media_type: '' })}
                    className="text-xs text-red-400 hover:underline">删除</button>
                </div>
              ) : (
                <button onClick={() => setPickerFor(key)}
                  className="text-xs text-blue-500 border border-dashed border-blue-300 rounded-lg px-3 py-1 hover:bg-blue-50">
                  + 选择按钮图片
                </button>
              )}
              <UploadHint recSize="200 × 56 px" ratio="~16:4" maxMB={2} formats="PNG · GIF · WEBP" note="透明背景 PNG 效果最佳" />
            </div>
          </div>
        ))}
      </div>

      {/* Auto-refresh */}
      <div className="border rounded-xl p-4 space-y-2">
        <h4 className="text-sm font-semibold text-gray-700">自动刷新余额</h4>
        <label className="block">
          <span className="text-xs text-gray-500 mb-1 block">刷新间隔</span>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={(config.auto_refresh as number) ?? 0}
            onChange={e => onChange({ ...config, auto_refresh: parseInt(e.target.value, 10) })}
          >
            <option value={0}>关闭</option>
            <option value={10}>10 秒</option>
            <option value={20}>20 秒</option>
            <option value={30}>30 秒</option>
            <option value={60}>60 秒</option>
          </select>
        </label>
      </div>

      {pickerFor && (
        <MediaPicker
          mode="single"
          typeFilter={pickerFor === 'bg' ? ['IMAGE', 'GIF', 'VIDEO'] : ['IMAGE', 'GIF']}
          onSelect={media => {
            if (pickerFor === 'bg') handleBgMedia(media);
            else handleButtonMedia(pickerFor as ButtonKey, media);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}

function CustomHtmlEditor({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs text-gray-500 mb-1 block">标题（可选）</span>
        <input className="w-full border rounded-lg px-3 py-2 text-sm"
          value={(config.title as string) ?? ''}
          onChange={e => onChange({ ...config, title: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-xs text-gray-500 mb-1 block">HTML 内容</span>
        <textarea rows={8} className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-xs"
          value={(config.html as string) ?? ''}
          onChange={e => onChange({ ...config, html: e.target.value })} />
      </label>
    </div>
  );
}

// ─── Generic Editor (covers cta_card, announcement, jackpot, footer_banner, floating_button, notice_popup, game_lobby) ───

function GenericEditor({
  sectionType,
  config,
  onChange,
}: {
  sectionType: SectionType;
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const [pickerFor, setPickerFor] = useState<'desktop' | 'mobile' | null>(null);

  function handleMedia(field: 'desktop' | 'mobile', media: MediaRecord | MediaRecord[]) {
    const s = Array.isArray(media) ? media[0] : media;
    if (!s) return;
    onChange({
      ...config,
      [`${field}_media_id`]:   s.id,
      [`${field}_media_url`]:  `/api/public/media/${s.id}`,
      [`${field}_media_type`]: s.mediaType ?? 'IMAGE',
    });
    setPickerFor(null);
  }

  const showMedia      = ['cta_card', 'notice_popup', 'footer_banner'].includes(sectionType);
  const showText       = ['cta_card', 'announcement', 'notice_popup', 'game_lobby'].includes(sectionType);
  const showButton     = ['cta_card', 'announcement', 'notice_popup', 'floating_button'].includes(sectionType);
  const showColors     = ['cta_card', 'announcement', 'notice_popup', 'floating_button'].includes(sectionType);
  const showLink       = ['footer_banner', 'floating_button'].includes(sectionType);

  return (
    <div className="space-y-4">
      {/* Text fields */}
      {showText && (
        <div className="grid grid-cols-2 gap-3">
          {sectionType !== 'floating_button' && (
            <div className={sectionType === 'announcement' ? 'col-span-2' : ''}>
              <label className="block text-xs text-gray-500 mb-1">
                {sectionType === 'announcement' ? '公告内容' : '标题'}
              </label>
              <input
                className="w-full border rounded-xl px-3 py-2 text-sm"
                value={(config.title as string) ?? (config.text as string) ?? ''}
                onChange={e => onChange({
                  ...config,
                  ...(sectionType === 'announcement' ? { text: e.target.value } : { title: e.target.value }),
                })}
              />
            </div>
          )}
          {['cta_card', 'notice_popup'].includes(sectionType) && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">副标题 / 内容</label>
              <input
                className="w-full border rounded-xl px-3 py-2 text-sm"
                value={(config.subtitle as string) ?? (config.content as string) ?? ''}
                onChange={e => onChange({
                  ...config,
                  ...(sectionType === 'notice_popup' ? { content: e.target.value } : { subtitle: e.target.value }),
                })}
              />
            </div>
          )}
          {sectionType === 'floating_button' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">按钮文字</label>
                <input className="w-full border rounded-xl px-3 py-2 text-sm"
                  value={(config.text as string) ?? ''}
                  onChange={e => onChange({ ...config, text: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">图标 (emoji)</label>
                <input className="w-full border rounded-xl px-3 py-2 text-sm"
                  value={(config.icon as string) ?? ''}
                  onChange={e => onChange({ ...config, icon: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">位置</label>
                <select className="w-full border rounded-xl px-3 py-2 text-sm"
                  value={(config.position as string) ?? 'bottom-right'}
                  onChange={e => onChange({ ...config, position: e.target.value })}>
                  <option value="bottom-right">右下角</option>
                  <option value="bottom-left">左下角</option>
                </select>
              </div>
            </>
          )}
          {sectionType === 'game_lobby' && (
            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer pt-5">
                <input type="checkbox"
                  checked={(config.show_provider_filter as boolean) !== false}
                  onChange={e => onChange({ ...config, show_provider_filter: e.target.checked })}
                  className="rounded" />
                显示游戏平台筛选栏
              </label>
            </div>
          )}
        </div>
      )}

      {/* Media pickers */}
      {showMedia && (() => {
        const mediaHintMap: Record<string, { desktop: { size: string; ratio: string }; mobile: { size: string; ratio: string } }> = {
          cta_card:     { desktop: { size: '1200 × 400 px', ratio: '3:1' },    mobile: { size: '750 × 400 px', ratio: '15:8' } },
          notice_popup: { desktop: { size: '600 × 400 px',  ratio: '3:2' },    mobile: { size: '480 × 320 px', ratio: '3:2' } },
          footer_banner:{ desktop: { size: '1920 × 200 px', ratio: '~10:1' },  mobile: { size: '750 × 200 px', ratio: '15:4' } },
        };
        const hints = mediaHintMap[sectionType] ?? { desktop: { size: '1200 × 400 px', ratio: '' }, mobile: { size: '750 × 400 px', ratio: '' } };
        return (
          <div className="grid grid-cols-2 gap-3">
            {(['desktop', 'mobile'] as const).map(field => {
              const url  = (config[`${field}_media_url`] as string) ?? '';
              const type = (config[`${field}_media_type`] as string) ?? '';
              const isVid = type === 'VIDEO';
              const hint = hints[field];
              return (
                <div key={field}>
                  <p className="text-xs text-gray-500 mb-1">
                    {field === 'desktop' ? '桌面端媒体' : '手机端媒体'}
                  </p>
                  {url ? (
                    <div className="relative rounded-lg overflow-hidden border bg-black" style={{ height: 80 }}>
                      {isVid
                        ? <video src={url} className="w-full h-full object-cover opacity-80" muted />
                        : <img src={url} alt="" className="w-full h-full object-cover" />}
                      <div className="absolute inset-0 flex items-end justify-between p-1.5 bg-gradient-to-t from-black/40">
                        <button onClick={() => setPickerFor(field)} className="text-[10px] text-white bg-black/50 rounded px-1.5 py-0.5">更换</button>
                        <button onClick={() => onChange({ ...config, [`${field}_media_id`]: null, [`${field}_media_url`]: '', [`${field}_media_type`]: '' })}
                          className="text-[10px] text-white bg-red-500/70 rounded px-1.5 py-0.5">删除</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setPickerFor(field)}
                      className="w-full border-2 border-dashed rounded-lg flex items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 bg-gray-50 transition-colors"
                      style={{ height: 80 }}>
                      <span className="text-xs">+ 选择媒体</span>
                    </button>
                  )}
                  <UploadHint recSize={hint.size} ratio={hint.ratio} maxMB={sectionType === 'footer_banner' ? 5 : 8} formats="JPG · PNG · WEBP · GIF · MP4" />
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Button fields */}
      {showButton && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">按钮文字</label>
            <input className="w-full border rounded-xl px-3 py-2 text-sm"
              value={(config.button_text as string) ?? ''}
              onChange={e => onChange({ ...config, button_text: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">按钮链接</label>
            <input className="w-full border rounded-xl px-3 py-2 text-sm"
              value={(config.button_url as string) ?? (config.link_url as string) ?? ''}
              onChange={e => onChange({
                ...config,
                ...(sectionType === 'cta_card' ? { link_url: e.target.value } : { button_url: e.target.value }),
              })} />
          </div>
          {sectionType === 'notice_popup' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">弹窗频率</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm"
                value={(config.frequency as string) ?? 'session'}
                onChange={e => onChange({ ...config, frequency: e.target.value })}>
                <option value="always">每次访问</option>
                <option value="session">每个会话</option>
                <option value="once">只显示一次</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Link for footer_banner and floating_button */}
      {showLink && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">跳转链接</label>
          <input className="w-full border rounded-xl px-3 py-2 text-sm"
            value={(config.link_url as string) ?? ''}
            onChange={e => onChange({ ...config, link_url: e.target.value })} />
        </div>
      )}

      {/* Colors */}
      {showColors && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">背景颜色</label>
            <div className="flex items-center gap-2">
              <input type="color" value={(config.bg_color as string) || '#1e293b'}
                onChange={e => onChange({ ...config, bg_color: e.target.value })}
                className="w-8 h-8 rounded border cursor-pointer flex-shrink-0" />
              <input type="text" className="flex-1 border rounded-xl px-2 py-1.5 text-sm font-mono"
                value={(config.bg_color as string) ?? ''}
                onChange={e => onChange({ ...config, bg_color: e.target.value })}
                placeholder="透明" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">文字颜色</label>
            <div className="flex items-center gap-2">
              <input type="color" value={(config.text_color as string) || '#ffffff'}
                onChange={e => onChange({ ...config, text_color: e.target.value })}
                className="w-8 h-8 rounded border cursor-pointer flex-shrink-0" />
              <input type="text" className="flex-1 border rounded-xl px-2 py-1.5 text-sm font-mono"
                value={(config.text_color as string) ?? ''}
                onChange={e => onChange({ ...config, text_color: e.target.value })}
                placeholder="默认" />
            </div>
          </div>
        </div>
      )}

      {/* Announcement: icon */}
      {sectionType === 'announcement' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">前置图标 (emoji)</label>
          <input className="w-full border rounded-xl px-3 py-2 text-sm"
            value={(config.icon as string) ?? ''}
            onChange={e => onChange({ ...config, icon: e.target.value })} />
        </div>
      )}

      {/* CTA card: align */}
      {sectionType === 'cta_card' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">对齐方式</label>
          <select className="w-full border rounded-xl px-3 py-2 text-sm"
            value={(config.align as string) ?? 'center'}
            onChange={e => onChange({ ...config, align: e.target.value })}>
            <option value="left">居左</option>
            <option value="center">居中</option>
            <option value="right">居右</option>
          </select>
        </div>
      )}

      {pickerFor && (
        <MediaPicker
          onSelect={m => handleMedia(pickerFor, m)}
          onClose={() => setPickerFor(null)}
          typeFilter={['IMAGE', 'GIF', 'VIDEO']}
        />
      )}
    </div>
  );
}

// ─── Config Editor Router ──────────────────────────────────────────────────────

function ConfigEditor({
  sectionType,
  config,
  onChange,
}: {
  sectionType: SectionType;
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  switch (sectionType) {
    case 'hero':        return <HeroEditor config={config} onChange={onChange} />;
    case 'marquee':     return <MarqueeEditor config={config} onChange={onChange} />;
    case 'quick_menu':  return <QuickMenuEditor config={config} onChange={onChange} />;
    case 'promotions':  return <PromotionsEditor config={config} onChange={onChange} />;
    case 'providers':   return <ProvidersEditor config={config} onChange={onChange} />;
    case 'live_tx':     return <LiveTxEditor config={config} onChange={onChange} />;
    case 'jackpot':     return <JackpotEditor config={config} onChange={onChange} />;
    case 'game_lobby':  return <GameLobbyEditor config={config} onChange={onChange} />;
    case 'member_zone': return <MemberZoneEditor config={config} onChange={onChange} />;
    case 'custom_html': return <CustomHtmlEditor config={config} onChange={onChange} />;
    case 'notice_popup': return <PopupSliderEditor config={config} onChange={onChange} />;
    default:
      return <GenericEditor sectionType={sectionType} config={config} onChange={onChange} />;
  }
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({
  section,
  onSave,
  onClose,
}: {
  section: HomepageSection;
  onSave: (updated: Partial<HomepageSection>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(section.name);
  const [config, setConfig] = useState(section.config);
  const [startAt, setStartAt] = useState(section.start_at ? section.start_at.slice(0, 16) : '');
  const [endAt, setEndAt] = useState(section.end_at ? section.end_at.slice(0, 16) : '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      name,
      config,
      start_at: startAt ? new Date(startAt).toISOString() : null,
      end_at:   endAt   ? new Date(endAt).toISOString()   : null,
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8">
      <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-base font-semibold text-gray-900">编辑区块</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {SECTION_TYPE_LABELS[section.section_type] ?? section.section_type}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <label className="block">
            <span className="text-xs text-gray-500 mb-1 block font-medium">区块名称</span>
            <input className="w-full border rounded-xl px-3 py-2 text-sm"
              value={name} onChange={e => setName(e.target.value)} />
          </label>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block font-medium">开始时间（可选）</span>
              <input type="datetime-local" className="w-full border rounded-xl px-3 py-2 text-sm"
                value={startAt} onChange={e => setStartAt(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 mb-1 block font-medium">结束时间（可选）</span>
              <input type="datetime-local" className="w-full border rounded-xl px-3 py-2 text-sm"
                value={endAt} onChange={e => setEndAt(e.target.value)} />
            </label>
          </div>

          {/* Type-specific config */}
          <div className="border-t pt-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">内容设置</h3>
            <ConfigEditor
              sectionType={section.section_type}
              config={config}
              onChange={setConfig}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border rounded-xl hover:bg-gray-100">
            取消
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? '保存中…' : '保存更改'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Widget Library Modal ─────────────────────────────────────────────────────

const CAT_TABS: Array<{ key: WidgetCategory | 'all' | 'favorites' | 'recent'; label: string; icon: string }> = [
  { key: 'all',       label: '全部',  icon: '⬛' },
  { key: 'favorites', label: '收藏',  icon: '⭐' },
  { key: 'recent',    label: '最近',  icon: '🕐' },
  { key: 'hero',      label: '横幅',  icon: '🖼' },
  { key: 'promotion', label: '优惠',  icon: '🎁' },
  { key: 'member',    label: '会员',  icon: '👤' },
  { key: 'game',      label: '游戏',  icon: '🎮' },
  { key: 'support',   label: '客服',  icon: '🔔' },
  { key: 'marketing', label: '营销',  icon: '📢' },
  { key: 'media',     label: '媒体',  icon: '🔧' },
  { key: 'layout',    label: '布局',  icon: '⬜' },
];

function readLocalJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}

function WidgetLibraryModal({
  onAdd,
  onClose,
}: {
  onAdd: (type: SectionType, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [search,   setSearch]   = useState('');
  const [cat,      setCat]      = useState<typeof CAT_TABS[number]['key']>('all');
  const [adding,   setAdding]   = useState<SectionType | null>(null);
  const [favs,     setFavs]     = useState<Set<string>>(() => new Set(readLocalJson<string[]>('wb_favorites', [])));
  const [recent,   setRecent]   = useState<string[]>(() => readLocalJson<string[]>('wb_recent', []));

  function toggleFav(type: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(favs);
    next.has(type) ? next.delete(type) : next.add(type);
    setFavs(next);
    localStorage.setItem('wb_favorites', JSON.stringify([...next]));
  }

  async function handleAdd(w: WidgetDef) {
    if (adding) return;
    setAdding(w.type);
    try {
      await onAdd(w.type, w.label);
      const next = [w.type, ...recent.filter(t => t !== w.type)].slice(0, 8);
      setRecent(next);
      localStorage.setItem('wb_recent', JSON.stringify(next));
    } finally {
      setAdding(null);
    }
  }

  const visible = WIDGET_CATALOG.filter(w => {
    if (search) {
      const q = search.toLowerCase();
      return w.label.includes(q) || w.description.includes(q) || w.type.includes(q);
    }
    if (cat === 'favorites') return favs.has(w.type);
    if (cat === 'recent')    return recent.includes(w.type);
    if (cat !== 'all')       return w.category === cat;
    return true;
  }).sort((a, b) =>
    cat === 'recent' ? recent.indexOf(a.type) - recent.indexOf(b.type) : 0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col" style={{ height: '82vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b shrink-0">
          <h2 className="text-base font-bold text-gray-900 flex-1">Widget 库</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setCat('all'); }}
              placeholder="搜索 Widget…"
              className="border rounded-lg pl-8 pr-3 py-1.5 text-sm w-52 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
              autoFocus
            />
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* Sidebar */}
          <div className="w-28 border-r shrink-0 overflow-y-auto py-2">
            {CAT_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setCat(tab.key); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left transition-colors ${
                  cat === tab.key
                    ? 'bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-500'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-sm">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Widget Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                <span className="text-4xl">📭</span>
                <p className="text-sm">
                  {cat === 'favorites' ? '暂无收藏，鼠标悬停 Widget 可点击 ☆ 收藏' :
                   cat === 'recent'    ? '暂无最近使用记录' :
                   '未找到相关 Widget'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {visible.map(w => {
                  const catDef = WIDGET_CATEGORIES[w.category];
                  const isThis = adding === w.type;
                  const isFav  = favs.has(w.type);
                  return (
                    <div
                      key={w.type}
                      onClick={() => { if (!adding) void handleAdd(w); }}
                      className={`relative rounded-xl border p-4 cursor-pointer transition-all group select-none ${
                        isThis
                          ? 'border-blue-400 bg-blue-50 shadow-md'
                          : adding
                            ? 'opacity-50 cursor-not-allowed border-gray-200 bg-white'
                            : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md hover:bg-blue-50/20'
                      }`}
                    >
                      {/* Favorite star — visible on hover */}
                      <button
                        onClick={e => toggleFav(w.type, e)}
                        className={`absolute top-3 right-3 text-base transition-opacity ${
                          isFav ? 'opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                        }`}
                        title={isFav ? '取消收藏' : '收藏'}
                      >
                        {isFav ? '⭐' : '☆'}
                      </button>

                      {/* Icon thumbnail */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl mb-3 ${catDef.color}`}>
                        {w.icon}
                      </div>

                      {/* Name */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-semibold text-sm text-gray-900">{w.label}</span>
                        {w.isNew && (
                          <span className="text-[9px] font-bold bg-green-500 text-white px-1.5 py-0.5 rounded-full leading-none">NEW</span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{w.description}</p>

                      {/* Category badge */}
                      <div className={`mt-2.5 inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full ${catDef.color}`}>
                        {catDef.label}
                      </div>

                      {/* Loading overlay */}
                      {isThis && (
                        <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-white/60">
                          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t shrink-0 text-xs text-gray-400 bg-gray-50 rounded-b-2xl">
          点击 Widget 即可添加 · 鼠标悬停可收藏 ⭐ · 已添加的 Widget 可在列表中 Drag 排序
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const MAX_HISTORY = 20;

export default function WebsiteBuilderPage() {
  const [sections, setSections]     = useState<HomepageSection[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editingSection, setEditing] = useState<HomepageSection | null>(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [toast, setToast]           = useState('');
  const [toastError, setToastError] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [dragIdx, setDragIdx]       = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Undo/Redo history
  const historyRef  = useRef<HomepageSection[][]>([]);
  const futureRef   = useRef<HomepageSection[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function pushHistory(prev: HomepageSection[]) {
    historyRef.current = [...historyRef.current, prev].slice(-MAX_HISTORY);
    futureRef.current  = [];
    setCanUndo(true);
    setCanRedo(false);
  }

  function setSectionsWithHistory(next: HomepageSection[], prev: HomepageSection[]) {
    pushHistory(prev);
    setSections(next);
  }

  function undo() {
    if (!historyRef.current.length) return;
    const prev = historyRef.current.at(-1)!;
    historyRef.current = historyRef.current.slice(0, -1);
    futureRef.current  = [sections, ...futureRef.current].slice(0, MAX_HISTORY);
    setSections(prev);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
    showToast('↩ 撤销');
  }

  function redo() {
    if (!futureRef.current.length) return;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    historyRef.current = [...historyRef.current, sections].slice(-MAX_HISTORY);
    setSections(next);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
    showToast('↪ 重做');
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/website/homepage-sections');
      if (res.ok) {
        setSections(await res.json() as HomepageSection[]);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        showError(data.error ?? '无法加载区块列表');
      }
    } catch {
      showError('网络错误，无法连接服务器');
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  function showToast(msg: string) {
    setToastError(false);
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function showError(msg: string) {
    setToastError(true);
    setToast(msg);
    setTimeout(() => setToast(''), 5000);
  }

  async function apiErrorMsg(res: Response): Promise<string> {
    try {
      const data = await res.json() as { error?: string };
      return data.error ?? `服务器错误 (${res.status})`;
    } catch {
      return `服务器错误 (${res.status})`;
    }
  }

  async function toggleSection(section: HomepageSection) {
    try {
      const res = await fetch(`/api/website/homepage-sections/${section.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !section.is_enabled }),
      });
      if (!res.ok) { showError(await apiErrorMsg(res)); return; }
      const next = sections.map(s => s.id === section.id ? { ...s, is_enabled: !s.is_enabled } : s);
      setSectionsWithHistory(next, sections);
      showToast(section.is_enabled ? '已隐藏' : '已显示');
    } catch {
      showError('网络错误，无法切换显示状态');
    }
  }

  async function moveSection(idx: number, dir: 'up' | 'down') {
    const next = [...sections];
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    const ordered = next.map((s, i) => ({ ...s, display_order: i * 10 }));
    setSectionsWithHistory(ordered, sections);
    try {
      const res = await fetch('/api/website/homepage-sections/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: ordered.map(s => ({ id: s.id, display_order: s.display_order })) }),
      });
      if (!res.ok) { showError(await apiErrorMsg(res)); return; }
      showToast('顺序已更新');
    } catch {
      showError('网络错误，无法保存顺序');
    }
  }

  async function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null); setDragOverIdx(null); return;
    }
    const next = [...sections];
    const [item] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, item);
    const ordered = next.map((s, i) => ({ ...s, display_order: i * 10 }));
    setSectionsWithHistory(ordered, sections);
    setDragIdx(null); setDragOverIdx(null);
    try {
      const res = await fetch('/api/website/homepage-sections/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: ordered.map(s => ({ id: s.id, display_order: s.display_order })) }),
      });
      if (!res.ok) { showError(await apiErrorMsg(res)); return; }
      showToast('顺序已更新');
    } catch {
      showError('网络错误，无法保存顺序');
    }
  }

  async function saveSection(id: number, patch: Partial<HomepageSection>) {
    try {
      const res = await fetch(`/api/website/homepage-sections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) { showError(await apiErrorMsg(res)); return; }
      const updated = await res.json() as HomepageSection;
      const next = sections.map(s => s.id === id ? updated : s);
      setSectionsWithHistory(next, sections);
      setEditing(null);
      showToast('保存成功');
    } catch {
      showError('网络错误，无法保存区块');
    }
  }

  async function deleteSection(id: number) {
    try {
      const res = await fetch(`/api/website/homepage-sections/${id}`, { method: 'DELETE' });
      if (!res.ok) { showError(await apiErrorMsg(res)); return; }
      const next = sections.filter(s => s.id !== id);
      setSectionsWithHistory(next, sections);
      setDeleteConfirm(null);
      showToast('已删除');
    } catch {
      showError('网络错误，无法删除区块');
    }
  }

  async function duplicateSection(section: HomepageSection) {
    const display_order = section.display_order + 1;
    try {
      const res = await fetch('/api/website/homepage-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section_type: section.section_type,
          name:         `${section.name} (副本)`,
          config:       section.config,
          display_order,
        }),
      });
      if (!res.ok) { showError(await apiErrorMsg(res)); return; }
      const created = await res.json() as HomepageSection;
      const idx = sections.findIndex(s => s.id === section.id);
      const next = [...sections.slice(0, idx + 1), created, ...sections.slice(idx + 1)];
      setSectionsWithHistory(next, sections);
      showToast('已复制');
    } catch {
      showError('网络错误，无法复制区块');
    }
  }

  async function addSection(type: SectionType, name: string) {
    const config = DEFAULT_CONFIGS[type] ?? {};
    const display_order = (sections.at(-1)?.display_order ?? 0) + 10;
    const res = await fetch('/api/website/homepage-sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section_type: type, name, config, display_order }),
    });
    if (!res.ok) {
      const msg = await apiErrorMsg(res);
      showError(msg);
      throw new Error(msg);
    }
    const created = await res.json() as HomepageSection;
    const next = [...sections, created];
    setSectionsWithHistory(next, sections);
    setShowAdd(false);
    showToast('添加成功');
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Website Builder</h1>
          <p className="text-sm text-gray-500 mt-0.5">管理网站首页区块，所有更改实时生效</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-2 rounded-xl border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title="撤销 (Ctrl+Z)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2 rounded-xl border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title="重做 (Ctrl+Y)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/>
            </svg>
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-blue-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700 font-medium"
          >
            <Plus className="w-4 h-4" /> 添加区块
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex gap-2">
        <span className="flex-shrink-0 mt-0.5">ℹ️</span>
        <span>拖拽排序 · 点击眼睛显示/隐藏 · 点击编辑修改内容 · Ctrl+Z 撤销 · Ctrl+Y 重做</span>
      </div>

      {/* Section List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-2xl">
          <p className="text-gray-400 text-sm mb-3">暂无区块</p>
          <button onClick={() => setShowAdd(true)}
            className="text-blue-600 text-sm hover:underline">
            + 添加第一个区块
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sections.map((section, idx) => (
            <SectionCard
              key={section.id}
              section={section}
              index={idx}
              total={sections.length}
              onToggle={() => toggleSection(section)}
              onEdit={() => setEditing(section)}
              onDelete={() => setDeleteConfirm(section.id)}
              onDuplicate={() => duplicateSection(section)}
              onMove={dir => moveSection(idx, dir)}
              isDragging={dragIdx === idx}
              isDragOver={dragOverIdx === idx}
              onDragStart={() => setDragIdx(idx)}
              onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {editingSection && (
        <EditModal
          section={editingSection}
          onSave={patch => saveSection(editingSection.id, patch)}
          onClose={() => setEditing(null)}
        />
      )}

      {showAdd && (
        <WidgetLibraryModal
          onAdd={addSection}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              <h3 className="text-base font-semibold">确认删除</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">删除后无法恢复，确认删除此区块？</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm border rounded-xl hover:bg-gray-100">
                取消
              </button>
              <button onClick={() => deleteSection(deleteConfirm)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-white text-sm px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 max-w-sm text-center ${toastError ? 'bg-red-600' : 'bg-gray-900'}`}>
          {toastError ? '✕' : '✓'} {toast}
        </div>
      )}
    </div>
  );
}
