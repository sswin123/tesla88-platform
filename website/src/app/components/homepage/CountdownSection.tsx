'use client';

import { useState, useEffect } from 'react';

interface CountdownConfig {
  title?:       string;
  target_date?: string;
  text_color?:  string;
  bg_color?:    string;
}

interface TimeLeft { days: number; hours: number; minutes: number; seconds: number; }

function calcTimeLeft(target: string): TimeLeft | null {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000)  / 60_000),
    seconds: Math.floor((diff % 60_000)     / 1_000),
  };
}

function Pad({ v, label }: { v: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-black tabular-nums"
        style={{ background: 'rgba(255,255,255,0.08)' }}
      >
        {String(v).padStart(2, '0')}
      </div>
      <span className="text-[10px] uppercase tracking-wider opacity-60">{label}</span>
    </div>
  );
}

export default function CountdownSection({ config }: { config: CountdownConfig }) {
  const { title = '距活动结束', target_date, text_color, bg_color } = config;
  const [left, setLeft] = useState<TimeLeft | null>(() =>
    target_date ? calcTimeLeft(target_date) : null
  );

  useEffect(() => {
    if (!target_date) return;
    const id = setInterval(() => setLeft(calcTimeLeft(target_date)), 1_000);
    return () => clearInterval(id);
  }, [target_date]);

  if (!target_date) return null;

  return (
    <section
      className="rounded-xl p-4 flex flex-col items-center gap-4"
      style={{ background: bg_color || 'var(--bg-card)', color: text_color || 'var(--text-base)' }}
    >
      <h2 className="text-base font-semibold">{title}</h2>
      {left ? (
        <div className="flex items-start gap-3">
          <Pad v={left.days}    label="天" />
          <span className="text-2xl font-black pt-3 opacity-50">:</span>
          <Pad v={left.hours}   label="时" />
          <span className="text-2xl font-black pt-3 opacity-50">:</span>
          <Pad v={left.minutes} label="分" />
          <span className="text-2xl font-black pt-3 opacity-50">:</span>
          <Pad v={left.seconds} label="秒" />
        </div>
      ) : (
        <p className="text-sm opacity-60">活动已结束</p>
      )}
    </section>
  );
}
