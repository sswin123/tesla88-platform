'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { isBrowser } from '@/lib/is-browser';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PopupSlide {
  id: string;
  title?: string;
  subtitle?: string;
  description?: string;
  button_text?: string;
  button_url?: string;
  button_target?: '_self' | '_blank';
  image_click_url?: string;
  image_click_target?: '_self' | '_blank';
  desktop_media_url?: string;
  desktop_media_type?: string;
  mobile_media_url?: string;
  mobile_media_type?: string;
  start_time?: string;
  end_time?: string;
  enabled?: boolean;
  display_order?: number;
}

interface NoticeConfig {
  // Multi-slide (new)
  slides?: PopupSlide[];
  autoplay?: boolean;
  autoplay_interval?: number;
  pause_on_hover?: boolean;
  loop?: boolean;
  show_indicators?: boolean;
  show_arrows?: boolean;
  animation?: 'slide' | 'fade' | 'zoom';
  // Legacy single-slide
  title?: string;
  content?: string;
  desktop_media_url?: string;
  desktop_media_type?: string;
  button_text?: string;
  button_url?: string;
  // Shared
  bg_color?: string;
  text_color?: string;
  frequency?: string;
}

const STORAGE_KEY = 'notice_popup_seen';

// ── Frequency gate ────────────────────────────────────────────────────────────

function shouldShow(sectionId: number, frequency: string): boolean {
  if (!isBrowser) return false;
  const key = `${STORAGE_KEY}_${sectionId}`;
  if (frequency === 'always') return true;
  if (frequency === 'once') return !localStorage.getItem(key);
  if (frequency === 'daily') {
    const saved = localStorage.getItem(key);
    if (!saved) return true;
    return new Date(saved).toDateString() !== new Date().toDateString();
  }
  if (frequency === 'weekly') {
    const saved = localStorage.getItem(key);
    if (!saved) return true;
    return Date.now() - new Date(saved).getTime() > 7 * 86400_000;
  }
  // session (default)
  return !sessionStorage.getItem(key);
}

function markSeen(sectionId: number, frequency: string) {
  if (!isBrowser) return;
  const key = `${STORAGE_KEY}_${sectionId}`;
  const now = new Date().toISOString();
  if (frequency === 'once' || frequency === 'daily' || frequency === 'weekly') {
    localStorage.setItem(key, now);
  } else if (frequency === 'session') {
    sessionStorage.setItem(key, '1');
  }
}

// ── Active slides filter (enabled + within schedule) ─────────────────────────

