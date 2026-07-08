'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface BotMessage {
  message_key: string;
  category: string;
  description: string;
  language_code: string;
  content: string;
  seed_content: string;
  updated_by: string | null;
  updated_at: string;
  translation_id: number;
}

interface HistoryRow {
  id: number;
  translation_id: number;
  language_code: string;
  old_content: string;
  changed_by: string | null;
  changed_at: string;
}

interface BotButton {
  id: number;
  group_key: string;
  label: string;
  language_code: string;
  is_active: boolean;
  row_order: number;
  column_order: number;
  updated_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES = ['WELCOME','REGISTER','DEPOSIT','WITHDRAW','GAME','PROMOTION','SUPPORT','HISTORY','BUTTON','PROFILE'];
const LANGUAGES  = ['zh', 'en'];

// ── Helpers ────────────────────────────────────────────────────────────────

function extractVariables(content: string): string[] {
  const matches = Array.from(content.matchAll(/\{(\w+)(?:[^}]*)?\}/g));
  const vars = new Set(matches.map((m) => m[1]));
  return Array.from(vars);
}

function applyPreview(content: string, vals: Record<string, string>): string {
  return content.replace(/\{(\w+)(?:[^}]*)?\}/g, (_, name: string) =>
    vals[name] !== undefined ? vals[name] : `{${name}}`
  );
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }); }
  catch { return iso; }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Toast({ msg, ok, onClose }: { msg: string; ok: boolean; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${ok ? 'bg-green-600' : 'bg-red-600'}`}>
      {msg}
    </div>
  );
}

// ── Editor Panel ───────────────────────────────────────────────────────────

function EditorPanel({
  msg,
  onSaved,
  onClose,
}: {
  msg: BotMessage;
  onSaved: (key: string, lang: string, content: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab]         = useState<'edit' | 'history'>('edit');
  const [content, setContent] = useState(msg.content);
  const [saving, setSaving]   = useState(false);
  const [resetting, setResetting] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [previewVals, setPreviewVals] = useState<Record<string, string>>({});
  const [flash, setFlash]     = useState<string | null>(null);

  const variables = extractVariables(content);

  useEffect(() => {
    setContent(msg.content);
    setPreviewVals({});
    setTab('edit');
    setHistory(null);
    setFlash(null);
  }, [msg.message_key, msg.language_code]);

  const loadHistory = useCallback(async () => {
    if (histLoading) return;
    setHistLoading(true);
    const r = await fetch(`/api/bot/messages/${encodeURIComponent(msg.message_key)}/history?language=${msg.language_code}`);
    if (r.ok) {
      const d = await r.json() as { history: HistoryRow[] };
      setHistory(d.history);
    }
    setHistLoading(false);
  }, [msg.message_key, msg.language_code, histLoading]);

  useEffect(() => {
    if (tab === 'history' && history === null) void loadHistory();
  }, [tab, history, loadHistory]);

  const save = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const r = await fetch(`/api/bot/messages/${encodeURIComponent(msg.message_key)}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ language_code: msg.language_code, content }),
    });
    setSaving(false);
    if (r.ok) {
      setFlash('已保存，Bot 缓存将在 10 秒内更新。');
      onSaved(msg.message_key, msg.language_code, content);
      setHistory(null);
    } else {
      setFlash('保存失败，请重试。');
    }
  };

  const reset = async () => {
    if (!confirm('确认恢复默认内容？')) return;
    setResetting(true);
    const r = await fetch(`/api/bot/messages/${encodeURIComponent(msg.message_key)}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ language_code: msg.language_code, reset: true }),
    });
    setResetting(false);
    if (r.ok) {
      setContent(msg.seed_content);
      setFlash('已恢复默认内容。');
      onSaved(msg.message_key, msg.language_code, msg.seed_content);
      setHistory(null);
    }
  };

  const restore = async (histId: number, oldContent: string) => {
    if (!confirm('确认恢复该历史版本？')) return;
    const r = await fetch(`/api/bot/messages/${encodeURIComponent(msg.message_key)}/restore`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ history_id: histId }),
    });
    if (r.ok) {
      setContent(oldContent);
      setTab('edit');
      setFlash('历史版本已恢复。');
      onSaved(msg.message_key, msg.language_code, oldContent);
      setHistory(null);
    }
  };

  const preview = applyPreview(content, previewVals);

  return (
    <div className="flex h-full flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <p className="font-mono text-sm font-semibold text-gray-800">{msg.message_key}</p>
          <p className="text-xs text-gray-500">{msg.category} · {msg.language_code.toUpperCase()}</p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['edit', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'edit' ? '编辑' : '历史记录'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'edit' ? (
          <div className="space-y-4">
            {/* Description */}
            <p className="text-xs text-gray-400">{msg.description}</p>

            {/* Content textarea */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">消息内容</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-gray-300 p-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Variables */}
            {variables.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">预览变量</label>
                <div className="space-y-1">
                  {variables.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">{`{${v}}`}</span>
                      <input
                        type="text"
                        placeholder={v}
                        value={previewVals[v] ?? ''}
                        onChange={(e) => setPreviewVals((p) => ({ ...p, [v]: e.target.value }))}
                        className="flex-1 rounded border border-gray-200 px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live Preview */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">实时预览</label>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">{preview}</pre>
              </div>
            </div>

            {/* Updated info */}
            {msg.updated_by && (
              <p className="text-xs text-gray-400">
                上次修改：{msg.updated_by} · {fmtDate(msg.updated_at)}
              </p>
            )}

            {flash && <p className="rounded bg-blue-50 p-2 text-xs text-blue-700">{flash}</p>}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => void save()}
                disabled={saving || !content.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? '保存中…' : '保存'}
              </button>
              <button
                onClick={() => void reset()}
                disabled={resetting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                恢复默认
              </button>
            </div>
          </div>
        ) : (
          /* History tab */
          <div className="space-y-2">
            {histLoading && <p className="text-sm text-gray-400">加载中…</p>}
            {history !== null && history.length === 0 && (
              <p className="text-sm text-gray-400">暂无历史记录。</p>
            )}
            {history?.map((h) => (
              <div key={h.id} className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {h.changed_by ?? '(系统)'} · {fmtDate(h.changed_at)}
                  </span>
                  <button
                    onClick={() => void restore(h.id, h.old_content)}
                    className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
                  >
                    恢复
                  </button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs text-gray-700 line-clamp-3">{h.old_content}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Buttons Tab ────────────────────────────────────────────────────────────

function ButtonsTab() {
  const [buttons, setButtons]     = useState<BotButton[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState<Record<number, string>>({});
  const [saving, setSaving]       = useState<number | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/bot/buttons');
    if (r.ok) {
      const d = await r.json() as { buttons: BotButton[] };
      setButtons(d.buttons);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flash = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const saveLabel = async (btn: BotButton) => {
    const label = editing[btn.id] ?? btn.label;
    setSaving(btn.id);
    const r = await fetch(`/api/bot/buttons/${btn.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ label }),
    });
    setSaving(null);
    if (r.ok) {
      setButtons((prev) => prev.map((b) => b.id === btn.id ? { ...b, label } : b));
      setEditing((p) => { const c = { ...p }; delete c[btn.id]; return c; });
      flash('已保存', true);
    } else {
      flash('保存失败', false);
    }
  };

  const toggleActive = async (btn: BotButton) => {
    const r = await fetch(`/api/bot/buttons/${btn.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_active: !btn.is_active }),
    });
    if (r.ok) {
      setButtons((prev) => prev.map((b) => b.id === btn.id ? { ...b, is_active: !b.is_active } : b));
      flash(!btn.is_active ? '按钮已启用' : '按钮已禁用', true);
    }
  };

  // Group buttons by group_key
  const groups = Array.from(new Set(buttons.map((b) => b.group_key)));

  return (
    <div className="p-4">
      {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
      {loading ? (
        <p className="text-sm text-gray-400">加载中…</p>
      ) : (
        <div className="space-y-6">
          {groups.map((gk) => (
            <div key={gk}>
              <h3 className="mb-2 font-mono text-sm font-semibold text-gray-700">{gk}</h3>
              <div className="overflow-hidden rounded-md border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">位置</th>
                      <th className="px-3 py-2 text-left">按钮文字</th>
                      <th className="px-3 py-2 text-left">语言</th>
                      <th className="px-3 py-2 text-left">状态</th>
                      <th className="px-3 py-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {buttons
                      .filter((b) => b.group_key === gk)
                      .map((btn) => (
                        <tr key={btn.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">
                            R{btn.row_order}·C{btn.column_order}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={editing[btn.id] ?? btn.label}
                              onChange={(e) => setEditing((p) => ({ ...p, [btn.id]: e.target.value }))}
                              className="w-full rounded border border-transparent px-1 py-0.5 text-sm hover:border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {btn.language_code.toUpperCase()}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => void toggleActive(btn)}
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${btn.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                            >
                              {btn.is_active ? '启用' : '禁用'}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            {editing[btn.id] !== undefined && editing[btn.id] !== btn.label && (
                              <button
                                onClick={() => void saveLabel(btn)}
                                disabled={saving === btn.id}
                                className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-60"
                              >
                                {saving === btn.id ? '…' : '保存'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function BotMessagesPage() {
  const [tab, setTab]             = useState<'messages' | 'buttons'>('messages');
  const [messages, setMessages]   = useState<BotMessage[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<BotMessage | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  // Filters
  const [catFilter, setCatFilter]   = useState('');
  const [langFilter, setLangFilter] = useState('zh');
  const [search, setSearch]         = useState('');

  const flash = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (catFilter)  params.set('category', catFilter);
    if (langFilter) params.set('language', langFilter);
    if (search)     params.set('search',   search);
    const r = await fetch(`/api/bot/messages?${params.toString()}`);
    if (r.ok) {
      const d = await r.json() as { messages: BotMessage[] };
      setMessages(d.messages);
      // keep selection in sync
      setSelected((prev) => prev
        ? (d.messages.find((m) => m.message_key === prev.message_key && m.language_code === prev.language_code) ?? null)
        : null
      );
    }
    setLoading(false);
  }, [catFilter, langFilter, search]);

  useEffect(() => { void loadMessages(); }, [loadMessages]);

  const handleSaved = (key: string, lang: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((m) => m.message_key === key && m.language_code === lang
        ? { ...m, content: newContent }
        : m
      )
    );
    flash('消息已更新，Bot 将在 10 秒内加载新内容。', true);
  };

  const catLabel = (cat: string) => cat.charAt(0) + cat.slice(1).toLowerCase();

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}

      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Bot 消息管理</h1>
        <p className="mt-0.5 text-sm text-gray-500">编辑 Telegram Bot 的所有用户消息，无需修改代码。</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-6">
        {(['messages', 'buttons'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`mr-4 pb-3 pt-3 text-sm font-medium border-b-2 ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'messages' ? '消息列表' : 'Telegram 按钮'}
          </button>
        ))}
      </div>

      {tab === 'buttons' ? (
        <div className="flex-1 overflow-y-auto">
          <ButtonsTab />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel: filter + list */}
          <div className={`flex flex-col ${selected ? 'w-1/2' : 'w-full'} overflow-hidden`}>
            {/* Filter bar */}
            <div className="flex flex-wrap gap-2 border-b border-gray-200 bg-white px-4 py-3">
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部分类</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{catLabel(c)}</option>
                ))}
              </select>
              <select
                value={langFilter}
                onChange={(e) => setLangFilter(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部语言</option>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l.toUpperCase()}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="搜索 key 或内容…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="self-center text-xs text-gray-400">{messages.length} 条</span>
            </div>

            {/* Message table */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-20 text-sm text-gray-400">加载中…</div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-sm text-gray-400">没有找到匹配的消息。</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Key</th>
                      <th className="px-4 py-2 text-left font-medium">分类</th>
                      <th className="px-4 py-2 text-left font-medium">内容预览</th>
                      <th className="px-4 py-2 text-left font-medium">语言</th>
                      <th className="px-4 py-2 text-left font-medium">更新时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {messages.map((m) => {
                      const isSelected = selected?.message_key === m.message_key && selected?.language_code === m.language_code;
                      return (
                        <tr
                          key={`${m.message_key}-${m.language_code}`}
                          onClick={() => setSelected(isSelected ? null : m)}
                          className={`cursor-pointer hover:bg-blue-50 ${isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}`}
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{m.message_key}</td>
                          <td className="px-4 py-2.5">
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                              {catLabel(m.category)}
                            </span>
                          </td>
                          <td className="max-w-xs px-4 py-2.5 text-gray-600">
                            <p className="truncate">{m.content.replace(/\n/g, ' ')}</p>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">{m.language_code.toUpperCase()}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">
                            {m.updated_by ? fmtDate(m.updated_at) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right panel: editor */}
          {selected && (
            <div className="w-1/2 overflow-hidden border-l border-gray-200">
              <EditorPanel
                msg={selected}
                onSaved={handleSaved}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
