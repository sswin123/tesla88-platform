'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { SupportMessage, QuickReply } from '@/lib/types';

const EMOJIS = [
  '😀', '😊', '😂', '😍', '🥺', '😢', '😡', '🤔', '👍', '👎',
  '❤️', '🔥', '✅', '⚠️', '💰', '🎉', '🙏', '💪', '👋', '🤝',
];

// Detect message type from MIME — single source of truth, no hardcoded extension lists.
function getMsgType(file: File): 'PHOTO' | 'VIDEO' | 'DOCUMENT' {
  if (file.type.startsWith('image/')) return 'PHOTO';
  if (file.type.startsWith('video/')) return 'VIDEO';
  return 'DOCUMENT';
}

function getPreviewIcon(type: 'PHOTO' | 'VIDEO' | 'DOCUMENT', fileName: string): string {
  if (type === 'PHOTO') return '🖼️';
  if (type === 'VIDEO') return '🎬';
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    pdf: '📄', zip: '📦', rar: '📦', '7z': '📦', apk: '📦', ipa: '📦',
    exe: '📦', dmg: '📦', mp3: '🎵', wav: '🎵', aac: '🎵', ogg: '🎵',
  };
  return icons[ext] ?? '📎';
}

interface PendingFile {
  file: File;
  previewUrl: string;
  messageType: 'PHOTO' | 'VIDEO' | 'DOCUMENT';
}

type SendStatus = 'idle' | 'sending' | 'sent' | 'failed';

export interface ReplyBoxProps {
  sessionId: number;
  onMessageSent: (msg: SupportMessage) => void;
  externalFile?: File | null;
  onExternalFileConsumed?: () => void;
}

