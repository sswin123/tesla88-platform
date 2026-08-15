'use client';
import { useState, useEffect } from 'react';
import { GripVertical, ChevronUp, ChevronDown, Trash2, Plus, ExternalLink } from 'lucide-react';
import { ImageUploadField } from '@/components/media/ImageUploadField';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';

// ── Types (mirrors website/src/lib/footer-config.ts) ────────────────────────

type FooterLinkType = 'internal' | 'external';
type FooterDefaultIconKey = 'home' | 'history' | 'promotion' | 'chat' | 'profile' | 'custom';

type FooterItem = {
  id: string;
  label: string;
  link_type: FooterLinkType;
  route: string;
  open_in_new_tab?: boolean;
  enabled: boolean;
  sort_order: number;
  icon_media_id?: number | null;
  active_icon_media_id?: number | null;
  default_icon_key: FooterDefaultIconKey;
};

type FooterStyle = {
  variant?: 'classic' | 'glass' | 'solid' | 'gradient';
  background?: string;
  border?: boolean;
  icon_size?: number;
  text_size?: number;
  spacing?: string;
  height?: number;
  opacity?: number;
};

type FooterConfig = {
  _version?: number;
  items: FooterItem[];
  style: FooterStyle;
};

const MAX_ITEMS = 6;
const RECOMMENDED_MIN_ITEMS = 3;

