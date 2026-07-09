'use client';
import { useState, useEffect, useCallback } from 'react';

export interface Slide {
  id: number;
  title: string;
  subtitle?: string;
  cta?: string;
  ctaHref?: string;
  accentColor?: string;
  imageUrl?: string;
}

const FALLBACK_SLIDES: Slide[] = [
  {
    id: 1,
    title: '新会员首存100%欢迎奖金',
    subtitle: '最高奖金 RM 500，立即注册领取',
    cta: '立即领取',
    ctaHref: '/register',
    accentColor: '#2563eb',
  },
  {
    id: 2,
    title: '每日返水高达 1%',
    subtitle: '无需申请，自动到账，天天享有',
    cta: '查看优惠',
    ctaHref: '/promotions',
    accentColor: '#7c3aed',
  },
  {
    id: 3,
    title: '推荐好友赚 RM 50',
    subtitle: '专属推荐码，好友存款即送奖金',
    cta: '立即推荐',
    ctaHref: '/profile',
    accentColor: '#0d9488',
  },
];

interface Props {
  slides?: Slide[];
}

export default function HeroSlider({ slides }: Props) {
  const data = slides?.length ? slides : FALLBACK_SLIDES;
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % data.length);
  }, [data.length]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, 4000);
    return () => clearInterval(t);
  }, [next, paused]);

  const slide = data[current];
  const accent = slide.accentColor ?? 'var(--brand-primary)';

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ minHeight: '220px' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slide backgrounds */}
      {data.map((s, i) => (
        <div
          key={s.id}
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: i === current ? 1 : 0 }}
        >
          {s.imageUrl ? (
            <>
              <img
                src={s.imageUrl}
                alt={s.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Dark overlay for text readability */}
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 70%, transparent 100%)' }}
              />
            </>
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at 70% 50%, ${s.accentColor ?? 'var(--brand-primary)'}33 0%, transparent 65%),
                             linear-gradient(135deg, ${s.accentColor ?? 'var(--brand-primary)'}1a 0%, var(--bg-surface2) 100%)`,
              }}
            />
          )}
        </div>
      ))}

      {/* Border */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ border: `1px solid ${accent}33` }}
      />

      {/* Content */}
      <div className="relative px-6 py-10 sm:px-12 sm:py-14">
        <p
          className="text-xs font-bold tracking-widest uppercase mb-3"
          style={{ color: slide.imageUrl ? '#fff' : accent }}
        >
          限时活动
        </p>
        <h1
          className="text-2xl sm:text-3xl font-bold mb-3 leading-tight"
          style={{
            color: slide.imageUrl ? '#fff' : 'var(--text-base)',
            textShadow: slide.imageUrl ? '0 2px 8px rgba(0,0,0,0.5)' : `0 0 40px ${accent}44`,
          }}
        >
          {slide.title}
        </h1>
        {slide.subtitle && (
          <p className="text-sm mb-6 max-w-sm" style={{ color: slide.imageUrl ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>
            {slide.subtitle}
          </p>
        )}
        {slide.cta && (
          <a
            href={slide.ctaHref ?? '/promotions'}
            className="casino-btn-primary inline-block px-6 py-2.5 text-sm"
          >
            {slide.cta}
          </a>
        )}
      </div>

      {/* Dot indicators */}
      {data.length > 1 && (
        <div className="absolute bottom-4 left-6 flex gap-1.5">
          {data.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrent(i)}
              aria-label={`幻灯片 ${i + 1}`}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === current ? '20px' : '6px',
                height: '6px',
                background: i === current ? accent : 'rgba(255,255,255,0.22)',
              }}
            />
          ))}
        </div>
      )}

      {/* Arrow buttons */}
      {data.length > 1 && (
        <>
          <button
            onClick={() => setCurrent(c => (c - 1 + data.length) % data.length)}
            aria-label="上一张"
            className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hidden sm:flex items-center justify-center transition-opacity hover:opacity-100 opacity-60"
            style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            onClick={next}
            aria-label="下一张"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hidden sm:flex items-center justify-center transition-opacity hover:opacity-100 opacity-60"
            style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
