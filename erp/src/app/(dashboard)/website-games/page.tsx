'use client';
import { useEffect, useState } from 'react';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';
import type { WebsiteGame } from '@/lib/types';

interface Provider { id: number; provider_name: string; }
interface GameCategory { id: number; category_code: string; category_name: string; }

interface FormState {
  game_name:          string;
  game_code:          string;
  provider_id:        string;
  category:           string;
  category_id:        number | null;
  thumbnail_media_id: number | null;
  banner_media_id:    number | null;
  is_hot:             boolean;
  is_new:             boolean;
  is_active:          boolean;
  display_order:      string;
}

const BLANK: FormState = {
  game_name: '', game_code: '', provider_id: '',
  category: 'slot', category_id: null,
  thumbnail_media_id: null, banner_media_id: null,
  is_hot: false, is_new: false, is_active: true, display_order: '0',
};

function gameToForm(g: WebsiteGame): FormState {
  return {
    game_name:          g.game_name,
    game_code:          g.game_code,
    provider_id:        g.provider_id !== null ? String(g.provider_id) : '',
    category:           g.category,
    category_id:        g.category_id ?? null,
    thumbnail_media_id: g.thumbnail_media_id,
    banner_media_id:    g.banner_media_id,
    is_hot:             g.is_hot,
    is_new:             g.is_new,
    is_active:          g.is_active,
    display_order:      String(g.display_order),
  };
}

