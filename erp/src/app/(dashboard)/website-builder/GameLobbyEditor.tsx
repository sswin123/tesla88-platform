'use client';

import { useState, useEffect } from 'react';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameLobbyConfig {
  game_source?: 'platform' | 'games' | 'mixed';
  design_preset?: string;
  layout_preset?: string;

  tabs_enabled?: boolean;
  tab_style?: string;
  tab_icon_mode?: string;
  tab_position?: string;
  tab_sticky?: boolean;
  tab_scroll?: string;
  tab_animation?: string;

  show_provider_filter?: boolean;
  provider_source?: string;
  provider_style?: string;
  provider_display?: string;
  provider_size?: string;
  provider_hover?: string;

  card_style?: string;
  card_image_mode?: string;
  card_ratio?: string;
  card_radius?: string;
  card_shadow?: string;
  card_border?: string;
  card_hover?: string;

  show_provider?: boolean;
  show_game_name?: boolean;
  show_hot_badge?: boolean;
  show_new_badge?: boolean;
  show_play_button?: boolean;
  show_demo_button?: boolean;
  button_style?: string;

  search_enabled?: boolean;
  search_style?: string;
  search_placeholder?: string;

  default_sort?: string;
  pagination_type?: string;

  card_animation?: string;
  scroll_animation?: boolean;

  color_bg?: string;
  color_card?: string;
  color_tab?: string;
  color_tab_active?: string;
  color_tab_inactive?: string;
  color_button?: string;
  color_border?: string;
  color_text?: string;
  color_accent?: string;

  font?: string;
  font_weight?: string;

  columns_desktop?: number;
  columns_tablet?: number;
  columns_mobile?: number;

  card_gap?: string;
  section_padding?: string;
  container_width?: string;

  // Icon display
  icon_size?:      string;
  icon_shape?:     string;
  icon_animation?: string;
  icon_position?:  string;
  icon_gap?:       string;
  icon_hover?:     string;
}

// ─── Design Presets ───────────────────────────────────────────────────────────

const DESIGN_PRESETS: Record<string, Partial<GameLobbyConfig>> = {
  classic_casino: {
    card_style: 'classic', tab_style: 'rounded', card_hover: 'lift',
    card_shadow: 'medium', card_border: 'solid', card_ratio: '3:4',
    card_animation: 'fade', show_game_name: true, show_hot_badge: true, show_new_badge: true,
    show_play_button: true, button_style: 'rounded',
    columns_desktop: 5, columns_tablet: 3, columns_mobile: 2,
    card_gap: '10px', provider_style: 'horizontal', provider_display: 'logo_text',
  },
  modern: {
    card_style: 'modern', tab_style: 'pill', card_hover: 'zoom',
    card_shadow: 'soft', card_border: 'none', card_ratio: '3:4',
    card_animation: 'slide', show_game_name: true, show_hot_badge: true,
    show_play_button: true, button_style: 'rounded',
    columns_desktop: 5, columns_tablet: 4, columns_mobile: 3,
    card_gap: '12px', provider_style: 'pill', provider_display: 'logo_text',
  },
  luxury_gold: {
    card_style: 'luxury', tab_style: 'capsule', card_hover: 'glow',
    card_shadow: 'glow', card_border: 'gradient', card_ratio: '3:4',
    color_accent: '#ffd700', color_bg: '#0a0800', color_tab_active: '#ffd700',
    card_animation: 'scale', show_game_name: true, show_hot_badge: true, show_new_badge: true,
    show_play_button: true, button_style: 'gradient',
    columns_desktop: 5, columns_tablet: 3, columns_mobile: 2,
    card_gap: '12px', provider_style: 'horizontal', provider_display: 'logo',
  },
  cyber_neon: {
    card_style: 'neon', tab_style: 'neon', card_hover: 'glow',
    card_shadow: 'glow', card_border: 'glow', card_ratio: '3:4',
    color_accent: '#00ffff', font: 'orbitron',
    card_animation: 'scale', show_game_name: true, show_hot_badge: true,
    show_play_button: true, button_style: 'neon',
    columns_desktop: 5, columns_tablet: 4, columns_mobile: 2,
    card_gap: '10px', provider_style: 'chip', provider_display: 'text',
  },
  glass_style: {
    card_style: 'glass', tab_style: 'glass', card_hover: 'lift',
    card_shadow: 'soft', card_border: 'solid', card_ratio: '3:4',
    card_animation: 'fade', show_game_name: true, show_hot_badge: true,
    show_play_button: true, button_style: 'glass',
    columns_desktop: 5, columns_tablet: 4, columns_mobile: 3,
    card_gap: '12px', provider_style: 'horizontal', provider_display: 'logo_text',
  },
  minimal: {
    card_style: 'minimal', tab_style: 'underline', card_hover: 'lift',
    card_shadow: 'none', card_border: 'none', card_ratio: '1:1',
    card_animation: 'fade', show_game_name: true, show_hot_badge: false, show_play_button: false,
    columns_desktop: 6, columns_tablet: 4, columns_mobile: 3,
    card_gap: '8px', provider_style: 'dropdown', provider_display: 'text',
  },
  vip: {
    card_style: 'luxury', tab_style: 'segment', card_hover: 'glow',
    card_shadow: 'heavy', card_border: 'gradient', card_ratio: '3:4',
    color_accent: '#c0a060', color_bg: '#05030a', color_tab_active: '#c0a060',
    font: 'montserrat', card_animation: 'fade',
    show_game_name: true, show_hot_badge: true, show_new_badge: true,
    show_play_button: true, show_demo_button: true, button_style: 'gradient',
    columns_desktop: 4, columns_tablet: 3, columns_mobile: 2,
    card_gap: '16px', provider_style: 'horizontal', provider_display: 'logo',
  },
  dark_purple: {
    card_style: 'cyber', tab_style: 'segment', card_hover: 'glow',
    card_shadow: 'glow', card_border: 'glow', card_ratio: '3:4',
    color_accent: '#9333ea',
    card_animation: 'slide', show_game_name: true, show_hot_badge: true,
    show_play_button: true, button_style: 'neon',
    columns_desktop: 5, columns_tablet: 3, columns_mobile: 2,
    card_gap: '10px', provider_style: 'pill', provider_display: 'logo_text',
  },
  black_gold: {
    card_style: 'luxury', tab_style: 'capsule', card_hover: 'glow',
    card_shadow: 'heavy', card_border: 'gradient', card_ratio: '3:4',
    color_accent: '#f59e0b', color_bg: '#050505', color_tab_active: '#f59e0b',
    card_animation: 'scale', show_game_name: true, show_hot_badge: true,
    show_play_button: true, button_style: 'gradient',
    columns_desktop: 5, columns_tablet: 3, columns_mobile: 2,
    card_gap: '12px', provider_style: 'horizontal', provider_display: 'logo',
  },
  blue_tech: {
    card_style: 'neon', tab_style: 'neon', card_hover: 'glow',
    card_shadow: 'glow', card_border: 'glow', card_ratio: '3:4',
    color_accent: '#3b82f6', font: 'poppins',
    card_animation: 'slide', show_game_name: true, show_hot_badge: true,
    show_play_button: true, button_style: 'neon',
    columns_desktop: 5, columns_tablet: 4, columns_mobile: 3,
    card_gap: '10px', provider_style: 'chip', provider_display: 'logo_text',
  },
};

