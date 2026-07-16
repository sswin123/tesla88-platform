import Link from 'next/link';

interface BtnItem {
  text: string;
  url:  string;
  color?: string;
}

interface ButtonGroupConfig {
  title?:   string;
  buttons?: BtnItem[];
}

export default function ButtonGroupSection({ config }: { config: ButtonGroupConfig }) {
  const { title, buttons = [] } = config;
  if (buttons.length === 0) return null;
  return (
    <section className="space-y-3">
      {title && (
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>{title}</h2>
      )}
      <div className="flex flex-wrap gap-3">
        {buttons.map((btn, i) => (
          <Link
            key={i}
            href={btn.url || '#'}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{
              background: btn.color || 'var(--brand-primary)',
              color: '#fff',
            }}
          >
            {btn.text}
          </Link>
        ))}
      </div>
    </section>
  );
}
