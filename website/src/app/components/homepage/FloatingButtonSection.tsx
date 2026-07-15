'use client';

import Link from 'next/link';

interface FloatingConfig {
  text?: string;
  icon?: string;
  link_url?: string;
  position?: 'bottom-right' | 'bottom-left';
  bg_color?: string;
  text_color?: string;
}

export default function FloatingButtonSection({ config }: { config: FloatingConfig }) {
  const {
    text,
    icon = '💬',
    link_url = '/chat',
    position = 'bottom-right',
    bg_color,
    text_color = '#fff',
  } = config;

  const posStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 72,
    zIndex: 40,
    ...(position === 'bottom-right' ? { right: 12 } : { left: 12 }),
  };

  return (
    <Link
      href={link_url}
      style={{
        ...posStyle,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        background: bg_color || 'var(--brand-primary)',
        color: text_color,
        borderRadius: '50%',
        width: 48,
        height: 48,
        textDecoration: 'none',
        fontSize: 22,
        justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
      title={text}
    >
      {icon}
      {text && (
        <span style={{ fontSize: 8, lineHeight: 1, marginTop: -2, fontWeight: 700 }}>{text}</span>
      )}
    </Link>
  );
}
