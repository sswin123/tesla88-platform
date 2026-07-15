import Link from 'next/link';

interface AnnouncementConfig {
  text?: string;
  bg_color?: string;
  text_color?: string;
  icon?: string;
  link_url?: string;
  button_text?: string;
}

export default function AnnouncementSection({ config }: { config: AnnouncementConfig }) {
  const { text, bg_color, text_color, icon, link_url, button_text } = config;
  if (!text) return null;

  const bar = (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
      style={{
        background: bg_color || 'color-mix(in srgb, var(--brand-primary) 15%, transparent)',
        color: text_color || 'var(--text-base)',
      }}
    >
      {icon && <span className="flex-shrink-0 text-base">{icon}</span>}
      <span className="flex-1 text-xs leading-snug">{text}</span>
      {button_text && link_url && (
        <span
          className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg"
          style={{ background: 'var(--brand-primary)', color: '#fff' }}
        >
          {button_text}
        </span>
      )}
    </div>
  );

  if (link_url) {
    return <Link href={link_url} style={{ textDecoration: 'none' }}>{bar}</Link>;
  }
  return <div>{bar}</div>;
}
