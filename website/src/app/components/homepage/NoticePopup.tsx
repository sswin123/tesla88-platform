'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface NoticeConfig {
  title?: string;
  content?: string;
  desktop_media_url?: string;
  desktop_media_type?: string;
  button_text?: string;
  button_url?: string;
  bg_color?: string;
  text_color?: string;
  frequency?: 'always' | 'session' | 'once';
}

const STORAGE_KEY = 'notice_popup_seen';

export default function NoticePopup({ config, sectionId }: { config: NoticeConfig; sectionId: number }) {
  const [visible, setVisible] = useState(false);

  const {
    title, content, desktop_media_url, desktop_media_type,
    button_text = '我知道了', button_url,
    bg_color, text_color,
    frequency = 'session',
  } = config;

  useEffect(() => {
    const key = `${STORAGE_KEY}_${sectionId}`;
    if (frequency === 'always') {
      setVisible(true);
      return;
    }
    if (frequency === 'once') {
      if (!localStorage.getItem(key)) setVisible(true);
      return;
    }
    // session
    if (!sessionStorage.getItem(key)) setVisible(true);
  }, [frequency, sectionId]);

  function close() {
    const key = `${STORAGE_KEY}_${sectionId}`;
    setVisible(false);
    if (frequency === 'once')    localStorage.setItem(key, '1');
    if (frequency === 'session') sessionStorage.setItem(key, '1');
  }

  if (!visible || (!title && !content && !desktop_media_url)) return null;

  const isVideo = desktop_media_type === 'VIDEO';

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={close}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: bg_color || 'var(--bg-card)', color: text_color || 'var(--text-base)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-white text-lg font-bold"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          ×
        </button>

        {/* Media */}
        {desktop_media_url && (
          <div className="w-full">
            {isVideo
              ? <video src={desktop_media_url} autoPlay muted loop playsInline className="w-full max-h-52 object-cover" />
              : <img src={desktop_media_url} alt={title ?? ''} className="w-full max-h-52 object-cover" />}
          </div>
        )}

        {/* Text */}
        {(title || content) && (
          <div className="p-4 space-y-1.5">
            {title && <h3 className="text-base font-bold">{title}</h3>}
            {content && <p className="text-sm opacity-85 leading-relaxed">{content}</p>}
          </div>
        )}

        {/* Button */}
        <div className="px-4 pb-4">
          {button_url ? (
            <Link
              href={button_url}
              onClick={close}
              className="block w-full text-center text-sm font-semibold py-2.5 rounded-xl"
              style={{ background: 'var(--brand-primary)', color: '#fff' }}
            >
              {button_text}
            </Link>
          ) : (
            <button
              onClick={close}
              className="w-full text-sm font-semibold py-2.5 rounded-xl"
              style={{ background: 'var(--brand-primary)', color: '#fff' }}
            >
              {button_text}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