const PRESET_LABELS: Record<string, { label: string; icon: string }> = {
  classic_casino: { label: 'Classic Casino', icon: '🎰' },
  modern:         { label: 'Modern',         icon: '🌟' },
  luxury_gold:    { label: 'Luxury Gold',    icon: '👑' },
  cyber_neon:     { label: 'Cyber Neon',     icon: '⚡' },
  glass_style:    { label: 'Glass',          icon: '💎' },
  minimal:        { label: 'Minimal',        icon: '◻️' },
  vip:            { label: 'VIP',            icon: '🔱' },
  dark_purple:    { label: 'Dark Purple',    icon: '🔮' },
  black_gold:     { label: 'Black Gold',     icon: '🖤' },
  blue_tech:      { label: 'Blue Tech',      icon: '🔵' },
};

// ─── Shared UI Primitives ─────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-500 mb-1">{children}</p>;
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-1">
      <span className="text-xs text-gray-600">{label}</span>
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-gray-300'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </label>
  );
}

function ButtonGrid<T extends string>({ options, value, onChange, cols = 3 }: {
  options: { v: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`py-1 px-2 text-xs rounded border transition-colors text-center ${
            value === o.v
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-600 flex-1">{label}</span>
      <div className="flex items-center gap-1.5">
        <input type="color" value={value || '#000000'}
          onChange={e => onChange(e.target.value)}
          className="w-6 h-6 rounded border cursor-pointer" />
        <input type="text" value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder="var(--brand-primary)"
          className="w-28 border rounded px-1.5 py-0.5 text-xs font-mono" />
        {value && (
          <button onClick={() => onChange('')} className="text-xs text-gray-400 hover:text-red-400">✕</button>
        )}
      </div>
    </div>
  );
}

function ColSelect({ label, value, options, onChange }: {
  label: string;
  value: number;
  options: number[];
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-1">
        {options.map(n => (
          <button key={n} onClick={() => onChange(n)}
            className={`flex-1 py-1 text-xs rounded border transition-colors font-mono ${
              value === n
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'
            }`}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Category Icon Editor ─────────────────────────────────────────────────────

type IconType = 'none' | 'emoji' | 'image' | 'gif' | 'svg';

interface CategoryIconState {
  icon_type:     IconType;
  icon_emoji:    string;
  icon_media_id: number | null;
  icon_svg:      string;
  saving:        boolean;
  saved:         boolean;
}

interface ERPCategory {
  id:            number;
  category_code: string;
  category_name: string;
  icon_type:     IconType;
  icon_emoji:    string | null;
  icon_media_id: number | null;
  icon_svg:      string | null;
}

function CategoryIconEditor() {
  const [categories, setCategories] = useState<ERPCategory[]>([]);
  const [icons, setIcons]           = useState<Record<number, CategoryIconState>>({});
  const [mediaPicker, setMediaPicker] = useState<number | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    fetch('/api/website/lobby-categories')
      .then(r => r.ok ? r.json() : Promise.resolve([]))
      .then((cats: ERPCategory[]) => {
        setCategories(cats);
        const init: Record<number, CategoryIconState> = {};
        for (const c of cats) {
          init[c.id] = {
            icon_type:     c.icon_type  ?? 'none',
            icon_emoji:    c.icon_emoji ?? '',
            icon_media_id: c.icon_media_id ?? null,
            icon_svg:      c.icon_svg   ?? '',
            saving: false,
            saved:  false,
          };
        }
        setIcons(init);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = (catId: number, patch: Partial<CategoryIconState>) => {
    setIcons(prev => ({ ...prev, [catId]: { ...prev[catId], ...patch } }));
  };

  const save = async (catId: number) => {
    const s = icons[catId];
    update(catId, { saving: true, saved: false });
    try {
      const body = {
        icon_type:     s.icon_type,
        icon_emoji:    s.icon_type === 'emoji' ? s.icon_emoji || null : null,
        icon_media_id: (s.icon_type === 'image' || s.icon_type === 'gif') ? s.icon_media_id : null,
        icon_svg:      s.icon_type === 'svg'   ? s.icon_svg   || null : null,
      };
      const res = await fetch(`/api/website/lobby-categories/${catId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        update(catId, { saving: false, saved: true });
        setTimeout(() => update(catId, { saved: false }), 2000);
      } else {
        update(catId, { saving: false });
        alert('保存失败');
      }
    } catch {
      update(catId, { saving: false });
      alert('保存失败');
    }
  };

  if (loading) return <p className="text-xs text-gray-400 py-4 text-center">加载中...</p>;
  if (categories.length === 0) return (
    <p className="text-xs text-gray-400 py-4 text-center">
      暂无分类。请先在 <a href="/website-lobby-categories" target="_blank" className="text-blue-500 hover:underline">Lobby Categories</a> 添加分类。
    </p>
  );

  return (
    <div className="space-y-4">
      {categories.map(cat => {
        const s = icons[cat.id];
        if (!s) return null;
        return (
          <div key={cat.id} className="border rounded-lg p-3 bg-white space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">
                {cat.category_name}
                <span className="ml-1 text-gray-400 font-normal">({cat.category_code})</span>
              </span>
              <button
                onClick={() => save(cat.id)}
                disabled={s.saving}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  s.saved  ? 'bg-green-500 text-white' :
                  s.saving ? 'bg-gray-300 text-gray-500' :
                             'bg-blue-500 text-white hover:bg-blue-600'
                }`}>
                {s.saved ? '已保存 ✓' : s.saving ? '保存中...' : '保存'}
              </button>
            </div>

            {/* Icon type */}
            <div>
              <p className="text-xs text-gray-400 mb-1">图标类型</p>
              <div className="flex gap-1">
                {(['none', 'emoji', 'image', 'gif', 'svg'] as IconType[]).map(t => (
                  <button key={t} onClick={() => update(cat.id, { icon_type: t })}
                    className={`flex-1 py-0.5 text-xs rounded border transition-colors ${
                      s.icon_type === t
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'
                    }`}>
                    {t === 'none' ? '无' : t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Emoji input */}
            {s.icon_type === 'emoji' && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Emoji 字符</p>
                <input
                  type="text"
                  value={s.icon_emoji}
                  onChange={e => update(cat.id, { icon_emoji: e.target.value })}
                  placeholder="输入 Emoji，如 🎮"
                  className="w-full border rounded px-2 py-1 text-sm bg-white"
                  maxLength={4}
                />
              </div>
            )}

            {/* Image/GIF picker */}
            {(s.icon_type === 'image' || s.icon_type === 'gif') && (
              <div>
                <p className="text-xs text-gray-400 mb-1">选择媒体</p>
                <div className="flex items-center gap-2">
                  {s.icon_media_id && (
                    <img
                      src={`/api/public/media/${s.icon_media_id}`}
                      alt=""
                      className="w-8 h-8 object-contain rounded border"
                    />
                  )}
                  <button
                    onClick={() => setMediaPicker(cat.id)}
                    className="px-2 py-1 text-xs border rounded hover:border-blue-400 transition-colors">
                    {s.icon_media_id ? '更换图片' : '选择图片'}
                  </button>
                  {s.icon_media_id && (
                    <button onClick={() => update(cat.id, { icon_media_id: null })}
                      className="text-xs text-red-400 hover:text-red-600">✕ 移除</button>
                  )}
                </div>
              </div>
            )}

            {/* SVG textarea */}
            {s.icon_type === 'svg' && (
              <div>
                <p className="text-xs text-gray-400 mb-1">SVG 代码</p>
                <textarea
                  value={s.icon_svg}
                  onChange={e => update(cat.id, { icon_svg: e.target.value })}
                  placeholder={'<svg ...>...</svg>'}
                  rows={3}
                  className="w-full border rounded px-2 py-1 text-xs font-mono bg-white resize-y"
                />
                {s.icon_svg && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-gray-400">预览:</span>
                    <span className="w-6 h-6 inline-block"
                      dangerouslySetInnerHTML={{ __html: s.icon_svg }} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* MediaPicker modal */}
      {mediaPicker !== null && (
        <MediaPicker
          mode="single"
          onSelect={media => {
            const record = Array.isArray(media) ? media[0] : (media as MediaRecord);
            if (record && mediaPicker !== null) update(mediaPicker, { icon_media_id: record.id });
            setMediaPicker(null);
          }}
          onClose={() => setMediaPicker(null)}
        />
      )}
    </div>
  );
}

// ─── Editor Tabs ──────────────────────────────────────────────────────────────

const EDITOR_TABS = [
  { key: 'preset',      label: '🎨 预设'    },
  { key: 'data',        label: '🗃 数据源'  },
  { key: 'layout',      label: '📐 布局'    },
  { key: 'tabs',        label: '🗂 分类栏'   },
  { key: 'icons',       label: '🖼 图标'    },
  { key: 'provider',    label: '🎰 平台'    },
  { key: 'card',        label: '🃏 卡片'    },
  { key: 'info',        label: '📋 信息'    },
  { key: 'search',      label: '🔍 搜索'    },
  { key: 'animation',   label: '✨ 动画'    },
  { key: 'colors',      label: '🎨 颜色'    },
  { key: 'typography',  label: '✏️ 字体'    },
  { key: 'responsive',  label: '📱 列数'    },
  { key: 'spacing',     label: '📏 间距'    },
];

// ─── Main Editor ──────────────────────────────────────────────────────────────

export default function GameLobbyEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const [activeTab, setActiveTab] = useState('preset');
  const cfg = config as GameLobbyConfig;

  const set = <K extends keyof GameLobbyConfig>(key: K, value: GameLobbyConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const applyPreset = (presetKey: string) => {
    const preset = DESIGN_PRESETS[presetKey];
    if (!preset) return;
    onChange({ ...config, design_preset: presetKey, ...preset });
  };

  return (
    <div className="space-y-0">
      {/* Tab navigation */}
      <div className="flex gap-0.5 flex-wrap mb-3 p-1 bg-gray-100 rounded-lg">
        {EDITOR_TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── PRESET ── */}
      {activeTab === 'preset' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">一键应用设计主题，所有设置自动配置</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PRESET_LABELS).map(([key, { label, icon }]) => (
              <button key={key} onClick={() => applyPreset(key)}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  cfg.design_preset === key
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-blue-300'
                }`}>
                <div className="text-xl mb-1">{icon}</div>
                <div className="text-xs font-semibold text-gray-700">{label}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">选择预设后可在其他标签继续微调</p>
        </div>
      )}

      {/* ── DATA SOURCE ── */}
      {activeTab === 'data' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            选择游戏大厅的数据来源。切换来源只需改这里，无需修改任何其他设置。
          </p>
          <div>
            <Label>游戏来源 Game Source</Label>
            <ButtonGrid cols={3} value={cfg.game_source ?? 'platform'} onChange={v => set('game_source', v as 'platform' | 'games' | 'mixed')} options={[
              { v: 'platform', label: '平台卡片' },
              { v: 'games',    label: '游戏库'   },
              { v: 'mixed',    label: '混合'     },
            ]} />
            <p className="text-xs text-gray-400 mt-1">
              {(cfg.game_source ?? 'platform') === 'platform' && '每个平台(Provider)一张卡片，适合平台导航大厅'}
              {cfg.game_source === 'games' && '显示手动添加或 API 同步的单款游戏，适合游戏列表大厅'}
              {cfg.game_source === 'mixed' && '游戏库优先；没有游戏的平台以平台卡片补充'}
            </p>
          </div>
          <SectionDivider label="管理入口" />
          <div className="space-y-2">
            <a href="/website-game-providers" target="_blank"
              className="flex items-center gap-2 text-xs text-blue-600 hover:underline">
              🎰 管理平台列表 (website_game_providers)
            </a>
            <a href="/website-games" target="_blank"
              className="flex items-center gap-2 text-xs text-blue-600 hover:underline">
              🎮 管理游戏列表 (website_games)
            </a>
          </div>
        </div>
      )}

      {/* ── LAYOUT ── */}
      {activeTab === 'layout' && (
        <div className="space-y-3">
          <div>
            <Label>布局风格 Layout Style</Label>
            <ButtonGrid cols={3} value={cfg.layout_preset ?? 'classic_grid'} onChange={v => set('layout_preset', v)} options={[
              { v: 'classic_grid', label: 'Classic Grid' },
              { v: 'modern',       label: 'Modern'       },
              { v: 'rounded',      label: 'Rounded'      },
              { v: 'glass',        label: 'Glass'        },
              { v: 'minimal',      label: 'Minimal'      },
              { v: 'luxury_gold',  label: 'Luxury Gold'  },
              { v: 'cyber',        label: 'Cyber'        },
              { v: 'neon',         label: 'Neon'         },
              { v: 'dark',         label: 'Dark'         },
            ]} />
          </div>
        </div>
      )}

      {/* ── TABS ── */}
      {activeTab === 'tabs' && (
        <div className="space-y-3">
          <ToggleRow label="启用分类标签栏" checked={cfg.tabs_enabled !== false} onChange={v => set('tabs_enabled', v)} />
          {cfg.tabs_enabled !== false && (
            <>
              <SectionDivider label="Tab 样式" />
              <div>
                <Label>Tab Style</Label>
                <ButtonGrid cols={3} value={cfg.tab_style ?? 'rounded'} onChange={v => set('tab_style', v)} options={[
                  { v: 'classic',   label: 'Classic'   },
                  { v: 'rounded',   label: 'Rounded'   },
                  { v: 'pill',      label: 'Pill'      },
                  { v: 'capsule',   label: 'Capsule'   },
                  { v: 'glass',     label: 'Glass'     },
                  { v: 'underline', label: 'Underline' },
                  { v: 'segment',   label: 'Segment'   },
                  { v: 'gradient',  label: 'Gradient'  },
                  { v: 'neon',      label: 'Neon'      },
                  { v: 'minimal',   label: 'Minimal'   },
                ]} />
              </div>
              <div>
                <Label>图标模式</Label>
                <ButtonGrid cols={3} value={cfg.tab_icon_mode ?? 'icon_text'} onChange={v => set('tab_icon_mode', v)} options={[
                  { v: 'icon_only', label: '仅图标'   },
                  { v: 'icon_text', label: '图标+文字' },
                  { v: 'text_only', label: '仅文字'   },
                ]} />
              </div>
              <SectionDivider label="布局" />
              <div>
                <Label>对齐方式</Label>
                <ButtonGrid cols={3} value={cfg.tab_scroll ?? 'scrollable'} onChange={v => set('tab_scroll', v)} options={[
                  { v: 'scrollable',  label: '可滑动'   },
                  { v: 'centered',    label: '居中'     },
                  { v: 'full_width',  label: '全宽'     },
                ]} />
              </div>
              <ToggleRow label="吸顶固定 Sticky" checked={cfg.tab_sticky === true} onChange={v => set('tab_sticky', v)} />
              <div>
                <Label>切换动画</Label>
                <ButtonGrid cols={3} value={cfg.tab_animation ?? 'none'} onChange={v => set('tab_animation', v)} options={[
                  { v: 'none',  label: '无'    },
                  { v: 'slide', label: 'Slide' },
                  { v: 'fade',  label: 'Fade'  },
                  { v: 'scale', label: 'Scale' },
                  { v: 'glow',  label: 'Glow'  },
                ]} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ICONS ── */}
      {activeTab === 'icons' && (
        <div className="space-y-4">
          <SectionDivider label="分类图标" />
          <p className="text-xs text-gray-500">为每个分类标签设置图标。设置后即时生效，无需保存整个页面。</p>
          <CategoryIconEditor />
          <SectionDivider label="图标显示设置" />
          <div>
            <Label>图标大小</Label>
            <ButtonGrid cols={4} value={cfg.icon_size ?? 'small'} onChange={v => set('icon_size', v)} options={[
              { v: 'tiny',   label: 'Tiny (14)' },
              { v: 'small',  label: 'Small (16)' },
              { v: 'medium', label: 'Medium (18)' },
              { v: 'large',  label: 'Large (24)' },
            ]} />
          </div>
          <div>
            <Label>图标形状</Label>
            <ButtonGrid cols={3} value={cfg.icon_shape ?? 'square'} onChange={v => set('icon_shape', v)} options={[
              { v: 'square',  label: '方形' },
              { v: 'rounded', label: '圆角' },
              { v: 'circle',  label: '圆形' },
            ]} />
          </div>
          <div>
            <Label>图标位置</Label>
            <ButtonGrid cols={4} value={cfg.icon_position ?? 'left'} onChange={v => set('icon_position', v)} options={[
              { v: 'left',   label: '左' },
              { v: 'right',  label: '右' },
              { v: 'top',    label: '上' },
              { v: 'bottom', label: '下' },
            ]} />
          </div>
          <div>
            <Label>图标悬停效果</Label>
            <ButtonGrid cols={3} value={cfg.icon_hover ?? 'none'} onChange={v => set('icon_hover', v)} options={[
              { v: 'none',       label: '无'     },
              { v: 'scale',      label: 'Scale'  },
              { v: 'glow',       label: 'Glow'   },
              { v: 'rotate',     label: 'Rotate' },
              { v: 'shadow',     label: 'Shadow' },
              { v: 'brightness', label: 'Bright' },
            ]} />
          </div>
          <div>
            <Label>图标与文字间距</Label>
            <input type="text" placeholder="4px"
              value={cfg.icon_gap ?? ''}
              onChange={e => set('icon_gap', e.target.value || undefined)}
              className="w-full border rounded px-2 py-1.5 text-xs font-mono bg-white" />
          </div>
        </div>
      )}

      {/* ── PROVIDER ── */}
      {activeTab === 'provider' && (
        <div className="space-y-3">
          <ToggleRow label="显示平台筛选" checked={cfg.show_provider_filter !== false} onChange={v => set('show_provider_filter', v)} />
          {cfg.show_provider_filter !== false && (
            <>
              <SectionDivider label="数据来源" />
              <div>
                <Label>Provider Source</Label>
                <ButtonGrid cols={2} value={cfg.provider_source ?? 'website'} onChange={v => set('provider_source', v)} options={[
                  { v: 'system',  label: '系统 System'   },
                  { v: 'website', label: '网站 Website'  },
                ]} />
                <p className="text-xs text-gray-400 mt-1">系统 = 自动读取 Provider Manager，无需重复维护</p>
              </div>
              <SectionDivider label="显示样式" />
              <div>
                <Label>Provider Style</Label>
                <ButtonGrid cols={3} value={cfg.provider_style ?? 'horizontal'} onChange={v => set('provider_style', v)} options={[
                  { v: 'dropdown',   label: 'Dropdown'   },
                  { v: 'horizontal', label: 'Horizontal' },
                  { v: 'grid',       label: 'Grid'       },
                  { v: 'pill',       label: 'Pill'       },
                  { v: 'chip',       label: 'Chip'       },
                  { v: 'sidebar',    label: 'Sidebar'    },
                  { v: 'carousel',   label: 'Carousel'   },
                ]} />
              </div>
              <div>
                <Label>Display Mode</Label>
                <ButtonGrid cols={3} value={cfg.provider_display ?? 'logo_text'} onChange={v => set('provider_display', v)} options={[
                  { v: 'logo',      label: 'Logo Only'  },
                  { v: 'text',      label: 'Text Only'  },
                  { v: 'logo_text', label: 'Logo + Text' },
                ]} />
              </div>
              <div>
                <Label>Size</Label>
                <ButtonGrid cols={3} value={cfg.provider_size ?? 'medium'} onChange={v => set('provider_size', v)} options={[
                  { v: 'small',  label: 'Small'  },
                  { v: 'medium', label: 'Medium' },
                  { v: 'large',  label: 'Large'  },
                ]} />
              </div>
              <div>
                <Label>Hover 效果</Label>
                <ButtonGrid cols={3} value={cfg.provider_hover ?? 'lift'} onChange={v => set('provider_hover', v)} options={[
                  { v: 'glow',   label: 'Glow'   },
                  { v: 'lift',   label: 'Lift'   },
                  { v: 'border', label: 'Border' },
                  { v: 'scale',  label: 'Scale'  },
                  { v: 'shadow', label: 'Shadow' },
                ]} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── CARD ── */}
      {activeTab === 'card' && (
        <div className="space-y-3">
          <div>
            <Label>Card Style</Label>
            <ButtonGrid cols={4} value={cfg.card_style ?? 'classic'} onChange={v => set('card_style', v)} options={[
              { v: 'classic', label: 'Classic' },
              { v: 'modern',  label: 'Modern'  },
              { v: 'glass',   label: 'Glass'   },
              { v: 'luxury',  label: 'Luxury'  },
              { v: 'minimal', label: 'Minimal' },
              { v: 'rounded', label: 'Rounded' },
              { v: 'neon',    label: 'Neon'    },
              { v: 'cyber',   label: 'Cyber'   },
            ]} />
          </div>
          <SectionDivider label="图片" />
          <div>
            <Label>Image Mode</Label>
            <ButtonGrid cols={4} value={cfg.card_image_mode ?? 'cover'} onChange={v => set('card_image_mode', v)} options={[
              { v: 'cover',    label: 'Cover'    },
              { v: 'contain',  label: 'Contain'  },
              { v: 'fill',     label: 'Fill'     },
              { v: 'original', label: 'Original' },
            ]} />
          </div>
          <div>
            <Label>Card Ratio</Label>
            <ButtonGrid cols={4} value={cfg.card_ratio ?? '3:4'} onChange={v => set('card_ratio', v)} options={[
              { v: '1:1',  label: '1:1'  },
              { v: '4:3',  label: '4:3'  },
              { v: '16:9', label: '16:9' },
              { v: '3:4',  label: '3:4'  },
            ]} />
          </div>
          <SectionDivider label="形状" />
          <div>
            <Label>圆角 Corner Radius</Label>
            <input type="text" placeholder="12px（跟随风格）"
              value={cfg.card_radius ?? ''}
              onChange={e => set('card_radius', e.target.value || undefined)}
              className="w-full border rounded px-2 py-1.5 text-xs font-mono bg-white" />
          </div>
          <SectionDivider label="阴影 / 边框" />
          <div>
            <Label>Shadow</Label>
            <ButtonGrid cols={5} value={cfg.card_shadow ?? 'medium'} onChange={v => set('card_shadow', v)} options={[
              { v: 'none',   label: 'None'   },
              { v: 'soft',   label: 'Soft'   },
              { v: 'medium', label: 'Medium' },
              { v: 'heavy',  label: 'Heavy'  },
              { v: 'glow',   label: 'Glow'   },
            ]} />
          </div>
          <div>
            <Label>Border</Label>
            <ButtonGrid cols={4} value={cfg.card_border ?? 'none'} onChange={v => set('card_border', v)} options={[
              { v: 'none',     label: 'None'     },
              { v: 'solid',    label: 'Solid'    },
              { v: 'gradient', label: 'Gradient' },
              { v: 'glow',     label: 'Glow'     },
            ]} />
          </div>
          <SectionDivider label="悬停" />
          <div>
            <Label>Hover Effect</Label>
            <ButtonGrid cols={4} value={cfg.card_hover ?? 'lift'} onChange={v => set('card_hover', v)} options={[
              { v: 'zoom',   label: 'Zoom'   },
              { v: 'lift',   label: 'Lift'   },
              { v: 'glow',   label: 'Glow'   },
              { v: 'rotate', label: 'Rotate' },
              { v: 'tilt',   label: 'Tilt'   },
              { v: 'flip',   label: 'Flip'   },
              { v: 'none',   label: 'None'   },
            ]} />
          </div>
        </div>
      )}

      {/* ── INFO ── */}
      {activeTab === 'info' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-2">控制游戏卡片上显示哪些信息</p>
          <ToggleRow label="显示游戏名称 Game Name"  checked={cfg.show_game_name  !== false} onChange={v => set('show_game_name',  v)} />
          <ToggleRow label="显示平台名称 Provider"   checked={cfg.show_provider   !== false} onChange={v => set('show_provider',   v)} />
          <ToggleRow label="显示 HOT 标签"           checked={cfg.show_hot_badge  !== false} onChange={v => set('show_hot_badge',  v)} />
          <ToggleRow label="显示 NEW 标签"           checked={cfg.show_new_badge  !== false} onChange={v => set('show_new_badge',  v)} />
          <ToggleRow label="显示 Play 按钮"          checked={cfg.show_play_button === true}  onChange={v => set('show_play_button', v)} />
          <ToggleRow label="显示 Demo 按钮"          checked={cfg.show_demo_button === true}  onChange={v => set('show_demo_button', v)} />
          <SectionDivider label="按钮样式" />
          <div>
            <Label>Button Style</Label>
            <ButtonGrid cols={3} value={cfg.button_style ?? 'rounded'} onChange={v => set('button_style', v)} options={[
              { v: 'classic',  label: 'Classic'  },
              { v: 'rounded',  label: 'Rounded'  },
              { v: 'glass',    label: 'Glass'    },
              { v: 'gradient', label: 'Gradient' },
              { v: 'neon',     label: 'Neon'     },
            ]} />
          </div>
        </div>
      )}

      {/* ── SEARCH / SORT / PAGINATION ── */}
      {activeTab === 'search' && (
        <div className="space-y-3">
          <SectionDivider label="搜索" />
          <ToggleRow label="启用搜索框" checked={cfg.search_enabled === true} onChange={v => set('search_enabled', v)} />
          {cfg.search_enabled && (
            <>
              <div>
                <Label>搜索框样式</Label>
                <ButtonGrid cols={3} value={cfg.search_style ?? 'outline'} onChange={v => set('search_style', v)} options={[
                  { v: 'outline', label: 'Outline' },
                  { v: 'filled',  label: 'Filled'  },
                  { v: 'glass',   label: 'Glass'   },
                  { v: 'minimal', label: 'Minimal' },
                  { v: 'rounded', label: 'Rounded' },
                ]} />
              </div>
              <div>
                <Label>Placeholder</Label>
                <input type="text" placeholder="搜索游戏..."
                  value={cfg.search_placeholder ?? ''}
                  onChange={e => set('search_placeholder', e.target.value || undefined)}
                  className="w-full border rounded px-2 py-1.5 text-xs bg-white" />
              </div>
            </>
          )}
          <SectionDivider label="排序" />
          <div>
            <Label>Default Sort</Label>
            <ButtonGrid cols={3} value={cfg.default_sort ?? 'popular'} onChange={v => set('default_sort', v)} options={[
              { v: 'popular',  label: '热门'   },
              { v: 'newest',   label: '最新'   },
              { v: 'a_z',      label: 'A → Z'  },
              { v: 'provider', label: '平台'   },
              { v: 'random',   label: '随机'   },
            ]} />
          </div>
          <SectionDivider label="分页" />
          <div>
            <Label>Pagination Type</Label>
            <ButtonGrid cols={3} value={cfg.pagination_type ?? 'load_more'} onChange={v => set('pagination_type', v)} options={[
              { v: 'infinite',   label: '无限滚动' },
              { v: 'load_more',  label: '加载更多' },
              { v: 'pagination', label: '分页按钮' },
            ]} />
          </div>
        </div>
      )}

      {/* ── ANIMATION ── */}
      {activeTab === 'animation' && (
        <div className="space-y-3">
          <div>
            <Label>卡片入场动画 Card Animation</Label>
            <ButtonGrid cols={3} value={cfg.card_animation ?? 'fade'} onChange={v => set('card_animation', v)} options={[
              { v: 'none',   label: '无'     },
              { v: 'fade',   label: 'Fade'   },
              { v: 'slide',  label: 'Slide'  },
              { v: 'scale',  label: 'Scale'  },
              { v: 'bounce', label: 'Bounce' },
              { v: 'float',  label: 'Float'  },
              { v: 'pulse',  label: 'Pulse'  },
            ]} />
          </div>
          <ToggleRow label="滚动触发动画 Scroll Animation" checked={cfg.scroll_animation === true} onChange={v => set('scroll_animation', v)} />
        </div>
      )}

      {/* ── COLORS ── */}
      {activeTab === 'colors' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 mb-2">留空则使用主题默认色</p>
          <ColorRow label="强调色 Accent"       value={cfg.color_accent}     onChange={v => set('color_accent',     v || undefined)} />
          <ColorRow label="背景 Background"      value={cfg.color_bg}         onChange={v => set('color_bg',         v || undefined)} />
          <ColorRow label="卡片背景 Card"        value={cfg.color_card}       onChange={v => set('color_card',       v || undefined)} />
          <ColorRow label="Tab 背景"             value={cfg.color_tab}        onChange={v => set('color_tab',        v || undefined)} />
          <ColorRow label="Active Tab"           value={cfg.color_tab_active} onChange={v => set('color_tab_active', v || undefined)} />
          <ColorRow label="Inactive Tab"         value={cfg.color_tab_inactive} onChange={v => set('color_tab_inactive', v || undefined)} />
          <ColorRow label="按钮 Button"          value={cfg.color_button}     onChange={v => set('color_button',     v || undefined)} />
          <ColorRow label="边框 Border"          value={cfg.color_border}     onChange={v => set('color_border',     v || undefined)} />
          <ColorRow label="文字 Text"            value={cfg.color_text}       onChange={v => set('color_text',       v || undefined)} />
        </div>
      )}

      {/* ── TYPOGRAPHY ── */}
      {activeTab === 'typography' && (
        <div className="space-y-3">
          <div>
            <Label>字体 Font</Label>
            <ButtonGrid cols={3} value={cfg.font ?? 'system'} onChange={v => set('font', v)} options={[
              { v: 'system',     label: 'System'     },
              { v: 'roboto',     label: 'Roboto'     },
              { v: 'poppins',    label: 'Poppins'    },
              { v: 'montserrat', label: 'Montserrat' },
              { v: 'orbitron',   label: 'Orbitron'   },
              { v: 'digital',    label: 'Digital'    },
            ]} />
          </div>
          <div>
            <Label>字重 Font Weight</Label>
            <ButtonGrid cols={4} value={cfg.font_weight ?? 'regular'} onChange={v => set('font_weight', v)} options={[
              { v: 'light',   label: 'Light'   },
              { v: 'regular', label: 'Regular' },
              { v: 'medium',  label: 'Medium'  },
              { v: 'bold',    label: 'Bold'    },
            ]} />
          </div>
        </div>
      )}

      {/* ── RESPONSIVE ── */}
      {activeTab === 'responsive' && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-600 font-medium mb-2">🖥 Desktop (≥1024px)</p>
            <ColSelect label="Columns" value={cfg.columns_desktop ?? 5} options={[2,3,4,5,6]} onChange={v => set('columns_desktop', v as 2|3|4|5|6)} />
          </div>
          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
            <p className="text-xs text-green-600 font-medium mb-2">📱 Tablet (≥640px)</p>
            <ColSelect label="Columns" value={cfg.columns_tablet ?? 3} options={[2,3,4]} onChange={v => set('columns_tablet', v as 2|3|4)} />
          </div>
          <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
            <p className="text-xs text-orange-600 font-medium mb-2">📱 Mobile (&lt;640px)</p>
            <ColSelect label="Columns" value={cfg.columns_mobile ?? 2} options={[1,2,3]} onChange={v => set('columns_mobile', v as 1|2|3)} />
          </div>
        </div>
      )}

      {/* ── SPACING ── */}
      {activeTab === 'spacing' && (
        <div className="space-y-3">
          <div>
            <Label>卡片间距 Card Gap</Label>
            <input type="text" placeholder="12px"
              value={cfg.card_gap ?? ''}
              onChange={e => set('card_gap', e.target.value || undefined)}
              className="w-full border rounded px-2 py-1.5 text-xs font-mono bg-white" />
          </div>
          <div>
            <Label>区块内边距 Section Padding</Label>
            <input type="text" placeholder="16px 0"
              value={cfg.section_padding ?? ''}
              onChange={e => set('section_padding', e.target.value || undefined)}
              className="w-full border rounded px-2 py-1.5 text-xs font-mono bg-white" />
          </div>
          <div>
            <Label>容器最大宽度 Container Width</Label>
            <input type="text" placeholder="1200px（无限制则留空）"
              value={cfg.container_width ?? ''}
              onChange={e => set('container_width', e.target.value || undefined)}
              className="w-full border rounded px-2 py-1.5 text-xs font-mono bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
