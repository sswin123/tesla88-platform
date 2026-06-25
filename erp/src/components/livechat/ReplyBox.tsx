'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { SupportMessage, QuickReply } from '@/lib/types';

const EMOJIS = [
  '😀', '😊', '😂', '😍', '🥺', '😢', '😡', '🤔', '👍', '👎',
  '❤️', '🔥', '✅', '⚠️', '💰', '🎉', '🙏', '💪', '👋', '🤝',
];

interface PendingFile {
  file: File;
  previewUrl: string;
  messageType: 'PHOTO' | 'DOCUMENT';
}

type SendStatus = 'idle' | 'sending' | 'sent' | 'failed';

export interface ReplyBoxProps {
  sessionId: number;
  onMessageSent: (msg: SupportMessage) => void;
}

export function ReplyBox({ sessionId, onMessageSent }: ReplyBoxProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const lastPayloadRef = useRef<{ message_type: string; content: string } | null>(null);

  // Quick replies state
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuickPicker, setShowQuickPicker] = useState(false);
  const [qrSearch, setQrSearch] = useState('');
  const quickPickerRef = useRef<HTMLDivElement>(null);

  // Fetch quick replies on mount
  useEffect(() => {
    fetch('/api/livechat/quick-replies')
      .then((r) => r.ok ? r.json() : null)
      .then((d: { replies: QuickReply[] } | null) => {
        if (d?.replies) setQuickReplies(d.replies);
      })
      .catch(() => {/* silent */});
  }, []);

  // Close picker on outside click
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

  const filteredQr = quickReplies.filter(
    (r) =>
      qrSearch === '' ||
      r.title.toLowerCase().includes(qrSearch.toLowerCase()) ||
      r.body.toLowerCase().includes(qrSearch.toLowerCase())
  );

  const favorites = filteredQr.filter((r) => r.is_favorite);
  const nonFavorites = filteredQr.filter((r) => !r.is_favorite);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, type: 'PHOTO' | 'DOCUMENT') => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        setError('File too large (max 20 MB)');
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setPendingFile({ file, previewUrl, messageType: type });
      setError('');
      e.target.value = '';
    },
    [],
  );

  const handleSend = useCallback(async () => {
    if (sending) return;
    const trimmed = text.trim();
    if (!trimmed && !pendingFile) return;

    setSending(true);
    setError('');

    try {
      let body: { message_type: string; content: string };

      if (pendingFile) {
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(pendingFile.file);
        });
        body = { message_type: pendingFile.messageType, content: dataUri };
      } else {
        body = { message_type: 'TEXT', content: trimmed };
      }

      setSendStatus('sending');
      lastPayloadRef.current = { message_type: body.message_type, content: body.content };

      const r = await fetch(`/api/livechat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const d = (await r.json()) as { error?: string; message?: SupportMessage };
      if (!r.ok) {
        setError(d.error ?? 'Send failed');
        setSendStatus('failed');
        return;
      }

      if (d.message) onMessageSent(d.message);
      setSendStatus('sent');
      setTimeout(() => setSendStatus('idle'), 3000);
      setText('');
      if (pendingFile) {
        URL.revokeObjectURL(pendingFile.previewUrl);
        setPendingFile(null);
      }
      textareaRef.current?.focus();
    } catch {
      setError('Network error');
      setSendStatus('failed');
    } finally {
      setSending(false);
    }
  }, [sessionId, text, pendingFile, sending, onMessageSent]);

  const handleRetry = useCallback(() => {
    if (!lastPayloadRef.current || sendStatus !== 'failed') return;
    setSendStatus('idle');
    void handleSend();
  }, [sendStatus, handleSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="border-t bg-white p-3 flex-shrink-0">
      {/* Pending file preview */}
      {pendingFile && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-50 p-2 border">
          {pendingFile.messageType === 'PHOTO' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pendingFile.previewUrl}
              alt="preview"
              className="h-16 w-16 rounded object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded bg-gray-200 text-2xl">
              📎
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-medium">{pendingFile.file.name}</p>
            <p className="text-xs text-gray-400">
              {(pendingFile.file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            onClick={() => {
              URL.revokeObjectURL(pendingFile.previewUrl);
              setPendingFile(null);
            }}
            className="text-red-400 hover:text-red-600 text-lg leading-none"
            aria-label="Remove file"
          >
            ×
          </button>
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-2">
        <div className="relative">
          <button
            onClick={() => setShowEmoji((v) => !v)}
            className="p-1.5 rounded hover:bg-gray-100 text-lg leading-none"
            title="Emoji"
            aria-label="Open emoji picker"
          >
            😊
          </button>
          {showEmoji && (
            <div className="absolute bottom-10 left-0 z-10 flex flex-wrap gap-1 rounded-lg border bg-white p-2 shadow-lg w-48">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    setText((t) => t + emoji);
                    setShowEmoji(false);
                    textareaRef.current?.focus();
                  }}
                  className="text-xl hover:scale-125 transition-transform"
                  aria-label={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => imageInputRef.current?.click()}
          className="p-1.5 rounded hover:bg-gray-100 text-sm text-gray-600"
          title="Upload image"
          aria-label="Upload image"
        >
          🖼️
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => handleFileChange(e, 'PHOTO')}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded hover:bg-gray-100 text-sm text-gray-600"
          title="Upload file"
          aria-label="Upload file"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.zip,.docx,.mp4"
          className="hidden"
          onChange={(e) => handleFileChange(e, 'DOCUMENT')}
        />

        {/* Quick replies button */}
        <div className="relative" ref={quickPickerRef}>
          <button
            onClick={() => {
              setShowQuickPicker((v) => !v);
              setQrSearch('');
            }}
            className="p-1.5 rounded hover:bg-gray-100 text-sm text-gray-700 flex items-center gap-1"
            title="Quick replies"
            aria-label="Open quick replies picker"
          >
            <span>⚡</span>
            <span className="text-xs hidden sm:inline">Quick replies</span>
          </button>

          {showQuickPicker && (
            <>
              {/* Overlay to capture outside clicks */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowQuickPicker(false)}
              />
              <div className="absolute bottom-10 left-0 z-20 w-80 rounded-lg border bg-white shadow-xl">
                {/* Search */}
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
                      {/* Favorites section */}
                      {favorites.length > 0 && (
                        <div>
                          <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            Favorites
                          </p>
                          {favorites.map((r) => (
                            <button
                              key={r.id}
                              onClick={() => {
                                setText(r.body);
                                setShowQuickPicker(false);
                                textareaRef.current?.focus();
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
                            >
                              <p className="text-sm font-medium text-gray-800 flex items-center gap-1">
                                <span className="text-yellow-400">★</span>
                                {r.title}
                              </p>
                              <p className="text-xs text-gray-500 truncate">{r.body}</p>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Non-favorite replies */}
                      {nonFavorites.length > 0 && (
                        <div>
                          {favorites.length > 0 && (
                            <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                              All
                            </p>
                          )}
                          {nonFavorites.map((r) => (
                            <button
                              key={r.id}
                              onClick={() => {
                                setText(r.body);
                                setShowQuickPicker(false);
                                textareaRef.current?.focus();
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
                            >
                              <p className="text-sm font-medium text-gray-800">{r.title}</p>
                              <p className="text-xs text-gray-500 truncate">{r.body}</p>
                            </button>
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

        <span className="ml-auto text-xs text-gray-400">Ctrl+Enter to send</span>
      </div>

      {/* Textarea + Send button */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pendingFile ? 'Add caption (optional)…' : 'Type a message…'}
          className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          rows={3}
          disabled={sending}
        />
        <Button
          onClick={() => void handleSend()}
          disabled={sending || sendStatus === 'sending' || (!text.trim() && !pendingFile)}
          className="self-end"
        >
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>

      {sendStatus !== 'idle' && (
        <div className="flex items-center gap-2 px-1 text-xs mt-1">
          {sendStatus === 'sending' && (
            <span className="text-gray-400 animate-pulse">Sending…</span>
          )}
          {sendStatus === 'sent' && (
            <span className="text-green-600 font-medium">✓ Sent</span>
          )}
          {sendStatus === 'failed' && (
            <div className="flex items-center gap-2">
              <span className="text-red-500">✕ Failed</span>
              <button
                type="button"
                onClick={handleRetry}
                className="text-blue-500 underline hover:text-blue-700"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
