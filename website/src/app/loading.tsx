export default function Loading() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] gap-6"
      aria-label="加载中"
    >
      {/* Animated casino chip / spinner */}
      <div className="relative w-16 h-16">
        <div
          className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--brand-primary) transparent transparent transparent' }}
        />
        <div
          className="absolute inset-2 rounded-full"
          style={{
            background: 'radial-gradient(circle, var(--bg-surface2) 60%, var(--brand-primary) 100%)',
            opacity: 0.6,
          }}
        />
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
          加载中…
        </p>
      </div>

      {/* Animated pulse bar */}
      <div
        className="w-32 h-1 rounded-full overflow-hidden"
        style={{ background: 'var(--bg-surface2)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))',
            animation: 'pulse-bar 1.4s ease-in-out infinite',
            width: '40%',
          }}
        />
      </div>

      <style>{`
        @keyframes pulse-bar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}
