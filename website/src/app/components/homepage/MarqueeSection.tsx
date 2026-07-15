'use client';

import { useRef, useEffect } from 'react';

interface MarqueeConfig {
  messages: string[];
  speed: number;
  color: string;
  bg_color?: string;
  icon?: string;
}

export default function MarqueeSection({ config }: { config: MarqueeConfig }) {
  const { messages = [], speed = 40, color = '#f59e0b', bg_color = '', icon = '📢' } = config;
  const ref = useRef<HTMLDivElement>(null);

  // CSS animation speed: we set animation-duration based on content width / speed
  const text = messages.join('   ·   ');
  if (!text.trim()) return null;

  const repeatCount = 3; // repeat text for seamless loop
  const fullText = Array(repeatCount).fill(text).join('   ·   ');
  // duration in seconds: estimate ~8px per char at 14px font
  const duration = Math.max(10, (text.length * 8) / speed);

  const bg = bg_color || 'rgba(0,0,0,0.2)';

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: bg }}
    >
      <div className="flex items-center gap-1.5 py-1.5 px-2.5">
        {icon && <span className="text-sm flex-shrink-0">{icon}</span>}
        <div className="flex-1 overflow-hidden">
          <div
            className="whitespace-nowrap"
            style={{
              display: 'inline-block',
              animation: `marquee-scroll ${duration}s linear infinite`,
              color,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.01em',
            }}
          >
            {fullText}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes marquee-scroll {
          0%   { transform: translateX(0%); }
          100% { transform: translateX(-${Math.floor(100 / repeatCount)}%); }
        }
      `}</style>
    </div>
  );
}
