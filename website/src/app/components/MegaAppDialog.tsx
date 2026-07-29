'use client';
import { useState, useEffect } from 'react';

interface MegaAppDialogProps {
  loginId:             string;
  password:            string;
  launchUrl:           string;
  downloadUrlAndroid:  string | null;
  downloadUrlIos:      string | null;
  onClose:             () => void;
}

function detectDownloadUrl(android: string | null, ios: string | null): string | null {
  if (typeof navigator === 'undefined') return android ?? ios;
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return ios ?? android;
  return android ?? ios;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable — try fallback
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <button
      onClick={() => void handleCopy()}
      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
      style={{
        background: copied ? '#16a34a' : 'var(--brand-primary)',
        color:      '#fff',
        minWidth:   '52px',
      }}
    >
      {copied ? '✓' : 'Copy'}
    </button>
  );
}

export function MegaAppDialog({
  loginId,
  password,
  launchUrl,
  downloadUrlAndroid,
  downloadUrlIos,
  onClose,
}: MegaAppDialogProps) {
  const downloadUrl = detectDownloadUrl(downloadUrlAndroid, downloadUrlIos);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="MEGA888 游戏凭证"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-sm mx-0 sm:mx-4 rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8"
        style={{ background: 'var(--bg-card, var(--bg-surface, #1a1b2e))', zIndex: 1 }}
      >
        {/* Drag handle (mobile) */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full sm:hidden"
          style={{ background: 'var(--bg-surface2, rgba(255,255,255,0.12))' }}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-sm transition-opacity hover:opacity-70"
          style={{ background: 'var(--bg-surface2, rgba(255,255,255,0.1))', color: 'var(--text-muted, #888)' }}
          aria-label="关闭"
        >
          ✕
        </button>

        {/* Title */}
        <div className="text-center mb-5">
          <h3
            className="text-xl font-bold mb-1"
            style={{ color: 'var(--text-base, #fff)' }}
          >
            MEGA888
          </h3>
          <p
            className="text-xs"
            style={{ color: 'var(--text-muted, #888)' }}
          >
            Sila Muat Turun MEGA888 Untuk Main
          </p>
        </div>

        {/* Credential rows */}
        <div className="flex flex-col gap-3 mb-6">
          {/* Username */}
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--bg-surface2, rgba(255,255,255,0.06))' }}
          >
            <div className="flex-1 min-w-0">
              <p
                className="text-xs mb-0.5"
                style={{ color: 'var(--text-muted, #888)' }}
              >
                Username
              </p>
              <p
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--text-base, #fff)', fontVariantNumeric: 'tabular-nums' }}
              >
                {loginId}
              </p>
            </div>
            <CopyButton text={loginId} />
          </div>

          {/* Password */}
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--bg-surface2, rgba(255,255,255,0.06))' }}
          >
            <div className="flex-1 min-w-0">
              <p
                className="text-xs mb-0.5"
                style={{ color: 'var(--text-muted, #888)' }}
              >
                Password
              </p>
              <p
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--text-base, #fff)', fontVariantNumeric: 'tabular-nums' }}
              >
                {password}
              </p>
            </div>
            <CopyButton text={password} />
          </div>
        </div>

        {/* Action buttons */}
        <div className={`flex gap-3 ${!downloadUrl ? 'justify-center' : ''}`}>
          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-center transition-opacity hover:opacity-80"
              style={{
                background: 'var(--bg-surface2, rgba(255,255,255,0.1))',
                color:      'var(--text-base, #fff)',
                display:    'block',
              }}
            >
              下载 APP
            </a>
          )}
          <a
            href={launchUrl}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-center transition-opacity hover:opacity-90"
            style={{
              background:  'var(--brand-primary, #7c3aed)',
              color:       '#fff',
              boxShadow:   '0 4px 20px color-mix(in srgb, var(--brand-primary, #7c3aed) 35%, transparent)',
              display:     'block',
            }}
          >
            立即游戏
          </a>
        </div>
      </div>
    </div>
  );
}