export function ReplyBox({ sessionId, onMessageSent, externalFile, onExternalFileConsumed }: ReplyBoxProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [error, setError] = useState('');
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0); // tracks nested dragenter/dragleave pairs

  // Quick replies state
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuickPicker, setShowQuickPicker] = useState(false);
  const [qrSearch, setQrSearch] = useState('');
  const quickPickerRef = useRef<HTMLDivElement>(null);

  // ── Load quick replies once ─────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/livechat/quick-replies')
      .then((r) => r.ok ? r.json() : null)
      .then((d: { replies: QuickReply[] } | null) => {
        if (d?.replies) setQuickReplies(d.replies);
      })
      .catch(() => {/* silent */});
  }, []);

  // ── Close quick picker on outside click ────────────────────────────────────
  useEffect(() => {
    if (!showQuickPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (quickPickerRef.current && !quickPickerRef.current.contains(e.target as Node)) {
        setShowQuickPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showQuickPicker]);

  // ── Load draft when session changes ────────────────────────────────────────
  useEffect(() => {
    setText(localStorage.getItem(`draft_${sessionId}`) ?? '');
  }, [sessionId]);

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 6 * 24)}px`; // cap at ~6 lines
  }, []);

  useEffect(() => { adjustHeight(); }, [text, adjustHeight]);

  // ── Core file processor ────────────────────────────────────────────────────
  const processFile = useCallback((file: File) => {
    if (file.size > 50 * 1024 * 1024) { setError('File too large (max 50 MB)'); return; }
    if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl);
    const messageType = getMsgType(file);
    setPendingFile({ file, previewUrl: URL.createObjectURL(file), messageType });
    setError('');
  }, [pendingFile]);

  // ── Consume external drop (from panel-level drag handler in LiveChatClient) ─
  useEffect(() => {
    if (!externalFile) return;
    processFile(externalFile);
    onExternalFileConsumed?.();
  }, [externalFile, processFile, onExternalFileConsumed]);

  // ── Global Ctrl+V paste ────────────────────────────────────────────────────
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const fileItem = items.find((item) => item.kind === 'file');
      if (!fileItem) return; // plain text: let browser handle it
      e.preventDefault();
      const file = fileItem.getAsFile();
      if (file) processFile(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processFile]);

  // ── Core send helper ──────────────────────────────────────────────────────
  const dispatchSend = useCallback(
    async (payload: {
      message_type: string;
      content: string;
      caption?: string | null;
      file_name?: string | null;
      file_size?: number | null;
      quick_reply_id?: number;
      quick_reply_used?: boolean;
    }) => {
      setSending(true);
      setSendStatus('sending');
      setError('');
      try {
        const r = await fetch(`/api/livechat/sessions/${sessionId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const d = (await r.json()) as { error?: string; message?: SupportMessage };
        if (!r.ok) {
          setError(d.error ?? 'Send failed');
          setSendStatus('failed');
          return false;
        }
        if (d.message) onMessageSent(d.message);
        setSendStatus('sent');
        setTimeout(() => setSendStatus('idle'), 3000);
        return true;
      } catch {
        setError('Network error');
        setSendStatus('failed');
        return false;
      } finally {
        setSending(false);
      }
    },
    [sessionId, onMessageSent]
  );

  // ── Normal send (text or file+caption) ───────────────────────────────────
  const handleSend = useCallback(async () => {
    if (sending) return;
    const trimmed = text.trim();
    if (!trimmed && !pendingFile) return;

    if (pendingFile) {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(pendingFile.file);
      });
      const ok = await dispatchSend({
        message_type: pendingFile.messageType,
        content: dataUri,
        caption: trimmed || null,
        file_name: pendingFile.file.name,
        file_size: pendingFile.file.size,
      });
      if (ok) {
        URL.revokeObjectURL(pendingFile.previewUrl);
        setPendingFile(null);
        setText('');
        localStorage.removeItem(`draft_${sessionId}`);
      }
    } else {
      const ok = await dispatchSend({ message_type: 'TEXT', content: trimmed });
      if (ok) {
        setText('');
        localStorage.removeItem(`draft_${sessionId}`);
      }
    }
    textareaRef.current?.focus();
  }, [sending, text, pendingFile, dispatchSend, sessionId]);

  // ── Quick reply: always sends immediately ─────────────────────────────────
  const handleQuickReply = useCallback(
    async (qr: QuickReply) => {
      if (sending) return;
      setShowQuickPicker(false);
      await dispatchSend({ quick_reply_id: qr.id, quick_reply_used: true, message_type: '', content: '' });
      textareaRef.current?.focus();
    },
    [sending, dispatchSend]
  );

  // ── File input change ─────────────────────────────────────────────────────
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  // ── Text change + draft save ──────────────────────────────────────────────
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    if (val) localStorage.setItem(`draft_${sessionId}`, val);
    else localStorage.removeItem(`draft_${sessionId}`);
  };

  // ── Enter = send, Shift+Enter = new line ──────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // ── Local drag & drop (on the ReplyBox container itself) ──────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDragOver(false); }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const filteredQr = quickReplies.filter(
    (r) =>
      qrSearch === '' ||
      r.title.toLowerCase().includes(qrSearch.toLowerCase()) ||
      r.body.toLowerCase().includes(qrSearch.toLowerCase())
  );
  const favorites    = filteredQr.filter((r) => r.is_favorite);
  const nonFavorites = filteredQr.filter((r) => !r.is_favorite);

  return (
    <div
      className={`border-t bg-white p-3 flex-shrink-0 relative transition-colors ${isDragOver ? 'bg-blue-50 border-blue-300' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-over overlay hint */}
      {isDragOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded bg-blue-50/90 border-2 border-dashed border-blue-400 pointer-events-none">
          <p className="text-blue-600 font-medium text-sm">Drop file to attach</p>
        </div>
      )}

      {/* Pending file preview */}
      {pendingFile && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-50 p-2 border">
          {pendingFile.messageType === 'PHOTO' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingFile.previewUrl} alt="preview" className="h-16 w-16 rounded object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded bg-gray-200 text-2xl">
              {getPreviewIcon(pendingFile.messageType, pendingFile.file.name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-medium">{pendingFile.file.name}</p>
            <p className="text-xs text-gray-400">{(pendingFile.file.size / 1024).toFixed(1)} KB</p>
          </div>
          <button
            onClick={() => { URL.revokeObjectURL(pendingFile.previewUrl); setPendingFile(null); }}
            className="text-red-400 hover:text-red-600 text-lg leading-none"
            aria-label="Remove file"
          >×</button>
        </div>
      )}

      {/* Upload progress */}
      {sendStatus === 'sending' && (
        <div className="mb-2 h-1 w-full rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full animate-pulse w-full" />
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-2">
        {/* Emoji picker */}
        <div className="relative">
          <button
            onClick={() => setShowEmoji((v) => !v)}
            className="p-1.5 rounded hover:bg-gray-100 text-lg leading-none"
            title="Emoji" aria-label="Open emoji picker"
          >😊</button>
          {showEmoji && (
            <div className="absolute bottom-10 left-0 z-10 flex flex-wrap gap-1 rounded-lg border bg-white p-2 shadow-lg w-48">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { setText((t) => t + emoji); setShowEmoji(false); textareaRef.current?.focus(); }}
                  className="text-xl hover:scale-125 transition-transform"
                  aria-label={emoji}
                >{emoji}</button>
              ))}
            </div>
          )}
        </div>

        {/* Universal file upload (all types) */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded hover:bg-gray-100 text-sm text-gray-600"
          title="Upload file (image/video/document)"
          aria-label="Upload file"
        >📎</button>
        <input ref={fileInputRef} type="file" accept="*/*" className="hidden" onChange={handleFileChange} />

        {/* Quick replies picker */}
        <div className="relative" ref={quickPickerRef}>
          <button
            onClick={() => { setShowQuickPicker((v) => !v); setQrSearch(''); }}
            className="p-1.5 rounded hover:bg-gray-100 text-sm text-gray-700 flex items-center gap-1"
            title="Quick replies" aria-label="Open quick replies picker"
          >
            <span>⚡</span>
            <span className="text-xs hidden sm:inline">Quick replies</span>
          </button>

          {showQuickPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowQuickPicker(false)} />
              <div className="absolute bottom-10 left-0 z-20 w-80 rounded-lg border bg-white shadow-xl">
                <div className="p-2 border-b">
                  <input
                    type="text"
                    placeholder="Search quick replies…"
                    value={qrSearch}
                    onChange={(e) => setQrSearch(e.target.value)}
                    autoFocus
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {filteredQr.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 py-4">No replies found</p>
                  ) : (
                    <>
                      {favorites.length > 0 && (
                        <div>
                          <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Favorites</p>
                          {favorites.map((r) => (
                            <QuickReplyItem key={r.id} reply={r} onSelect={() => void handleQuickReply(r)} />
                          ))}
                        </div>
                      )}
                      {nonFavorites.length > 0 && (
                        <div>
                          {favorites.length > 0 && (
                            <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">All</p>
                          )}
                          {nonFavorites.map((r) => (
                            <QuickReplyItem key={r.id} reply={r} onSelect={() => void handleQuickReply(r)} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">
          Enter to send · Shift+Enter for new line
        </span>
      </div>

      {/* Textarea + Send */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={pendingFile ? 'Add caption (optional)…' : 'Type a message… (Ctrl+V to paste file)'}
          className="flex-1 resize-none overflow-hidden rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 min-h-[40px]"
          style={{ height: '40px' }}
          rows={1}
          disabled={sending}
        />
        <Button
          onClick={() => void handleSend()}
          disabled={sending || sendStatus === 'sending' || (!text.trim() && !pendingFile)}
          className="self-end shrink-0"
        >
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>

      {sendStatus !== 'idle' && (
        <div className="flex items-center gap-2 px-1 text-xs mt-1">
          {sendStatus === 'sent'    && <span className="text-green-600 font-medium">✓ Sent</span>}
          {sendStatus === 'failed'  && (
            <div className="flex items-center gap-2">
              <span className="text-red-500">✕ Failed</span>
              <button type="button" onClick={() => { setSendStatus('idle'); void handleSend(); }}
                className="text-blue-500 underline hover:text-blue-700">Retry</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Quick reply list item ─────────────────────────────────────────────────────

const CONTENT_TYPE_ICON: Record<string, string> = {
  TEXT: '💬', PHOTO: '🖼️', VIDEO: '🎬', DOCUMENT: '📎',
};

function QuickReplyItem({ reply, onSelect }: { reply: QuickReply; onSelect: () => void }) {
  const icon = CONTENT_TYPE_ICON[reply.content_type] ?? '💬';
  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
    >
      <p className="text-sm font-medium text-gray-800 flex items-center gap-1">
        {reply.is_favorite && <span className="text-yellow-400">★</span>}
        <span>{icon}</span>
        {reply.title}
      </p>
      {reply.body && (
        <p className="text-xs text-gray-500 truncate">{reply.body}</p>
      )}
    </button>
  );
}
