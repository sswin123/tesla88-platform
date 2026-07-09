'use client';

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 text-center px-4">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border-mid)' }}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ color: 'var(--text-muted)' }}
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
        </svg>
      </div>

      <div className="space-y-2 max-w-xs">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-base)' }}>
          暂时无法连接
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          请检查您的网络连接，然后重试。
        </p>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="casino-btn-primary px-6 py-3 text-sm"
      >
        重新连接
      </button>

      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
        如需帮助，请联系在线客服
      </p>
    </div>
  );
}
