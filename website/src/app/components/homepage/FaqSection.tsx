'use client';

import { useState } from 'react';

interface FaqItem { q: string; a: string; }
interface FaqConfig { title?: string; items?: FaqItem[]; }

export default function FaqSection({ config }: { config: FaqConfig }) {
  const { title = '常见问题', items = [] } = config;
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>{title}</h2>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)' }}
          >
            <button
              className="w-full text-left px-4 py-3 flex items-center justify-between gap-2"
              onClick={() => setOpen(open === i ? null : i)}
            >
              <span className="text-sm font-medium" style={{ color: 'var(--text-base)' }}>{item.q}</span>
              <span
                className="text-lg flex-shrink-0 transition-transform duration-200"
                style={{ color: 'var(--brand-primary)', transform: open === i ? 'rotate(45deg)' : 'none' }}
              >+</span>
            </button>
            {open === i && (
              <div className="px-4 pb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                {item.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
