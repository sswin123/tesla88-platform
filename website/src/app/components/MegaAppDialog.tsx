'use client';
import { useState, useEffect, useRef } from 'react';

interface MegaAppDialogProps {
  loginId:             string | null;  // null while credentials are loading
  password:            string | null;  // null while credentials are loading
  launchUrl:           string | null;  // null while loading; disables "Main Sekarang"
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
      {copied ? '✓' : 'COPY'}
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
  const isLoading = loginId === null || password === null || launchUrl === null;
  const downloadUrl = detectDownloadUrl(downloadUrlAndroid, downloadUrlIos);
  const [launching, setLaunching]           = useState(false);
  const [showAppNotDetected, setShowAppNotDetected] = useState(false);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leftRef   = useRef(false);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent scroll while open; clear timer on unmount
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handlePlay = () => {
    if (launching || !launchUrl) return;
    setLaunching(true);
    leftRef.current = false;

    const markLeft = () => { leftRef.current = true; };
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') leftRef.current = true;
    };

    window.addEventListener('pagehide',         markLeft,    { once: true });
    window.addEventListener('blur',             markLeft,    { once: true });
    window.addEventListener('visibilitychange', onVisChange);

    window.location.href = launchUrl!;

    timerRef.current = setTimeout(() => {
      window.removeEventListener('pagehide',         markLeft);
      window.removeEventListener('blur',             markLeft);
      window.removeEventListener('visibilitychange', onVisChange);
      setLaunching(false);

      if (!leftRef.current) {
        // App did not open — show "not detected" modal and auto-redirect to download
        setShowAppNotDetected(true);
        if (downloadUrl) {
          setTimeout(() => { window.location.href = downloadUrl; }, 3000);
        }
      }
    }, 1200);
  };

  return (
    <>
      {/* "App not detected" overlay — z-[60] sits above the main dialog (z-50) */}
      {showAppNotDetected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-label="App not detected"
        >
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.82)' }}
            onClick={() => setShowAppNotDetected(false)}
            aria-hidden="true"
          />
          <div
            className="relative w-full max-w-xs rounded-2xl px-6 py-7 text-center"
            style={{ background: 'var(--bg-card, var(--bg-surface, #1a1b2e))' }}
          >
            <div className="text-4xl mb-3">📱</div>
            <h4 className="text-base font-bold mb-2" style={{ color: 'var(--text-base, #fff)' }}>
              MEGA888 App not detected.
            </h4>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted, #aaa)', lineHeight: 1.6 }}>
              Please download the app first.
            </p>
            {downloadUrl && (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded-xl text-sm font-bold mb-2"
                style={{ background: 'var(--brand-primary)', color: '#fff' }}
              >
                Muat Turun Sekarang
              </a>
            )}
            <button
              onClick={() => setShowAppNotDetected(false)}
              className="text-xs mt-1"
              style={{ color: 'var(--text-faint, #666)' }}
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Main credential dialog */}
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
                  Login ID
                </p>
                {loginId === null ? (
                  <div className="h-4 w-28 rounded animate-pulse" style={{ background: 'var(--bg-surface2, rgba(255,255,255,0.12))' }} />
                ) : (
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: 'var(--brand-primary, #f59e0b)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {loginId}
                  </p>
                )}
              </div>
              {loginId !== null && <CopyButton text={loginId} />}
            </div>

            {/* Password */}
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'var(--bg-surface2, rgba(255,255,255,0.06))' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted, #888)' }}>
                  Password
                </p>
                {password === null ? (
                  <div className="h-4 w-24 rounded animate-pulse" style={{ background: 'var(--bg-surface2, rgba(255,255,255,0.12))' }} />
                ) : (
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: 'var(--brand-primary, #f59e0b)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {password}
                  </p>
                )}
              </div>
              {password !== null && <CopyButton text={password} />}
            </div>
          </div>

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
              <span
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-center"
                style={{
                  background: 'var(--bg-surface2, rgba(255,255,255,0.06))',
                  color:      'var(--text-faint, #666)',
                }}
              >
                Muat Turun
              </span>
            )}
            <button
              onClick={handlePlay}
              disabled={isLoading || launching}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-center transition-opacity hover:opacity-90"
              style={{
                background: 'transparent',
                color:      (isLoading || launching) ? 'var(--text-muted, #aaa)' : 'var(--text-base, #fff)',
                border:     (isLoading || launching)
                  ? '2px solid var(--bg-surface2, rgba(255,255,255,0.2))'
                  : '2px solid var(--text-base, rgba(255,255,255,0.6))',
                cursor: (isLoading || launching) ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading ? (
                <svg className="inline w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : launching ? '…' : 'Main Sekarang'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
