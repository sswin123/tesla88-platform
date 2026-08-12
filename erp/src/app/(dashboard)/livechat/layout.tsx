'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const SUB_NAV = [
  { href: '/livechat/settings', label: 'Quick Replies' },
  { href: '/livechat/tags',     label: 'Tag Manager' },
];

export default function LiveChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSubPage = SUB_NAV.some((n) => pathname.startsWith(n.href));

  if (!isSubPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 border-b bg-card px-4 py-2 -mx-6 -mt-6 mb-0">
        <Link
          href="/livechat"
          className="text-xs text-muted-foreground hover:text-foreground pr-3 border-r border-border mr-2"
        >
          ← Live Chat
        </Link>
        {SUB_NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              pathname.startsWith(n.href)
                ? 'bg-blue-50 text-blue-700'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            {n.label}
          </Link>
        ))}
      </div>
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}
