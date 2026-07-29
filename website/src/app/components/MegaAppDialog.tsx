'use client';
import { useState, useEffect, useRef } from 'react';

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
      {copied ? '✓' : 'SALIN'}
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
  const [showDownloadHint, setShowDownloadHint] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return () => {
      document.body.style.overflow = prev;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Try opening the deep link; if app is not installed the browser stays on this page
  const handlePlay = () => {
    window.location.href = launchUrl;
    // After 2.2s, if we're still here (page didn't navigate away), the app isn't installed
    timerRef.current = setTimeout(() => {
      setShowDownloadHint(true);
    }, 2200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
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

      {/* Dialog */}
      <div
        className="relative w-full max-w-sm rounded-3xl px-6 pt-6 pb-8 overflow-y-auto"
        style={{ background: 'var(--bg-card, var(--bg-surface, #1a1b2e))', zIndex: 1, maxHeight: '90dvh' }}
      >

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
        <div className="flex flex-col gap-3 mb-5">
          {/* Username */}
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--bg-surface2, rgba(255,255,255,0.06))' }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted, #888)' }}>
                Username
              </p>
              <p
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--brand-primary, #f59e0b)', fontVariantNumeric: 'tabular-nums' }}
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
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted, #888)' }}>
                Kata Laluan
              </p>
              <p
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--brand-primary, #f59e0b)', fontVariantNumeric: 'tabular-nums' }}
              >
                {password}
              </p>
            </div>
            <CopyButton text={password} />
          </div>
        </div>

        {/* Download hint — shown after deeplink fails */}
        {showDownloadHint && (
          <div
            className="mb-4 px-4 py-3 rounded-xl text-xs text-center"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', lineHeight: 1.6 }}
          >
            未检测到 MEGA888 APP。
            {downloadUrl ? (
              <>
                {' '}请先
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#f59e0b', fontWeight: 700, textDecoration: 'underline' }}
                >
                  下载 APP
                </a>
                后再登录。
              </>
            ) : (
              ' 请先下载 MEGA888 APP 后再点击游戏。'
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {downloadUrl ? (
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
              Muat Turun
            </a>
          ) : (
            <button
              onClick={() => setShowDownloadHint(true)}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-center transition-opacity hover:opacity-80"
              style={{
                background: 'var(--bg-surface2, rgba(255,255,255,0.1))',
                color:      'var(--text-muted, #aaa)',
              }}
            >
              Muat Turun
            </button>
          )}
          <button
            onClick={handlePlay}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-center transition-opacity hover:opacity-90"
            style={{
              background: 'transparent',
              color:      'var(--text-base, #fff)',
              border:     '2px solid var(--text-base, rgba(255,255,255,0.6))',
            }}
          >
            Main Sekarang
          </button>
        </div>
      </div>
    </div>
  );
}