export default function WebsiteGamesPage() {
  const [games, setGames]         = useState<WebsiteGame[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [categories, setCategories] = useState<GameCategory[]>([]);
  const [editId, setEditId]       = useState<number | null>(null);
  const [form, setForm]           = useState<FormState>(BLANK);
  const [showForm, setShowForm]   = useState(false);
  const [pickerFor, setPickerFor] = useState<'thumbnail' | 'banner' | null>(null);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');

  async function load(signal?: AbortSignal) {
    const opts = signal ? { signal } : {};
    const [gRes, pRes, cRes] = await Promise.all([
      fetch('/api/website/games', opts).catch(() => null),
      fetch('/api/website/game-providers', opts).catch(() => null),
      fetch('/api/website/lobby-categories', opts).catch(() => null),
    ]);
    if (signal?.aborted) return;
    if (gRes?.ok) setGames(await gRes.json() as WebsiteGame[]);
    if (pRes?.ok) setProviders(await pRes.json() as Provider[]);
    if (cRes?.ok) setCategories(await cRes.json() as GameCategory[]);
  }

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, []);

  function startCreate() {
    setEditId(null); setForm(BLANK);
    setShowForm(true); setMsg(''); setError('');
  }

  function startEdit(g: WebsiteGame) {
    setEditId(g.id); setForm(gameToForm(g));
    setShowForm(true); setMsg(''); setError('');
  }

  function cancelForm() { setShowForm(false); setEditId(null); }

  function setField(key: keyof FormState, value: string | boolean | number | null) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleMediaSelect(field: 'thumbnail_media_id' | 'banner_media_id', m: MediaRecord | MediaRecord[]) {
    const picked = Array.isArray(m) ? m[0] : m;
    if (picked) setField(field, picked.id);
    setPickerFor(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');

    const selectedCat = categories.find(c => c.id === form.category_id);
    const body = {
      game_name:          form.game_name.trim(),
      game_code:          form.game_code.trim() || undefined,
      provider_id:        form.provider_id ? parseInt(form.provider_id) : null,
      category:           selectedCat?.category_code ?? form.category,
      category_id:        form.category_id,
      thumbnail_media_id: form.thumbnail_media_id,
      banner_media_id:    form.banner_media_id,
      is_hot:             form.is_hot,
      is_new:             form.is_new,
      is_active:          form.is_active,
      display_order:      parseInt(form.display_order) || 0,
    };

    const url    = editId ? `/api/website/games/${editId}` : '/api/website/games';
    const method = editId ? 'PATCH' : 'POST';

    const saveCtrl = new AbortController();
    const timeout = setTimeout(() => saveCtrl.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        signal: saveCtrl.signal,
      });
    } catch {
      setSaving(false);
      setError('请求超时或网络错误，请重试');
      return;
    } finally {
      clearTimeout(timeout);
    }
    setSaving(false);

    if (res.ok) {
      setMsg(editId ? '游戏已更新' : '游戏已创建');
      setShowForm(false); setEditId(null);
      void load();
    } else {
      const d = await res.json() as { error: string };
      setError(d.error ?? '保存失败');
    }
  }

  async function toggleActive(g: WebsiteGame) {
    await fetch(`/api/website/games/${g.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !g.is_active }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function toggleHot(g: WebsiteGame) {
    await fetch(`/api/website/games/${g.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_hot: !g.is_hot }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function reorder(g: WebsiteGame, dir: -1 | 1) {
    await fetch(`/api/website/games/${g.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ display_order: g.display_order + dir }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function remove(g: WebsiteGame) {
    if (!confirm(`删除游戏 "${g.game_name}"?`)) return;
    await fetch(`/api/website/games/${g.id}`, { method: 'DELETE' });
    void load();
  }

  const filtered = search.trim()
    ? games.filter(g =>
        g.game_name.toLowerCase().includes(search.toLowerCase()) ||
        g.game_code.toLowerCase().includes(search.toLowerCase()) ||
        (g.provider_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : games;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">游戏库 Website Games</h1>
          <p className="text-sm text-gray-500 mt-1">手动添加游戏供 Game Lobby Builder 使用</p>
        </div>
        <button onClick={startCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          + 添加游戏
        </button>
      </div>

      {msg   && <div className="mb-4 text-green-700 text-sm bg-green-50 border border-green-200 rounded p-3">{msg}</div>}
      {error && <div className="mb-4 text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}

      {/* ── Form ── */}
      {showForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold mb-4">
            {editId ? '编辑游戏' : '新增游戏'}
          </h2>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">游戏名称 *</label>
                <input
                  value={form.game_name} onChange={e => setField('game_name', e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="水果老虎机"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">游戏代码 <span className="text-gray-400">(留空自动生成)</span></label>
                <input
                  value={form.game_code} onChange={e => setField('game_code', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="fruit-slot-001"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">所属平台 (Provider)</label>
                <select value={form.provider_id}
                  onChange={e => setField('provider_id', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">— 无 —</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.provider_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">游戏类型</label>
                <select
                  value={form.category_id ?? ''}
                  onChange={e => {
                    const id = e.target.value ? parseInt(e.target.value) : null;
                    setField('category_id', id);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">— 选择类型 —</option>
                  {categories.filter(c => c.category_code !== 'all' && c.category_code !== 'hot').map(c => (
                    <option key={c.id} value={c.id}>{c.category_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">排序</label>
                <input type="text" inputMode="numeric" value={form.display_order}
                  onChange={e => setField('display_order', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>

              {/* Thumbnail */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">缩略图 (Thumbnail)</label>
                <div className="flex items-center gap-2">
                  {form.thumbnail_media_id && (
                    <img src={`/api/public/media/${form.thumbnail_media_id}`}
                      alt="" className="h-10 w-10 object-cover rounded border" />
                  )}
                  <button type="button" onClick={() => setPickerFor('thumbnail')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    {form.thumbnail_media_id ? `Media #${form.thumbnail_media_id}` : '选择图片'}
                  </button>
                  {form.thumbnail_media_id && (
                    <button type="button" onClick={() => setField('thumbnail_media_id', null)}
                      className="text-xs text-red-500 hover:underline">清除</button>
                  )}
                </div>
              </div>

              {/* Banner */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">横幅 (Banner)</label>
                <div className="flex items-center gap-2">
                  {form.banner_media_id && (
                    <img src={`/api/public/media/${form.banner_media_id}`}
                      alt="" className="h-10 w-16 object-cover rounded border" />
                  )}
                  <button type="button" onClick={() => setPickerFor('banner')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    {form.banner_media_id ? `Media #${form.banner_media_id}` : '选择图片'}
                  </button>
                  {form.banner_media_id && (
                    <button type="button" onClick={() => setField('banner_media_id', null)}
                      className="text-xs text-red-500 hover:underline">清除</button>
                  )}
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6 col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_hot}
                    onChange={e => setField('is_hot', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-sm font-medium text-gray-700">🔥 HOT</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_new}
                    onChange={e => setField('is_new', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-sm font-medium text-gray-700">🆕 NEW</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active}
                    onChange={e => setField('is_active', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-sm font-medium text-gray-700">显示中</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
              <button type="button" onClick={cancelForm}
                className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Media Picker ── */}
      {pickerFor && (
        <MediaPicker
          onSelect={(m) => handleMediaSelect(pickerFor === 'thumbnail' ? 'thumbnail_media_id' : 'banner_media_id', m)}
          onClose={() => setPickerFor(null)}
        />
      )}

      {/* ── Search ── */}
      <div className="mb-4">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索游戏名 / 代码 / 平台..."
          className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <span className="ml-3 text-xs text-gray-400">共 {filtered.length} 款游戏</span>
      </div>

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">游戏</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">平台</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">排序</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(g => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {g.thumbnail_media_id ? (
                      <img src={`/api/public/media/${g.thumbnail_media_id}`}
                        alt={g.game_name}
                        className="h-10 w-8 object-cover rounded border flex-shrink-0" />
                    ) : (
                      <div className="h-10 w-8 rounded border bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">🎮</div>
                    )}
                    <div>
                      <div className="font-medium text-gray-900">{g.game_name}</div>
                      <div className="text-xs text-gray-400">{g.game_code}</div>
                    </div>
                    {g.is_hot && <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-600">HOT</span>}
                    {g.is_new && !g.is_hot && <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">NEW</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{g.provider_name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {categories.find(c => c.id === g.category_id)?.category_name ?? g.category}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(g)}
                    className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      g.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>
                    {g.is_active ? '显示中' : '已停用'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-600 w-8 text-center">{g.display_order}</span>
                    <button onClick={() => reorder(g, -1)}
                      className="p-0.5 text-gray-400 hover:text-gray-700">▲</button>
                    <button onClick={() => reorder(g, 1)}
                      className="p-0.5 text-gray-400 hover:text-gray-700">▼</button>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => toggleHot(g)}
                      className={`text-xs px-2 py-1 rounded ${g.is_hot ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'} hover:opacity-80`}>
                      🔥
                    </button>
                    <button onClick={() => startEdit(g)}
                      className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100">
                      编辑
                    </button>
                    <button onClick={() => remove(g)}
                      className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100">
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  {search ? `没有找到"${search}"相关游戏` : '还没有游戏。点击"添加游戏"开始。'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
