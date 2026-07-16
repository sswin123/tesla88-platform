'use client';

import Link from 'next/link';
import SafeHtmlBlock from '@/app/components/SafeHtmlBlock';

interface GenericConfig {
  title?: string;
  subtitle?: string;
  content?: string;
  text?: string;
  desktop_media_url?: string;
  desktop_media_type?: string;
  mobile_media_url?: string;
  mobile_media_type?: string;
  link_url?: string;
  button_text?: string;
  button_url?: string;
  bg_color?: string;
  text_color?: string;
  align?: 'left' | 'center' | 'right';
  html?: string;
}

function isVideo(type?: string) {
  return type === 'VIDEO' || type?.startsWith('video/');
}

export default function GenericSection({ config }: { config: GenericConfig }) {
  const {
    title, subtitle, content, text,
    desktop_media_url, desktop_media_type,
    mobile_media_url, mobile_media_type,
    link_url, button_text, button_url,
    bg_color, text_color,
    align = 'center',
    html,
  } = config;

  const desktopUrl = desktop_media_url;
  const mobileUrl  = mobile_media_url;
  const desktopVid = isVideo(desktop_media_type);
  const mobileVid  = isVideo(mobile_media_type);
  const body       = content ?? subtitle ?? text ?? '';
  const href       = button_url ?? link_url ?? '';

  if (html) {
    return (
      <section
        style={bg_color ? { background: bg_color } : undefined}
        className="rounded-xl overflow-hidden"
      >
        <SafeHtmlBlock html={html} />
      </section>
    );
  }

  const alignClass = align === 'left' ? 'text-left items-start' : align === 'right' ? 'text-right items-end' : 'text-center items-center';

  const inner = (
    <div
      className={`rounded-xl overflow-hidden ${desktopUrl || mobileUrl ? 'relative' : 'p-4'}`}
      style={bg_color ? { background: bg_color } : { background: 'var(--bg-card)' }}
    >
      {/* Media */}
      {(desktopUrl || mobileUrl) && (
        <>
          {mobileUrl && (
            <div className="block md:hidden w-full">
              {mobileVid
                ? <video src={mobileUrl} autoPlay muted loop playsInline className="w-full object-cover" />
                : <img src={mobileUrl} alt={title ?? ''} className="w-full object-cover" loading="lazy" />}
            </div>
          )}
          {desktopUrl && (
            <div className={`${mobileUrl ? 'hidden md:block' : ''} w-full`}>
              {desktopVid
                ? <video src={desktopUrl} autoPlay muted loop playsInline className="w-full object-cover" />
                : <img src={desktopUrl} alt={title ?? ''} className="w-full object-cover" loading="lazy" />}
            </div>
          )}
          {/* Overlay text */}
          {(title || body || (button_text && href)) && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-4">
              <div className={`flex flex-col gap-1.5 ${alignClass}`} style={{ color: text_color ?? '#fff' }}>
                {title && <h3 className="text-base font-bold drop-shadow">{title}</h3>}
                {body  && <p className="text-sm opacity-90 drop-shadow">{body}</p>}
                {button_text && href && (
                  <span className="inline-block mt-1 text-sm font-semibold px-4 py-1.5 rounded-lg"
                    style={{ background: 'var(--brand-primary)', color: '#fff' }}>
                    {button_text}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Text-only layout */}
      {!desktopUrl && !mobileUrl && (
        <div className={`flex flex-col gap-2 ${alignClass}`} style={{ color: text_color ?? 'var(--text-base)' }}>
          {title && <h3 className="text-base font-bold">{title}</h3>}
          {body  && <p className="text-sm opacity-85">{body}</p>}
          {button_text && href && (
            <span className="inline-block mt-1 text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ background: 'var(--brand-primary)', color: '#fff' }}>
              {button_text}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (link_url && !button_text) {
    return <Link href={link_url} style={{ display: 'block', textDecoration: 'none' }}>{inner}</Link>;
  }
  if (href && !link_url) {
    return <Link href={href} style={{ display: 'block', textDecoration: 'none' }}>{inner}</Link>;
  }
  return <section>{inner}</section>;
}
