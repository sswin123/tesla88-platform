'use client';
import { usePathname } from 'next/navigation';

const TABS = [
  {
    label: 'Home',
    href: '/',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M3 12L12 3l9 9" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    label: 'History',
    href: '/dashboard',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  {
    label: 'Promo',
    href: '/promotions',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
      </svg>
    ),
  },
  {
    label: 'Chat',
    href: '/chat',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    label: 'Profile',
    href: '/profile',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch"
      style={{
        height: 'var(--bottomnav-h)',
        background: 'rgba(10,11,20,0.97)',
        borderTop: '1px solid rgba(255 255 255 / 0.07)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {TABS.map(tab => {
        const active = isActive(tab.href);
        return (
          <a
            key={tab.href}
            href={tab.href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
            style={{
              color: active ? 'var(--brand-primary)' : 'var(--text-faint)',
              textDecoration: 'none',
            }}
          >
            <span
              style={
                active
                  ? {
                      filter: `drop-shadow(0 0 6px color-mix(in srgb, var(--brand-primary) 60%, transparent))`,
                    }
                  : undefined
              }
            >
              {tab.icon}
            </span>
            <span
              className="text-xs font-medium"
              style={{ fontSize: '10px', letterSpacing: '0.02em' }}
            >
              {tab.label}
            </span>
            {active && (
              <span
                className="absolute bottom-0 rounded-t-full"
                style={{
                  width: '32px',
                  height: '3px',
                  background: 'var(--brand-primary)',
                  boxShadow: '0 0 8px var(--brand-primary)',
                }}
              />
            )}
          </a>
        );
      })}
    </nav>
  );
}
