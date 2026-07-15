'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HeroSlide {
  id: string;
  title?: string;
  subtitle?: string;
  button_text?: string;
  button_url?: string;
  enabled: boolean;
  desktop_media_url?: string;
  desktop_media_type?: string;
  desktop_mime_type?: string;
  mobile_media_url?: string;
  mobile_media_type?: string;
  mobile_mime_type?: string;
}

interface HeroBannerConfig {
  slides: HeroSlide[];
  autoplay_interval?: number;
  show_arrows?: boolean;
  show_dots?: boolean;
}

function isVideo(type?: string, mime?: string) {
  return type === 'VIDEO' || mime?.startsWith('video/');
}

// Render one slide's media — uses mobile URL on small screens if available
function SlideMedia({ slide, active }: { slide: HeroSlide; active: boolean }) {
  const desktopUrl   = slide.desktop_media_url;
  const mobileUrl    = slide.mobile_media_url;
  const desktopVideo = isVideo(slide.desktop_media_type, slide.desktop_mime_type);
  const mobileVideo  = isVideo(slide.mobile_media_type,  slide.mobile_mime_type);

  if (!desktopUrl && !mobileUrl) return null;

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity:    active ? 1 : 0,
        transition: 'opacity 0.6s ease-in-out',
        zIndex:     active ? 1 : 0,
      }}
    >
      {/* Mobile media (hidden on md+) */}
      {mobileUrl && (
        <div className="block md:hidden absolute inset-0">
          {mobileVideo ? (
            <video src={mobileUrl} autoPlay={active} muted loop playsInline className="w-full h-full object-cover" />
          ) : (
            <img src={mobileUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          )}
        </div>
      )}

      {/* Desktop media */}
      {desktopUrl && (
        <div className={`${mobileUrl ? 'hidden md:block' : ''} absolute inset-0`}>
          {desktopVideo ? (
            <video src={desktopUrl} autoPlay={active} muted loop playsInline className="w-full h-full object-cover" />
          ) : (
            <img src={desktopUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          )}
        </div>
      )}

      {/* Text overlay */}
      {(slide.title || slide.subtitle || (slide.button_text && slide.button_url)) && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 text-white" style={{ zIndex: 2 }}>
            {slide.title && (
              <h2 className="text-xl font-bold leading-tight mb-1 drop-shadow">{slide.title}</h2>
            )}
            {slide.subtitle && (
              <p className="text-sm opacity-90 mb-3 drop-shadow">{slide.subtitle}</p>
            )}
            {slide.button_text && slide.button_url && (
              <Link
                href={slide.button_url}
                className="inline-block text-sm font-semibold px-5 py-2 rounded-xl"
                style={{ background: 'var(--brand-primary)', color: '#fff' }}
              >
                {slide.button_text}
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const BANNER_HEIGHT = 175;

export default function HeroBanner({ config }: { config: HeroBannerConfig }) {
  const activeSlides   = (config.slides ?? []).filter(s => s.enabled);
  const interval       = config.autoplay_interval ?? 5000;
  const showArrows     = config.show_arrows ?? true;
  const showDots       = config.show_dots ?? true;
  const total          = activeSlides.length;

  const [current,  setCurrent]  = useState(0);
  const [paused,   setPaused]   = useState(false);
  const touchStartX = useRef<number | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo   = useCallback((i: number) => setCurrent(((i % total) + total) % total), [total]);
  const goNext = useCallback(() => goTo(current + 1), [current, goTo]);
  const goPrev = useCallback(() => goTo(current - 1), [current, goTo]);

  // Auto-advance
  useEffect(() => {
    if (total <= 1 || paused) return;
    timerRef.current = setInterval(goNext, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [total, paused, goNext, interval]);

  // Touch swipe
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) { dx < 0 ? goNext() : goPrev(); }
    touchStartX.current = null;
  }

  // No slides — placeholder
  if (total === 0) {
    return (
      <div
        className="rounded-2xl flex flex-col items-center justify-center gap-2"
        style={{
          height:     BANNER_HEIGHT,
          background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-elevated,var(--bg-card)) 100%)',
          border:     '2px dashed rgba(255,255,255,0.08)',
        }}
      >
        <span style={{ fontSize: 32 }}>🎰</span>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>横幅轮播（未配置）</p>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ height: BANNER_HEIGHT, background: 'var(--bg-card)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* All slides rendered simultaneously — crossfade via opacity */}
      {activeSlides.map((slide, i) => (
        <SlideMedia key={slide.id} slide={slide} active={i === current} />
      ))}

      {/* Arrows */}
      {showArrows && total > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
            style={{ zIndex: 10 }}
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
            style={{ zIndex: 10 }}
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Dots */}
      {showDots && total > 1 && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5"
          style={{ zIndex: 10 }}
        >
          {activeSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="rounded-full transition-all duration-300"
              style={{
                width:   i === current ? 20 : 6,
                height:  6,
                background: i === current ? 'var(--brand-primary)' : 'rgba(255,255,255,0.55)',
              }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
