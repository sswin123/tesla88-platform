'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import type { SupportMessage } from '@/lib/types';

const EMOJIS = [
  '😀', '😊', '😂', '😍', '🥺', '😢', '😡', '🤔', '👍', '👎',
  '❤️', '🔥', '✅', '⚠️', '💰', '🎉', '🙏', '💪', '👋', '🤝',
];

interface PendingFile {
  file: File;
  previewUrl: string;
  messageType: 'PHOTO' | 'DOCUMENT';
}

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

      const r = await fetch(`/api/livechat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const d = (await r.json()) as { error?: string; message?: SupportMessage };
      if (!r.ok) {
        setError(d.error ?? 'Send failed');
        return;
      }

      if (d.message) onMessageSent(d.message);
      setText('');
      if (pendingFile) {
        URL.revokeObjectURL(pendingFile.previewUrl);
        setPendingFile(null);
      }
      textareaRef.current?.focus();
    } catch {
      setError('Network error');
    } finally {
      setSending(false);
    }
  }, [sessionId, text, pendingFile, sending, onMessageSent]);

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
          disabled={sending || (!text.trim() && !pendingFile)}
          className="self-end"
        >
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
