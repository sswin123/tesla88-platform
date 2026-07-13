'use client';
import { useEffect, useState } from 'react';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';
import type { WebsiteGameCategory } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type IconType = 'none' | 'emoji' | 'image' | 'gif' | 'svg';
type ImageDisplaySize = 'small' | 'medium' | 'large';
type ImageDisplayMode = 'contain' | 'cover' | 'stretch';

const IMAGE_SIZE_PX: Record<ImageDisplaySize, number> = { small: 48, medium: 64, large: 80 };

interface FormState {
  category_code:      string;
  category_name:      string;
  icon_type:          IconType;
  icon_emoji:         string;
  icon_media_id:      number | null;
  icon_svg:           string;
  display_order:      string;
  is_default:         boolean;
  is_active:          boolean;
  image_display_size: ImageDisplaySize;
  image_display_mode: ImageDisplayMode;
}

const BLANK: FormState = {
  category_code: '', category_name: '',
  icon_type: 'none', icon_emoji: '', icon_media_id: null, icon_svg: '',
  display_order: '0', is_default: false, is_active: true,
  image_display_size: 'medium', image_display_mode: 'contain',
};

function catToForm(c: WebsiteGameCategory): FormState {
  return {
    category_code:      c.category_code,
    category_name:      c.category_name,
    icon_type:          (c.icon_type as IconType) ?? 'none',
    icon_emoji:         c.icon_emoji ?? '',
    icon_media_id:      c.icon_media_id ?? null,
    icon_svg:           c.icon_svg ?? '',
    display_order:      String(c.display_order),
    is_default:         c.is_default,
    is_active:          c.is_active,
    image_display_size: (c.image_display_size as ImageDisplaySize) ?? 'medium',
    image_display_mode: (c.image_display_mode as ImageDisplayMode) ?? 'contain',
  };
}

// ─── Delete dialog ────────────────────────────────────────────────────────────

