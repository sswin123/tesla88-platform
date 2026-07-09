'use client';
import { useState, useEffect } from 'react';

interface Transaction {
  id: string;
  user: string;
  type: '存款' | '提款' | '红利';
  amount: number;
  ts: number;
}

const POOL: Array<Omit<Transaction, 'id' | 'ts'>> = [
  { user: '****789', type: '存款', amount: 500  },
  { user: '****234', type: '提款', amount: 1200 },
  { user: '****567', type: '存款', amount: 200  },
  { user: '****890', type: '红利', amount: 100  },
  { user: '****123', type: '存款', amount: 300  },
  { user: '****456', type: '提款', amount: 800  },
  { user: '****012', type: '存款', amount: 1000 },
  { user: '****345', type: '红利', amount: 50   },
  { user: '****678', type: '存款', amount: 150  },
  { user: '****901', type: '提款', amount: 600  },
  { user: '****321', type: '存款', amount: 2000 },
  { user: '****654', type: '红利', amount: 200  },
];

function relativeTime(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}秒前`;
  return `${Math.floor(s / 60)}分钟前`;
}

function buildFeed(): Transaction[] {
  return [...POOL]
    .sort(() => Math.random() - 0.5)
    .slice(0, 6)
    .map((t, i) => ({
      ...t,
      id: `${i}-${Date.now()}`,
      ts: Date.now() - Math.floor(Math.random() * 90_000),
    }));
}

function typeColor(type: Transaction['type']) {
  if (type === '存款') return '#22c55e';
  if (type === '提款') return '#f97316';
  return 'var(--brand-primary)';
}

interface Props {
  transactions?: Transaction[];
}

export default function LiveTransaction({ transactions }: Props) {
  const [feed, setFeed] = useState<Transaction[]>(() => buildFeed());
  const [, setTick] = useState(0);

  useEffect(() => {
    if (transactions) return;
    const timer = setInterval(() => {
      const src = POOL[Math.floor(Math.random() * POOL.length)];
      setFeed(prev => [
        { ...src, id: `${Date.now()}`, ts: Date.now() },
        ...prev.slice(0, 5),
      ]);
    }, 3500);
    return () => clearInterval(timer);
  }, [transactions]);

  /* Refresh relative timestamps every 15s */
  useEffect(() => {
    const timer = setInterval(() => setTick(n => n + 1), 15_000);
    return () => clearInterval(timer);
  }, []);

  const data = transactions ?? feed;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>
          实时动态
        </h2>
        <span
          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full bg-current"
            style={{ animation: 'pulse 2s infinite' }}
          />
          直播
        </span>
      </div>

      <div className="casino-card overflow-hidden">
        {data.map((t, i) => (
          <div
            key={t.id}
            className="flex items-center justify-between px-4 py-3"
            style={{
              borderBottom: i < data.length - 1 ? '1px solid var(--border-dim)' : 'none',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'var(--bg-surface3)', color: 'var(--text-muted)' }}
              >
                {t.user.slice(-2)}
              </div>
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--text-base)' }}>
                  用户 {t.user}
                </span>
                <span
                  className="ml-2 text-xs font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: `${typeColor(t.type)}1a`,
                    color: typeColor(t.type),
                  }}
                >
                  {t.type}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold" style={{ color: typeColor(t.type) }}>
                RM {t.amount.toLocaleString()}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {relativeTime(t.ts)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
