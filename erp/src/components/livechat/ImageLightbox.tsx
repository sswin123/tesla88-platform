'use client';

import { useEffect, useRef, useState } from 'react';

interface LightboxPhoto {
  src: string;
  caption?: string;
}

export function ImageLightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos: LightboxPhoto[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  function prev() { if (hasPrev) { setIndex((i) => i - 1); setZoomed(false); } }
  function next() { if (hasNext) { setIndex((i) => i + 1); setZoomed(false); } }

  // Keyboard navigation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // Note: no deps array — the effect re-runs each render to capture the latest `index`.
  // This is intentional: otherwise the closures would be stale.

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  if (!photo) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-white text-sm opacity-70">
          {photos.length > 1 ? `${index + 1} / ${photos.length}` : ''}
        </span>
        <div className="flex gap-3">
          <button
            className="text-white opacity-70 hover:opacity-100 text-sm"
            onClick={toggleFullscreen}
            title="Fullscreen"
          >
            ⛶
          </button>
          <button
            className="text-white opacity-70 hover:opacity-100 text-sm"
            onClick={() => { setZoomed((z) => !z); }}
            title={zoomed ? 'Zoom out' : 'Zoom in'}
          >
            {zoomed ? '🔍−' : '🔍+'}
          </button>
          <button
            className="text-white opacity-70 hover:opacity-100 text-xl leading-none"
            onClick={onClose}
            title="Close (Esc)"
          >
            ×
          </button>
        </div>
      </div>

      {/* Prev arrow */}
      {hasPrev && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white text-3xl opacity-70 hover:opacity-100 select-none"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          title="Previous (←)"
        >
          ‹
        </button>
      )}

      {/* Image */}
      <div
        className="flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          key={photo.src}
          src={photo.src}
          alt="lightbox"
          style={zoomed
            ? { maxHeight: '90vh', maxWidth: '90vw', transform: 'scale(2)', transformOrigin: 'center', cursor: 'zoom-out' }
            : { maxHeight: '90vh', maxWidth: '90vw', objectFit: 'contain', cursor: 'zoom-in' }
          }
          onClick={() => setZoomed((z) => !z)}
        />
      </div>

      {/* Caption */}
      {photo.caption && (
        <div
          className="absolute bottom-12 left-0 right-0 text-center text-white text-sm px-8 opacity-80"
          onClick={(e) => e.stopPropagation()}
        >
          {photo.caption}
        </div>
      )}

      {/* Next arrow */}
      {hasNext && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white text-3xl opacity-70 hover:opacity-100 select-none"
          onClick={(e) => { e.stopPropagation(); next(); }}
          title="Next (→)"
        >
          ›
        </button>
      )}

      {/* Indicator dots (only if ≤ 10 photos for space) */}
      {photos.length > 1 && photos.length <= 10 && (
        <div
          className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((_, i) => (
            <button
              key={i}
              onClick={() => { setIndex(i); setZoomed(false); }}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/40'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