interface DeleteDialogProps {
  cat: WebsiteGameCategory;
  allCats: WebsiteGameCategory[];
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteDialog({ cat, allCats, onClose, onDeleted }: DeleteDialogProps) {
  const [inUse, setInUse] = useState<{ provider_count: number; game_count: number } | null>(null);
  const [action, setAction] = useState<'cancel' | 'reassign' | 'clear'>('cancel');
  const [reassignId, setReassignId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/website/lobby-categories/${cat.id}`, { method: 'DELETE' })
      .then(async r => {
        if (r.status === 409) {
          const d = await r.json() as { provider_count: number; game_count: number };
          setInUse(d);
        } else if (r.ok) {
          onDeleted();
        } else {
          const d = await r.json() as { error: string };
          setError(d.error ?? '删除失败');
        }
      })
      .catch(() => setError('删除失败'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmDelete() {
    if (action === 'cancel') { onClose(); return; }
    setDeleting(true);
    let url = `/api/website/lobby-categories/${cat.id}?force=${action}`;
    if (action === 'reassign' && reassignId) url += `&to_id=${reassignId}`;

    const res = await fetch(url, { method: 'DELETE' });
    setDeleting(false);
    if (res.ok) { onDeleted(); }
    else { const d = await res.json() as { error: string }; setError(d.error ?? '删除失败'); }
  }

  const others = allCats.filter(c => c.id !== cat.id && c.category_code !== 'all' && c.category_code !== 'hot');

  if (loading) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-80 text-center text-sm text-gray-500">检查中...</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-96 shadow-xl space-y-4">
        <h3 className="text-base font-semibold text-red-600">删除分类：{cat.category_name}</h3>

        {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}

        {inUse && (
          <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-3 space-y-1">
            <p className="font-medium text-yellow-800">此分类正在使用中</p>
            <p>Platform: {inUse.provider_count} 个</p>
            <p>Game: {inUse.game_count} 个</p>
            <p className="pt-1">请选择处理方式：</p>
          </div>
        )}

        {inUse && (
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={action === 'cancel'} onChange={() => setAction('cancel')} />
              <span>取消（不删除）</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={action === 'clear'} onChange={() => setAction('clear')} />
              <span>取消关联（Provider/Game 变为无分类）</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={action === 'reassign'} onChange={() => setAction('reassign')} />
              <span>重新指定分类</span>
            </label>
            {action === 'reassign' && (
              <select value={reassignId} onChange={e => setReassignId(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm ml-6">
                <option value="">选择目标分类...</option>
                {others.map(c => (
                  <option key={c.id} value={c.id}>{c.category_name} ({c.category_code})</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            取消
          </button>
          {(!inUse || action !== 'cancel') && (
            <button
              onClick={confirmDelete}
              disabled={deleting || (action === 'reassign' && !reassignId)}
              className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {deleting ? '删除中...' : '确认删除'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GameLobyCategoriesPage() {
  const [cats, setCats]       = useState<WebsiteGameCategory[]>([]);
  const [editId, setEditId]   = useState<number | null>(null);
  const [form, setForm]       = useState<FormState>(BLANK);
  const [showForm, setShowForm] = useState(false);
  const [showDelete, setShowDelete] = useState<WebsiteGameCategory | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState('');
  const [error, setError]     = useState('');

  async function load() {
    const res = await fetch('/api/website/lobby-categories');
    if (res.ok) setCats(await res.json() as WebsiteGameCategory[]);
  }

  useEffect(() => { void load(); }, []);

  function setField(key: keyof FormState, value: string | boolean | number | null) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function startCreate() {
    const maxOrder = cats.reduce((m, c) => Math.max(m, c.display_order), 0);
    setEditId(null);
    setForm({ ...BLANK, display_order: String(maxOrder + 10) });
    setShowForm(true); setMsg(''); setError('');
  }

  function startEdit(c: WebsiteGameCategory) {
    setEditId(c.id); setForm(catToForm(c));
    setShowForm(true); setMsg(''); setError('');
  }

  function cancelForm() { setShowForm(false); setEditId(null); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');

    const body = {
      category_code:      form.category_code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      category_name:      form.category_name.trim(),
      icon_type:          form.icon_type,
      icon_emoji:         form.icon_type === 'emoji' ? form.icon_emoji || null : null,
      icon_media_id:      (form.icon_type === 'image' || form.icon_type === 'gif') ? form.icon_media_id : null,
      icon_svg:           form.icon_type === 'svg' ? form.icon_svg || null : null,
      display_order:      parseInt(form.display_order) || 0,
      is_default:         form.is_default,
      is_active:          form.is_active,
      image_display_size: form.image_display_size,
      image_display_mode: form.image_display_mode,
    };

    const url    = editId ? `/api/website/lobby-categories/${editId}` : '/api/website/lobby-categories';
    const method = editId ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);

    if (res.ok) {
      setMsg(editId ? '分类已更新' : '分类已创建');
      setShowForm(false); setEditId(null);
      void load();
    } else {
      const d = await res.json() as { error: string };
      setError(d.error ?? '保存失败');
    }
  }

  async function toggleActive(c: WebsiteGameCategory) {
    await fetch(`/api/website/lobby-categories/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !c.is_active }),
    });
    void load();
  }

  async function setDefault(c: WebsiteGameCategory) {
    await fetch(`/api/website/lobby-categories/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    });
    void load();
  }

  async function reorder(c: WebsiteGameCategory, dir: -1 | 1) {
    await fetch(`/api/website/lobby-categories/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_order: c.display_order + dir * 10 }),
    });
    void load();
  }

  function handleMediaSelect(m: MediaRecord | MediaRecord[]) {
    const picked = Array.isArray(m) ? m[0] : m;
    if (picked) setField('icon_media_id', picked.id);
    setPickerOpen(false);
  }

  const iconTypes: IconType[] = ['none', 'emoji', 'image', 'gif', 'svg'];

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Game Lobby 分类管理</h1>
          <p className="text-sm text-gray-500 mt-1">动态管理所有分类 Tab — 无需修改代码</p>
        </div>
        <button onClick={startCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          + 新增分类
        </button>
      </div>

      {msg   && <div className="mb-4 text-green-700 text-sm bg-green-50 border border-green-200 rounded p-3">{msg}</div>}
      {error && <div className="mb-4 text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}

      {/* ── Form ── */}
      {showForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold mb-4">
            {editId ? '编辑分类' : '新增分类'}
          </h2>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Category Code * <span className="text-gray-400">(唯一标识，英文小写)</span>
                </label>
                <input
                  value={form.category_code}
                  onChange={e => setField('category_code', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  required disabled={!!editId}
                  placeholder="slot, live, poker..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono disabled:bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  分类名称 *
                </label>
                <input
                  value={form.category_name}
                  onChange={e => setField('category_name', e.target.value)}
                  required placeholder="老虎机"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">排序 (小 = 靠前)</label>
                <input type="text" inputMode="numeric"
                  value={form.display_order}
                  onChange={e => setField('display_order', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input type="checkbox" checked={form.is_default}
                    onChange={e => setField('is_default', e.target.checked)}
                    className="h-4 w-4 rounded" />
                  <span className="text-sm font-medium text-gray-700">默认分类</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input type="checkbox" checked={form.is_active}
                    onChange={e => setField('is_active', e.target.checked)}
                    className="h-4 w-4 rounded" />
                  <span className="text-sm font-medium text-gray-700">启用</span>
                </label>
              </div>

              {/* Image Display Size — only relevant for image/gif icons */}
              {(form.icon_type === 'image' || form.icon_type === 'gif') && (
                <div className="col-span-2 border-t pt-3">
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    图片显示尺寸
                    <span className="ml-1 text-gray-400 font-normal">（容器大小，图片自动缩放适应）</span>
                  </label>
                  <div className="flex items-start gap-6">
                    {/* Controls */}
                    <div className="space-y-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600 w-16 shrink-0">图片尺寸</label>
                        <select
                          value={form.image_display_size}
                          onChange={e => setField('image_display_size', e.target.value)}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        >
                          <option value="small">Small（48 × 48 px）</option>
                          <option value="medium">Medium（64 × 64 px）— 默认</option>
                          <option value="large">Large（80 × 80 px）</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600 w-16 shrink-0">显示模式</label>
                        <select
                          value={form.image_display_mode}
                          onChange={e => setField('image_display_mode', e.target.value)}
                          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                        >
                          <option value="contain">Contain（保留完整图片，留白）</option>
                          <option value="cover">Cover（填满容器，可能裁切）</option>
                          <option value="stretch">Stretch（拉伸填满，可能变形）</option>
                        </select>
                      </div>
                    </div>

                    {/* Live preview — three size comparison */}
                    <div className="flex items-end gap-4">
                      {(['small', 'medium', 'large'] as ImageDisplaySize[]).map(sz => {
                        const px = IMAGE_SIZE_PX[sz];
                        const isActive = form.image_display_size === sz;
                        const objectFit = form.image_display_mode === 'contain' ? 'contain'
                          : form.image_display_mode === 'cover' ? 'cover' : 'fill';
                        return (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setField('image_display_size', sz)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-colors ${
                              isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div
                              className="rounded bg-gray-100 flex items-center justify-center overflow-hidden"
                              style={{ width: px, height: px, flexShrink: 0 }}
                            >
                              {form.icon_media_id ? (
                                <img
                                  src={`/api/public/media/${form.icon_media_id}`}
                                  alt=""
                                  style={{ width: '100%', height: '100%', objectFit }}
                                />
                              ) : (
                                <span className="text-gray-300 text-xs">图片</span>
                              )}
                            </div>
                            <span className={`text-xs font-medium ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                              {sz.charAt(0).toUpperCase() + sz.slice(1)}
                            </span>
                            <span className="text-xs text-gray-400">{px}px</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Icon section */}
              <div className="col-span-2 border-t pt-3">
                <label className="block text-xs font-medium text-gray-700 mb-2">图标</label>
                <div className="flex gap-1 mb-2">
                  {iconTypes.map(t => (
                    <button key={t} type="button"
                      onClick={() => setField('icon_type', t)}
                      className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
                        form.icon_type === t
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'
                      }`}>
                      {t === 'none' ? '无' : t.toUpperCase()}
                    </button>
                  ))}
                </div>

                {form.icon_type === 'emoji' && (
                  <div>
                    <input type="text" maxLength={4}
                      value={form.icon_emoji}
                      onChange={e => setField('icon_emoji', e.target.value)}
                      placeholder="输入 Emoji，如 🎰"
                      className="w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    {form.icon_emoji && (
                      <span className="ml-3 text-2xl">{form.icon_emoji}</span>
                    )}
                  </div>
                )}

                {(form.icon_type === 'image' || form.icon_type === 'gif') && (
                  <div className="flex items-center gap-3">
                    {form.icon_media_id && (
                      <img src={`/api/public/media/${form.icon_media_id}`} alt=""
                        className="w-10 h-10 object-contain rounded border" />
                    )}
                    <button type="button" onClick={() => setPickerOpen(true)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                      {form.icon_media_id ? '更换图片' : '选择图片'}
                    </button>
                    {form.icon_media_id && (
                      <button type="button" onClick={() => setField('icon_media_id', null)}
                        className="text-xs text-red-500 hover:underline">移除</button>
                    )}
                  </div>
                )}

                {form.icon_type === 'svg' && (
                  <div>
                    <textarea
                      value={form.icon_svg}
                      onChange={e => setField('icon_svg', e.target.value)}
                      placeholder={'<svg ...>...</svg>'}
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono resize-y"
                    />
                    {form.icon_svg && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-gray-400">预览:</span>
                        <span className="w-6 h-6 inline-block"
                          dangerouslySetInnerHTML={{ __html: form.icon_svg }} />
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? '保存中...' : editId ? '更新' : '创建'}
              </button>
              <button type="button" onClick={cancelForm}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MediaPicker ── */}
      {pickerOpen && (
        <MediaPicker
          onSelect={handleMediaSelect}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* ── Delete Dialog ── */}
      {showDelete && (
        <DeleteDialog
          cat={showDelete}
          allCats={cats}
          onClose={() => setShowDelete(null)}
          onDeleted={() => { setShowDelete(null); void load(); }}
        />
      )}

      {/* ── Category List ── */}
      <div className="space-y-2">
        {cats.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">暂无分类。点击「新增分类」开始。</div>
        )}
        {cats.map((c, idx) => (
          <div key={c.id}
            className={`bg-white border rounded-xl p-4 flex items-center gap-4 ${
              !c.is_active ? 'opacity-60 border-gray-200' : 'border-gray-200'
            }`}>

            {/* Reorder */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button disabled={idx === 0} onClick={() => reorder(c, -1)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▲</button>
              <button disabled={idx === cats.length - 1} onClick={() => reorder(c, 1)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs">▼</button>
            </div>

            {/* Icon preview */}
            <div className="w-8 h-8 flex items-center justify-center shrink-0 text-lg">
              {c.icon_type === 'emoji' && c.icon_emoji && <span>{c.icon_emoji}</span>}
              {(c.icon_type === 'image' || c.icon_type === 'gif') && c.icon_media_id && (
                <img src={`/api/public/media/${c.icon_media_id}`} alt="" className="w-7 h-7 object-contain" />
              )}
              {c.icon_type === 'svg' && c.icon_svg && (
                <span className="w-6 h-6" dangerouslySetInnerHTML={{ __html: c.icon_svg }} />
              )}
              {c.icon_type === 'none' && <span className="text-gray-300 text-xs">—</span>}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                {c.is_default && (
                  <span className="px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-medium">默认</span>
                )}
                {!c.is_active && (
                  <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">已隐藏</span>
                )}
                {(c.icon_type === 'image' || c.icon_type === 'gif') && (
                  <span className="px-1.5 py-0.5 text-xs rounded-full bg-purple-50 text-purple-600 font-mono">
                    {IMAGE_SIZE_PX[c.image_display_size as ImageDisplaySize] ?? 64}px
                  </span>
                )}
                <span className="text-xs text-gray-400 font-mono">#{c.display_order}</span>
              </div>
              <p className="font-semibold text-sm text-gray-900">{c.category_name}</p>
              <p className="text-xs text-gray-400 font-mono">{c.category_code}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {!c.is_default && (
                <button onClick={() => setDefault(c)}
                  className="px-2 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50">
                  设为默认
                </button>
              )}
              <button onClick={() => toggleActive(c)}
                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  c.is_active
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}>
                {c.is_active ? '显示中' : '已隐藏'}
              </button>
              <button onClick={() => startEdit(c)}
                className="px-2 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50">
                编辑
              </button>
              <button onClick={() => setShowDelete(c)}
                className="px-2 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50">
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        提示：新增/删除/改名后，网站与 Builder 自动同步，无需修改代码。
        Category Code 一旦创建不可更改（是 API 对接的唯一标识）。
      </p>
    </div>
  );
}