function activeSlides(slides: PopupSlide[]): PopupSlide[] {
  const now = Date.now();
  return slides
    .filter(s => {
      if (s.enabled === false) return false;
      if (s.start_time && new Date(s.start_time).getTime() > now) return false;
      if (s.end_time   && new Date(s.end_time).getTime()   < now) return false;
      return true;
    })
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

// ── Slide renderer ────────────────────────────────────────────────────────────

function SlideContent({
  slide,
  isMobile,
  bgColor,
  textColor,
  onClose,
}: {
  slide: PopupSlide;
  isMobile: boolean;
  bgColor?: string;
  textColor?: string;
  onClose: () => void;
}) {
  const mediaUrl  = (isMobile && slide.mobile_media_url) ? slide.mobile_media_url  : slide.desktop_media_url;
  const mediaType = (isMobile && slide.mobile_media_url) ? slide.mobile_media_type : slide.desktop_media_type;
  const isVideo   = mediaType === 'VIDEO';
  const hasImg    = !!mediaUrl;
  const hasText   = !!(slide.title || slide.subtitle || slide.description);
  const hasButton = !!(slide.button_text && slide.button_url);
  const hasImgLink = !!slide.image_click_url;

  return (
    <div className="flex flex-col h-full" style={{ color: textColor || 'var(--text-base)' }}>
      {/* Media */}
      {hasImg && (
        <div className="w-full relative" style={{ cursor: hasImgLink ? 'pointer' : 'default' }}>
          {hasImgLink ? (
            <a
              href={slide.image_click_url}
              target={slide.image_click_target ?? '_self'}
              rel={slide.image_click_target === '_blank' ? 'noopener noreferrer' : undefined}
              onClick={onClose}
              tabIndex={0}
            >
              {isVideo
                ? <video src={mediaUrl} autoPlay muted loop playsInline className="w-full max-h-64 object-cover" />
                : <img src={mediaUrl} alt={slide.title ?? ''} className="w-full max-h-64 object-cover" draggable={false} />}
            </a>
          ) : (
            <>
              {isVideo
                ? <video src={mediaUrl} autoPlay muted loop playsInline className="w-full max-h-64 object-cover" />
                : <img src={mediaUrl} alt={slide.title ?? ''} className="w-full max-h-64 object-cover" draggable={false} />}
            </>
          )}
        </div>
      )}

      {/* Text content */}
      {hasText && (
        <div className="px-4 pt-3 space-y-1">
          {slide.title && <h3 className="text-base font-bold leading-tight">{slide.title}</h3>}
          {slide.subtitle && <p className="text-sm font-semibold opacity-80">{slide.subtitle}</p>}
          {slide.description && <p className="text-sm opacity-75 leading-relaxed">{slide.description}</p>}
        </div>
      )}

      {/* CTA button */}
      {hasButton && (
        <div className="px-4 pb-1 pt-3">
          <a
            href={slide.button_url}
            target={slide.button_target ?? '_self'}
            rel={slide.button_target === '_blank' ? 'noopener noreferrer' : undefined}
            onClick={onClose}
            className="block w-full text-center text-sm font-semibold py-2.5 rounded-xl"
            style={{ background: 'var(--brand-primary)', color: '#fff', textDecoration: 'none' }}
          >
            {slide.button_text}
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NoticePopup({ config, sectionId }: { config: NoticeConfig; sectionId: number }) {
  const [visible, setVisible]   = useState(false);
  const [current, setCurrent]   = useState(0);
  const [paused,  setPaused]    = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef<number | null>(null);

  // ── Normalise config (support legacy single-slide format) ──────────────────
  const rawSlides: PopupSlide[] = config.slides?.length
    ? config.slides
    : (config.desktop_media_url || config.title || config.content)
      ? [{
          id: 'legacy',
          title:           config.title,
          description:     config.content,
          desktop_media_url:  config.desktop_media_url,
          desktop_media_type: config.desktop_media_type,
          button_text:     config.button_text,
          button_url:      config.button_url,
          enabled:         true,
          display_order:   0,
        }]
      : [];

  const slides = activeSlides(rawSlides);
  const total  = slides.length;

  const frequency      = config.frequency       ?? 'session';
  const autoplay       = config.autoplay        ?? true;
  const interval       = config.autoplay_interval ?? 5000;
  const pauseOnHover   = config.pause_on_hover  ?? true;
  const loop           = config.loop            ?? true;
  const showIndicators = config.show_indicators ?? true;
  const showArrows     = config.show_arrows     ?? true;
  const animation      = config.animation       ?? 'slide';
  const bgColor        = config.bg_color;
  const textColor      = config.text_color;

  // ── Visibility check ───────────────────────────────────────────────────────
  useEffect(() => {
    if (total === 0) return;
    if (shouldShow(sectionId, frequency)) setVisible(true);
  }, [sectionId, frequency, total]);

  // ── Responsive detection ───────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Auto play ──────────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    setCurrent(c => {
      if (c < total - 1) return c + 1;
      return loop ? 0 : c;
    });
  }, [total, loop]);

  useEffect(() => {
    if (!visible || !autoplay || total <= 1 || paused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(goNext, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible, autoplay, total, paused, interval, goNext]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goTo(current < total - 1 ? current + 1 : (loop ? 0 : current));
      if (e.key === 'ArrowLeft')  goTo(current > 0 ? current - 1 : (loop ? total - 1 : 0));
      if (e.key === 'Escape')     close();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, current, total, loop]);// eslint-disable-line

  function goTo(idx: number) { setCurrent(Math.max(0, Math.min(idx, total - 1))); }

  function close() {
    setVisible(false);
    markSeen(sectionId, frequency);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  // ── Touch / swipe ──────────────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 50)  goTo(current > 0 ? current - 1 : (loop ? total - 1 : 0));
    if (dx < -50) goTo(current < total - 1 ? current + 1 : (loop ? 0 : current));
    touchStartX.current = null;
  }

  if (!visible || total === 0) return null;

  const slide = slides[current];

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={close}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl select-none"
        style={{ background: bgColor || 'var(--bg-card)' }}
        onClick={e => e.stopPropagation()}
        onMouseEnter={() => pauseOnHover && setPaused(true)}
        onMouseLeave={() => pauseOnHover && setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full flex items-center justify-center text-white text-lg font-bold leading-none"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          aria-label="关闭"
        >
          ×
        </button>

        {/* Slide content with animation */}
        <div className="relative overflow-hidden min-h-[120px]">
          {animation === 'fade' ? (
            <div key={slide.id}
              style={{ animation: 'popup-fade-in 0.35s ease' }}>
              <SlideContent slide={slide} isMobile={isMobile} bgColor={bgColor} textColor={textColor} onClose={close} />
            </div>
          ) : animation === 'zoom' ? (
            <div key={slide.id}
              style={{ animation: 'popup-zoom-in 0.3s ease' }}>
              <SlideContent slide={slide} isMobile={isMobile} bgColor={bgColor} textColor={textColor} onClose={close} />
            </div>
          ) : (
            // Slide (default)
            <div key={slide.id}
              style={{ animation: 'popup-slide-in 0.3s ease' }}>
              <SlideContent slide={slide} isMobile={isMobile} bgColor={bgColor} textColor={textColor} onClose={close} />
            </div>
          )}
        </div>

        {/* Close / dismiss button if no CTA */}
        {!(slide.button_text && slide.button_url) && (
          <div className="px-4 pb-4 pt-2">
            <button
              onClick={close}
              className="w-full text-sm font-semibold py-2.5 rounded-xl"
              style={{ background: 'var(--brand-primary)', color: '#fff' }}
            >
              我知道了
            </button>
          </div>
        )}

        {/* Navigation arrows */}
        {showArrows && total > 1 && (
          <>
            <button
              onClick={e => { e.stopPropagation(); goTo(current > 0 ? current - 1 : (loop ? total - 1 : 0)); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 16 }}
              aria-label="上一张"
            >‹</button>
            <button
              onClick={e => { e.stopPropagation(); goTo(current < total - 1 ? current + 1 : (loop ? 0 : current)); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 16 }}
              aria-label="下一张"
            >›</button>
          </>
        )}

        {/* Indicator dots */}
        {showIndicators && total > 1 && (
          <div className="flex justify-center gap-1.5 py-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={e => { e.stopPropagation(); goTo(i); }}
                className="rounded-full transition-all duration-200"
                style={{
                  width:  i === current ? '18px' : '6px',
                  height: '6px',
                  background: i === current ? 'var(--brand-primary)' : 'rgba(255,255,255,0.35)',
                }}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes popup-fade-in  { from { opacity: 0; }                     to { opacity: 1; } }
        @keyframes popup-zoom-in  { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }
        @keyframes popup-slide-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
