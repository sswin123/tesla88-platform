'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Plus, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, AlertCircle, Edit2, Trash2, Check,
  Filter, ChevronDown, Download, Upload, Eye, EyeOff, Star,
  Flame, Sparkles, Monitor, Smartphone, LayoutGrid, List,
  Save, X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GameRow {
  id: number;
  provider_id: number;
  provider_code: string;
  provider_display_name: string;
  game_code: string;
  display_name: string;
  original_name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  game_type: number;
  import_mode: string;
  launch_mode: string;
  icon_url: string | null;
  thumbnail_url: string | null;
  banner_url: string | null;
  visible: boolean;
  featured: boolean;
  recommended: boolean;
  is_active: boolean;
  is_hot: boolean;
  is_new: boolean;
  is_maintenance: boolean;
  desktop_supported: boolean;
  mobile_supported: boolean;
  sort_order: number;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GameListResponse {
  games: GameRow[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

interface Provider { id: number; code: string; display_name: string }
interface Category { id: number; code: string; name: string; icon: string | null; is_active: boolean }

// ── Constants ─────────────────────────────────────────────────────────────────

const LAUNCH_MODES = ['LOBBY','DIRECT','EXTERNAL','DOWNLOAD','COMING_SOON'] as const;
const LAUNCH_MODE_LABELS: Record<string, string> = {
  LOBBY: 'Lobby', DIRECT: 'Direct', EXTERNAL: 'External',
  DOWNLOAD: 'Download', COMING_SOON: 'Coming Soon',
};
const LAUNCH_MODE_COLORS: Record<string, string> = {
  LOBBY:       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  DIRECT:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  EXTERNAL:    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  DOWNLOAD:    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  COMING_SOON: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};
const IMPORT_MODE_COLORS: Record<string, string> = {
  API:    'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  MANUAL: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

// ── Small Components ──────────────────────────────────────────────────────────

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium animate-in slide-in-from-bottom-2
      ${ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
      {ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

function Badge({ text, className }: { text: string; className: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${className}`}>{text}</span>;
}

function Pill({ on, label, className }: { on: boolean; label: string; className?: string }) {
  return on
    ? <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${className ?? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>{label}</span>
    : null;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Edit Game Dialog ──────────────────────────────────────────────────────────

function EditGameDialog({
  game, categories, onSave, onClose,
}: {
  game: GameRow | null; // null = create new
  categories: Category[];
  onSave: (data: Record<string, unknown>, id?: number) => Promise<void>;
  onClose: () => void;
}) {
  const isNew = !game;

  const [providerCode, setProviderCode] = useState('');
  const [gameCode,     setGameCode]     = useState(game?.game_code ?? '');
  const [name,         setName]         = useState(game?.original_name ?? '');
  const [displayName,  setDisplayName]  = useState(game?.display_name !== game?.original_name ? (game?.display_name ?? '') : '');
  const [description,  setDescription]  = useState(game?.description ?? '');
  const [category,     setCategory]     = useState(game?.category ?? 'slot');
  const [launchMode,   setLaunchMode]   = useState(game?.launch_mode ?? 'DIRECT');
  const [iconUrl,      setIconUrl]      = useState(game?.icon_url ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState(game?.thumbnail_url ?? '');
  const [sortOrder,    setSortOrder]    = useState(String(game?.sort_order ?? 0));

  const [visible,     setVisible]     = useState(game?.visible     ?? true);
  const [isActive,    setIsActive]    = useState(game?.is_active   ?? true);
  const [isHot,       setIsHot]       = useState(game?.is_hot      ?? false);
  const [isNew2,      setIsNew2]      = useState(game?.is_new      ?? false);
  const [featured,    setFeatured]    = useState(game?.featured    ?? false);
  const [recommended, setRecommended] = useState(game?.recommended ?? false);
  const [isMaint,     setIsMaint]     = useState(game?.is_maintenance ?? false);
  const [desktop,     setDesktop]     = useState(game?.desktop_supported ?? true);
  const [mobile,      setMobile]      = useState(game?.mobile_supported  ?? true);

  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        name, display_name: displayName || null, description: description || null,
        category, launch_mode: launchMode,
        icon_url: iconUrl || null, thumbnail_url: thumbnailUrl || null,
        visible, is_active: isActive, is_hot: isHot, is_new: isNew2,
        featured, recommended, is_maintenance: isMaint,
        desktop_supported: desktop, mobile_supported: mobile,
        sort_order: parseInt(sortOrder, 10) || 0,
      };
      if (isNew) {
        data.provider_code = providerCode.toUpperCase();
        data.game_code = gameCode;
      }
      await onSave(data, game?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow mt-0.5 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </label>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {isNew ? '新增游戏' : `编辑 — ${game?.display_name ?? game?.original_name}`}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={e => void handleSubmit(e)} className="p-6 space-y-5">
          {isNew && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Provider Code *</label>
                <input required value={providerCode} onChange={e => setProviderCode(e.target.value.toUpperCase())}
                  placeholder="918KISS"
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Game Code *</label>
                <input required value={gameCode} onChange={e => setGameCode(e.target.value)}
                  placeholder="BOYKING"
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">游戏名称（原始）*</label>
              <input required value={name} onChange={e => setName(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">显示名称（覆盖）</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="留空则用原始名称"
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">描述</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">分类</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {categories.filter(c => c.is_active).map(c => (
                  <option key={c.code} value={c.code}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">启动模式</label>
              <select value={launchMode} onChange={e => setLaunchMode(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {LAUNCH_MODES.map(m => <option key={m} value={m}>{LAUNCH_MODE_LABELS[m]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">排列顺序</label>
              <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} min={0}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Icon URL</label>
              <input value={iconUrl} onChange={e => setIconUrl(e.target.value)} placeholder="https://..."
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Thumbnail URL</label>
              <input value={thumbnailUrl} onChange={e => setThumbnailUrl(e.target.value)} placeholder="https://..."
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
            </div>
          </div>

          {/* Flags grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4">
            <ToggleRow label="显示 (Visible)" checked={visible} onChange={setVisible} />
            <ToggleRow label="启用 (Active)" checked={isActive} onChange={setIsActive} />
            <ToggleRow label="🔥 热门 (Hot)" checked={isHot} onChange={setIsHot} />
            <ToggleRow label="🆕 最新 (New)" checked={isNew2} onChange={setIsNew2} />
            <ToggleRow label="⭐ 精选 (Featured)" checked={featured} onChange={setFeatured} />
            <ToggleRow label="👍 推荐 (Recommended)" checked={recommended} onChange={setRecommended} />
            <ToggleRow label="🔧 维护中 (Maintenance)" checked={isMaint} onChange={setIsMaint} />
            <ToggleRow label="🖥️ Desktop" checked={desktop} onChange={setDesktop} />
            <ToggleRow label="📱 Mobile" checked={mobile} onChange={setMobile} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
              取消
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 保存中…</> : <><Save className="w-4 h-4" /> 保存</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Category Manager Dialog ───────────────────────────────────────────────────

function CategoryManagerDialog({ categories, onRefresh, onClose }: {
  categories: Category[];
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [saving, setSaving]   = useState(false);

  async function handleCreate() {
    if (!newCode || !newName) return;
    setSaving(true);
    try {
      await fetch('/api/games/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode, name: newName, icon: newIcon || null }),
      });
      setNewCode(''); setNewName(''); setNewIcon('');
      onRefresh();
    } finally { setSaving(false); }
  }

  async function toggleActive(cat: Category) {
    await fetch(`/api/games/categories/${cat.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !cat.is_active }),
    });
    onRefresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">游戏分类管理</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Existing categories */}
          <div className="space-y-1">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{cat.icon ?? '🎮'}</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{cat.name}</span>
                  <span className="text-xs text-slate-400 font-mono">{cat.code}</span>
                </div>
                <button onClick={() => void toggleActive(cat)}
                  className={`text-xs px-2 py-0.5 rounded font-medium ${cat.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                  {cat.is_active ? '启用' : '停用'}
                </button>
              </div>
            ))}
          </div>
          {/* Add new */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">添加新分类</p>
            <div className="flex gap-2">
              <input value={newIcon} onChange={e => setNewIcon(e.target.value)} placeholder="🎮" maxLength={4}
                className="w-14 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2 text-center" />
              <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="code"
                className="w-24 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2 font-mono" />
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="分类名称"
                className="flex-1 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2" />
              <button onClick={() => void handleCreate()} disabled={saving || !newCode || !newName}
                className="flex items-center gap-1 px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} 添加
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GamesLibraryPage() {
  const [games,      setGames]      = useState<GameRow[]>([]);
  const [total,      setTotal]      = useState(0);
  const [pages,      setPages]      = useState(1);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [providers,  setProviders]  = useState<Provider[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  // Filters
  const [search,       setSearch]       = useState('');
  const [filterProv,   setFilterProv]   = useState('');
  const [filterCat,    setFilterCat]    = useState('');
  const [filterImport, setFilterImport] = useState('');
  const [filterLaunch, setFilterLaunch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy,       setSortBy]       = useState('sort_order');

  // Selection & bulk
  const [selected,     setSelected]     = useState<Set<number>>(new Set());
  const [bulkAction,   setBulkAction]   = useState('');
  const [bulkBusy,     setBulkBusy]     = useState(false);

  // Dialogs
  const [editGame,     setEditGame]     = useState<GameRow | 'new' | null>(null);
  const [showCatMgr,   setShowCatMgr]   = useState(false);

  const [viewMode,     setViewMode]     = useState<'table' | 'grid'>('table');

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const fetchGames = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(p), limit: '50', sort: sortBy });
      if (search)       sp.set('search', search);
      if (filterProv)   sp.set('provider_code', filterProv);
      if (filterCat)    sp.set('category', filterCat);
      if (filterImport) sp.set('import_mode', filterImport);
      if (filterLaunch) sp.set('launch_mode', filterLaunch);
      if (filterStatus) sp.set('status', filterStatus);

      const res = await fetch(`/api/games/library?${sp}`);
      const data = await res.json() as GameListResponse;
      setGames(data.games); setTotal(data.total); setPages(data.pages);
    } finally { setLoading(false); }
  }, [page, search, filterProv, filterCat, filterImport, filterLaunch, filterStatus, sortBy]);

  const fetchMeta = useCallback(async () => {
    const [pRes, cRes] = await Promise.all([
      fetch('/api/games/settings'),
      fetch('/api/games/categories'),
    ]);
    if (pRes.ok) {
      const d = await pRes.json() as { providers: Provider[] };
      setProviders(d.providers ?? []);
    }
    if (cRes.ok) {
      const d = await cRes.json() as Category[];
      setCategories(d);
    }
  }, []);

  useEffect(() => { void fetchMeta(); }, [fetchMeta]);
  useEffect(() => { void fetchGames(1); setPage(1); setSelected(new Set()); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, filterProv, filterCat, filterImport, filterLaunch, filterStatus, sortBy]);
  useEffect(() => { void fetchGames(page); }, [page, fetchGames]);

  function handleSearchChange(v: string) {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => setSearch(v), 350);
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────

  async function handleBulk() {
    if (!bulkAction || selected.size === 0) return;
    setBulkBusy(true);
    try {
      const r = await fetch('/api/games/library/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: bulkAction, ids: [...selected] }),
      });
      const d = await r.json() as { ok?: boolean; affected?: number; error?: string };
      if (d.ok) {
        showToast(`操作成功，影响 ${d.affected} 条记录`, true);
        setSelected(new Set()); setBulkAction('');
        void fetchGames(page);
      } else {
        showToast(d.error ?? '操作失败', false);
      }
    } finally { setBulkBusy(false); }
  }

  // ── Save game (create or update) ──────────────────────────────────────────

  async function handleSaveGame(data: Record<string, unknown>, id?: number) {
    if (id) {
      const r = await fetch(`/api/games/library/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) { showToast('游戏已更新', true); void fetchGames(page); }
      else throw new Error(d.error ?? 'Update failed');
    } else {
      const r = await fetch('/api/games/library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const d = await r.json() as { ok?: boolean; id?: number; error?: string };
      if (d.ok) { showToast('游戏已创建', true); void fetchGames(1); setPage(1); }
      else throw new Error(d.error ?? 'Create failed');
    }
  }

  // ── Quick toggle ──────────────────────────────────────────────────────────

  async function quickToggle(id: number, field: string, current: boolean) {
    await fetch(`/api/games/library/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !current }),
    });
    setGames(prev => prev.map(g => g.id === id ? { ...g, [field]: !current } : g));
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: number, name: string) {
    if (!confirm(`确认删除游戏「${name}」？此操作不可撤销。`)) return;
    const r = await fetch(`/api/games/library/${id}`, { method: 'DELETE' });
    const d = await r.json() as { ok?: boolean; error?: string };
    if (d.ok) { showToast('已删除', true); void fetchGames(page); }
    else showToast(d.error ?? '删除失败', false);
  }

  // ── Selection helpers ─────────────────────────────────────────────────────

  function toggleSelect(id: number) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function toggleSelectAll() {
    setSelected(prev =>
      prev.size === games.length ? new Set() : new Set(games.map(g => g.id)),
    );
  }

  const allSelected = games.length > 0 && selected.size === games.length;

  // ── Render ────────────────────────────────────────────────────────────────

  const catMap = Object.fromEntries(categories.map(c => [c.code, c]));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Games Library</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            共 <span className="font-semibold text-slate-700 dark:text-slate-300">{total}</span> 个游戏，
            来自 <span className="font-semibold text-slate-700 dark:text-slate-300">{providers.length}</span> 个 Provider
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCatMgr(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Filter className="w-3.5 h-3.5" /> 分类管理
          </button>
          <button onClick={() => void fetchGames(page)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </button>
          <button onClick={() => setEditGame('new')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            <Plus className="w-4 h-4" /> 手动添加游戏
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="搜索游戏名称…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select value={filterProv} onChange={e => setFilterProv(e.target.value)}
          className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">所有 Provider</option>
          {providers.map(p => <option key={p.code} value={p.code}>{p.code} — {p.display_name}</option>)}
        </select>

        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">所有分类</option>
          {categories.map(c => <option key={c.code} value={c.code}>{c.icon} {c.name}</option>)}
        </select>

        <select value={filterImport} onChange={e => setFilterImport(e.target.value)}
          className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">所有来源</option>
          <option value="API">API 同步</option>
          <option value="MANUAL">手动添加</option>
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">所有状态</option>
          <option value="active">正常</option>
          <option value="inactive">停用</option>
          <option value="maintenance">维护中</option>
        </select>

        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="sort_order">排序: 顺序</option>
          <option value="name">排序: 名称</option>
          <option value="created_at">排序: 最新</option>
          <option value="updated_at">排序: 最近更新</option>
        </select>

        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-400'}`}>
            <List className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-400'}`}>
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">已选 {selected.size} 个游戏</span>
          <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
            className="text-sm rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-800 px-2 py-1.5 focus:outline-none">
            <option value="">选择批量操作…</option>
            <option value="enable">批量启用</option>
            <option value="disable">批量停用</option>
            <option value="maintenance">设为维护中</option>
            <option value="unmaintenance">取消维护</option>
            <option value="hot_on">设为热门</option>
            <option value="hot_off">取消热门</option>
            <option value="new_on">设为新游戏</option>
            <option value="new_off">取消新游戏</option>
            <option value="featured_on">设为精选</option>
            <option value="featured_off">取消精选</option>
            <option value="delete">批量删除</option>
          </select>
          <button onClick={() => void handleBulk()} disabled={!bulkAction || bulkBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} 执行
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-blue-500 hover:text-blue-700">清除选择</button>
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  </th>
                  <th className="px-4 py-3 text-left">游戏</th>
                  <th className="px-4 py-3 text-left">Provider</th>
                  <th className="px-4 py-3 text-left">分类</th>
                  <th className="px-4 py-3 text-left">模式</th>
                  <th className="px-4 py-3 text-left">标签</th>
                  <th className="px-4 py-3 text-left">状态</th>
                  <th className="px-4 py-3 text-left">平台</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading && !games.length && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
                )}
                {!loading && !games.length && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">暂无游戏记录</td></tr>
                )}
                {games.map(g => (
                  <tr key={g.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${selected.has(g.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelect(g.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {(g.icon_url || g.thumbnail_url) ? (
                          <img src={g.thumbnail_url ?? g.icon_url ?? ''} alt={g.display_name}
                            className="w-9 h-9 rounded-lg object-cover bg-slate-100" onError={e => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-xs font-bold">
                            {(g.display_name ?? g.original_name).slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100 leading-tight">{g.display_name}</div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">{g.game_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{g.provider_code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {catMap[g.category]?.icon ?? '🎮'} {catMap[g.category]?.name ?? g.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Badge text={LAUNCH_MODE_LABELS[g.launch_mode] ?? g.launch_mode} className={LAUNCH_MODE_COLORS[g.launch_mode] ?? 'bg-slate-100 text-slate-600'} />
                        <Badge text={g.import_mode} className={IMPORT_MODE_COLORS[g.import_mode] ?? 'bg-slate-100 text-slate-600'} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Pill on={g.is_hot} label="🔥" className="bg-red-100 text-red-600" />
                        <Pill on={g.is_new} label="🆕" className="bg-blue-100 text-blue-600" />
                        <Pill on={g.featured} label="⭐" className="bg-yellow-100 text-yellow-700" />
                        <Pill on={g.recommended} label="👍" className="bg-purple-100 text-purple-600" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => void quickToggle(g.id, 'is_active', g.is_active)}
                        className={`text-xs px-2 py-0.5 rounded font-semibold transition-colors ${g.is_maintenance ? 'bg-amber-100 text-amber-700' : g.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {g.is_maintenance ? '维护' : g.is_active ? '正常' : '停用'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {g.desktop_supported && <Monitor className="w-3.5 h-3.5 text-slate-400" />}
                        {g.mobile_supported  && <Smartphone className="w-3.5 h-3.5 text-slate-400" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditGame(g)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {g.import_mode === 'MANUAL' && (
                          <button onClick={() => void handleDelete(g.id, g.display_name)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {loading && !games.length && Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse aspect-[3/4]" />
          ))}
          {games.map(g => (
            <div key={g.id} onClick={() => setEditGame(g)}
              className={`relative cursor-pointer rounded-xl border overflow-hidden hover:shadow-md transition-shadow
                ${selected.has(g.id) ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-200 dark:border-slate-700'}`}>
              {/* Thumbnail */}
              <div className="aspect-[3/4] bg-slate-100 dark:bg-slate-800 relative">
                {(g.thumbnail_url || g.icon_url) ? (
                  <img src={g.thumbnail_url ?? g.icon_url ?? ''} alt={g.display_name}
                    className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl text-slate-300">🎮</div>
                )}
                {/* Status overlay */}
                {(!g.is_active || g.is_maintenance) && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-xs text-white font-semibold">{g.is_maintenance ? '维护中' : '停用'}</span>
                  </div>
                )}
                {/* Tags */}
                <div className="absolute top-1.5 right-1.5 flex flex-col gap-0.5">
                  {g.is_hot      && <span className="text-xs bg-red-500 text-white rounded px-1 font-bold">HOT</span>}
                  {g.is_new      && <span className="text-xs bg-blue-500 text-white rounded px-1 font-bold">NEW</span>}
                  {g.featured    && <span className="text-xs bg-yellow-500 text-white rounded px-1 font-bold">⭐</span>}
                </div>
                {/* Select checkbox */}
                <div className="absolute top-1.5 left-1.5" onClick={e => { e.stopPropagation(); toggleSelect(g.id); }}>
                  <input type="checkbox" checked={selected.has(g.id)} onChange={() => {}}
                    className="rounded border-white shadow" />
                </div>
              </div>
              {/* Info */}
              <div className="p-2 bg-white dark:bg-slate-900">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">{g.display_name}</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{g.provider_code}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">第 {page}/{pages} 页，共 {total} 条</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, pages) }, (_, i) => {
              const pg = page <= 3 ? i + 1 : page - 2 + i;
              if (pg < 1 || pg > pages) return null;
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className={`w-9 h-9 rounded-lg text-sm ${pg === page ? 'bg-blue-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                  {pg}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      {editGame !== null && (
        <EditGameDialog
          game={editGame === 'new' ? null : editGame}
          categories={categories}
          onSave={handleSaveGame}
          onClose={() => setEditGame(null)}
        />
      )}
      {showCatMgr && (
        <CategoryManagerDialog
          categories={categories}
          onRefresh={() => { void fetchMeta(); }}
          onClose={() => setShowCatMgr(false)}
        />
      )}

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}