function uid() { return `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// Emoji stand-ins for the site's built-in SVG icon set — the ERP preview
// mirrors Header Builder's own HeaderPreview approach (a lightweight
// re-implementation, not a literal import of the website's <BottomNav/>,
// since erp/ and website/ are separate Next apps that cannot share
// components across packages).
const DEFAULT_ICON_EMOJI: Record<Exclude<FooterDefaultIconKey, 'custom'>, string> = {
  home: '🏠', history: '🕘', promotion: '⭐', chat: '💬', profile: '👤',
};

const DEFAULT_FOOTER_CONFIG: FooterConfig = {
  _version: 1,
  items: [
    { id: 'home',      label: '首页', link_type: 'internal', route: '/',           enabled: true, sort_order: 0, default_icon_key: 'home' },
    { id: 'history',   label: '记录', link_type: 'internal', route: '/history',    enabled: true, sort_order: 1, default_icon_key: 'history' },
    { id: 'promotion', label: '优惠', link_type: 'internal', route: '/promotions', enabled: true, sort_order: 2, default_icon_key: 'promotion' },
    { id: 'chat',      label: '客服', link_type: 'internal', route: '/chat',       enabled: true, sort_order: 3, default_icon_key: 'chat' },
    { id: 'profile',   label: '我的', link_type: 'internal', route: '/profile',    enabled: true, sort_order: 4, default_icon_key: 'profile' },
  ],
  style: {},
};

// ── Small shared pieces ──────────────────────────────────────────────────────

function MediaUploadHint({ rec, ratio, maxMB, formats, note }: {
  rec: string; ratio: string; maxMB: number; formats: string[]; note?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-600 bg-gray-800/50 px-3 py-2 text-[10px] text-muted-foreground space-y-0.5">
      <p><span className="text-muted-foreground font-medium">推荐尺寸：</span>{rec}</p>
      <p><span className="text-muted-foreground font-medium">宽高比：</span>{ratio}</p>
      <p><span className="text-muted-foreground font-medium">最大：</span>{maxMB}MB</p>
      <p><span className="text-muted-foreground font-medium">格式：</span>{formats.join(' • ')}</p>
      {note && <p className="text-amber-500">{note}</p>}
    </div>
  );
}

function IconPickerField({ label, mediaId, onChange }: {
  label: string;
  mediaId?: number | null;
  onChange: (mediaId: number | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <ImageUploadField
        label={label}
        mediaId={mediaId}
        onUpload={(id) => onChange(id)}
        onRemove={() => onChange(null)}
        hint={<MediaUploadHint rec="64 × 64 px" ratio="1:1" maxMB={2} formats={['PNG', 'JPG', 'WEBP', 'GIF']} note="推荐透明背景；GIF 会保持动画效果" />}
      />
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="w-full py-1.5 border border-dashed border-gray-600 rounded-lg text-xs text-muted-foreground hover:text-violet-400 hover:border-violet-500 transition-colors"
      >
        从素材库选择
      </button>
      {pickerOpen && (
        <MediaPicker
          mode="single"
          onSelect={(media) => {
            const rec = media as MediaRecord;
            onChange(rec.id);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ── Preview ───────────────────────────────────────────────────────────────

function FooterPreview({ config }: { config: FooterConfig }) {
  const [activeId, setActiveId] = useState<string | null>(config.items[0]?.id ?? null);
  const items = [...config.items].filter(i => i.enabled).sort((a, b) => a.sort_order - b.sort_order).slice(0, MAX_ITEMS);
  const style = config.style ?? {};

  return (
    <div className="rounded-2xl border border-gray-700 overflow-hidden bg-gray-950" style={{ maxWidth: 380 }}>
      <div className="h-40 flex items-center justify-center text-xs text-muted-foreground bg-gradient-to-b from-gray-900 to-gray-950">
        Website Preview
      </div>
      <div
        className="flex items-stretch"
        style={{
          background: style.background || '#18181b',
          borderTop: style.border === false ? 'none' : '1px solid rgba(255,255,255,0.08)',
          opacity: style.opacity ?? 1,
          height: style.height ? `${style.height}px` : 'auto',
        }}
      >
        {items.length === 0 ? (
          <div className="flex-1 py-4 text-center text-xs text-muted-foreground">没有已启用的 Footer Item</div>
        ) : items.map(item => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors"
              style={{ color: active ? '#f59e0b' : '#71717a' }}
            >
              {(active && item.active_icon_media_id) || item.icon_media_id ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/public/media/${active && item.active_icon_media_id ? item.active_icon_media_id : item.icon_media_id}`}
                  alt={item.label}
                  style={{ width: style.icon_size ?? 19, height: style.icon_size ?? 19, objectFit: 'contain' }}
                />
              ) : (
                <span style={{ fontSize: style.icon_size ?? 19 }}>
                  {item.default_icon_key !== 'custom' ? DEFAULT_ICON_EMOJI[item.default_icon_key] : '❔'}
                </span>
              )}
              <span style={{ fontSize: `${style.text_size ?? 10}px` }}>{item.label || '（未命名）'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Item row ──────────────────────────────────────────────────────────────

function FooterItemRow({
  item, index, total, onChange, onDelete, onMove,
  isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  item: FooterItem;
  index: number;
  total: number;
  onChange: (patch: Partial<FooterItem>) => void;
  onDelete: () => void;
  onMove: (dir: 'up' | 'down') => void;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`rounded-xl border p-3 space-y-2.5 transition-all cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-40 scale-95' :
        isDragOver ? 'border-violet-400 bg-violet-500/5' :
        item.enabled ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-900/20 border-zinc-800 opacity-60'
      }`}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          type="checkbox"
          checked={item.enabled}
          onChange={e => onChange({ enabled: e.target.checked })}
          title="Show / Hide"
        />
        <input
          value={item.label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="Label"
          className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none"
        />
        <button type="button" onClick={() => onMove('up')} disabled={index === 0}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => onMove('down')} disabled={index === total - 1}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onDelete}
          className="p-1.5 rounded hover:bg-red-900/30 text-zinc-600 hover:text-red-400" aria-label="Delete footer item">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-2 items-center pl-6">
        <select
          value={item.link_type}
          onChange={e => onChange({ link_type: e.target.value as FooterLinkType })}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none"
        >
          <option value="internal">Internal Route</option>
          <option value="external">External URL</option>
        </select>
        <input
          value={item.route}
          onChange={e => onChange({ route: e.target.value })}
          placeholder={item.link_type === 'internal' ? '/history' : 'https://...'}
          className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none"
        />
        <button
          type="button"
          onClick={() => item.route && window.open(item.route, '_blank')}
          title="测试链接"
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-violet-400 flex-shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
      {item.link_type === 'external' && (
        <label className="flex items-center gap-1.5 pl-6 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={!!item.open_in_new_tab}
            onChange={e => onChange({ open_in_new_tab: e.target.checked })}
          />
          在新标签页打开
        </label>
      )}

      <div className="grid grid-cols-2 gap-2 pl-6">
        <IconPickerField
          label="Icon（未设置则用默认图标）"
          mediaId={item.icon_media_id}
          onChange={(id) => onChange({ icon_media_id: id })}
        />
        <IconPickerField
          label="Active Icon（可选，未设置则复用 Icon）"
          mediaId={item.active_icon_media_id}
          onChange={(id) => onChange({ active_icon_media_id: id })}
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function FooterBuilderPage() {
  const [draft, setDraft] = useState<FooterConfig>(DEFAULT_FOOTER_CONFIG);
  const [liveConfig, setLiveConfig] = useState<FooterConfig | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [msg, setMsg] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/website/footer-config').then(r => r.ok ? r.json() as Promise<FooterConfig | null> : null),
      fetch('/api/public/footer-config').then(r => r.ok ? r.json() as Promise<FooterConfig | null> : null),
    ]).then(([draftData, liveData]) => {
      if (draftData) { setDraft(draftData); setHasSavedDraft(true); }
      setLiveConfig(liveData);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const isDirty = JSON.stringify({ items: draft.items, style: draft.style }) !==
    JSON.stringify({ items: liveConfig?.items ?? [], style: liveConfig?.style ?? {} });

  function updateItem(id: string, patch: Partial<FooterItem>) {
    setDraft(c => ({ ...c, items: c.items.map(it => it.id === id ? { ...it, ...patch } : it) }));
  }
  function addItem() {
    if (draft.items.length >= MAX_ITEMS) return;
    setDraft(c => ({
      ...c,
      items: [...c.items, {
        id: uid(), label: '', link_type: 'internal', route: '/',
        enabled: true, sort_order: c.items.length, default_icon_key: 'custom',
      }],
    }));
  }
  function deleteItem(id: string) {
    setDraft(c => ({ ...c, items: c.items.filter(it => it.id !== id).map((it, i) => ({ ...it, sort_order: i })) }));
  }
  function moveItem(id: string, dir: 'up' | 'down') {
    setDraft(c => {
      const items = [...c.items];
      const i = items.findIndex(it => it.id === id);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= items.length) return c;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...c, items: items.map((it, k) => ({ ...it, sort_order: k })) };
    });
  }
  function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    setDraft(c => {
      const items = [...c.items];
      const [moved] = items.splice(dragIdx, 1);
      items.splice(targetIdx, 0, moved);
      return { ...c, items: items.map((it, k) => ({ ...it, sort_order: k })) };
    });
    setDragIdx(null); setDragOverIdx(null);
  }

  async function handleSave() {
    setSaving(true); setMsg('');
    const res = await fetch('/api/website/footer-config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: draft.items, style: draft.style }),
    });
    setSaving(false);
    if (res.ok) { setHasSavedDraft(true); setMsg('✓ 已保存为草稿（尚未发布到 Live Website）'); }
    else { const j = await res.json().catch(() => ({})); setMsg(`✗ 保存失败：${j.error ?? res.status}`); }
    setTimeout(() => setMsg(''), 4000);
  }

  async function handlePublish() {
    setPublishing(true); setMsg('');
    const res = await fetch('/api/website/footer-config/publish', { method: 'POST' });
    setPublishing(false);
    if (res.ok) {
      const j = await res.json() as { config: FooterConfig };
      setLiveConfig(j.config);
      setMsg('✓ 已发布到 Live Website');
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg(`✗ 发布失败：${j.error ?? res.status}`);
    }
    setTimeout(() => setMsg(''), 4000);
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Website Footer Builder</h1>
        <p className="text-sm text-muted-foreground mt-1">管理 Mobile 底部导航的图标、文字、链接、顺序与显示状态。</p>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Mobile Preview</h2>
          <FooterPreview config={draft} />
          <p className="text-[11px] text-muted-foreground">点击某个 item 可在预览内切换 Active 状态；点击 ↗ 可在新标签页测试实际链接。</p>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-foreground">Footer Items（{draft.items.length}/{MAX_ITEMS}）</h2>
              {draft.items.length < RECOMMENDED_MIN_ITEMS && (
                <span className="text-[11px] text-amber-500">建议至少 {RECOMMENDED_MIN_ITEMS} 个</span>
              )}
            </div>
            <div className="space-y-2.5">
              {draft.items.map((item, idx) => (
                <FooterItemRow
                  key={item.id}
                  item={item}
                  index={idx}
                  total={draft.items.length}
                  onChange={(patch) => updateItem(item.id, patch)}
                  onDelete={() => deleteItem(item.id)}
                  onMove={(dir) => moveItem(item.id, dir)}
                  isDragging={dragIdx === idx}
                  isDragOver={dragOverIdx === idx}
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addItem}
              disabled={draft.items.length >= MAX_ITEMS}
              className="w-full mt-2.5 py-2 border border-dashed border-zinc-700 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 flex items-center justify-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
            {draft.items.length >= MAX_ITEMS && (
              <p className="text-[11px] text-amber-500 mt-1">Maximum 6 footer items allowed.</p>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground mb-2">Footer Style</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Variant</label>
                <select
                  value={draft.style.variant ?? 'classic'}
                  onChange={e => setDraft(c => ({ ...c, style: { ...c.style, variant: e.target.value as FooterStyle['variant'] } }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none"
                >
                  <option value="classic">Classic</option>
                  <option value="glass">Glass</option>
                  <option value="solid">Solid</option>
                  <option value="gradient">Gradient</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Icon Size (px)</label>
                <input
                  type="number"
                  value={draft.style.icon_size ?? ''}
                  placeholder="19"
                  onChange={e => setDraft(c => ({ ...c, style: { ...c.style, icon_size: e.target.value ? Number(e.target.value) : undefined } }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Text Size (px)</label>
                <input
                  type="number"
                  value={draft.style.text_size ?? ''}
                  placeholder="10"
                  onChange={e => setDraft(c => ({ ...c, style: { ...c.style, text_size: e.target.value ? Number(e.target.value) : undefined } }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Opacity (0–1)</label>
                <input
                  type="number" step="0.05" min="0" max="1"
                  value={draft.style.opacity ?? ''}
                  placeholder="1"
                  onChange={e => setDraft(c => ({ ...c, style: { ...c.style, opacity: e.target.value ? Number(e.target.value) : undefined } }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 col-span-2">
                <input
                  type="checkbox"
                  checked={draft.style.border !== false}
                  onChange={e => setDraft(c => ({ ...c, style: { ...c.style, border: e.target.checked } }))}
                />
                显示顶部边框
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">未设置的样式项会自动继承当前 Website 主题。</p>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? '保存中…' : 'Save (草稿)'}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || !hasSavedDraft}
              title={!hasSavedDraft ? '请先 Save' : undefined}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {publishing ? '发布中…' : 'Publish (上线)'}
            </button>
            {isDirty && <span className="text-xs text-amber-500">● 有未发布的改动</span>}
            {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
