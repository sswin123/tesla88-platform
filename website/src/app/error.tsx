'use client';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-4">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
        style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
      >
        ⚠️
      </div>

      <div className="space-y-2 max-w-sm">
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-base)' }}>
          页面出现错误
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          抱歉，页面遇到了问题。请重试或联系在线客服。
        </p>
        {error.digest && (
          <p className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>
            错误代码：{error.digest}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="casino-btn-primary px-5 py-2.5 text-sm"
        >
          重新加载
        </button>
        <a
          href="/"
          className="casino-btn-outline px-5 py-2.5 text-sm"
          style={{ display: 'inline-block' }}
        >
          返回首页
        </a>
      </div>
    </div>
  );
}
