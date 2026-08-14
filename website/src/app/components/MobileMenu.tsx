'use client';

import { useState, useEffect } from 'react';
import type { NavItem } from '@/lib/nav-config';

interface Props {
  navItems: NavItem[];
}

function NavItemRow({ item, depth = 0, onClose }: { item: NavItem; depth?: number; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  function handleClick() {
    if (hasChildren) {
      setOpen(v => !v);
    } else {
      onClose();
    }
  }

  return (
    <div>
      <a
        href={hasChildren ? undefined : item.url}
        target={!hasChildren && item.open === 'new' ? '_blank' : undefined}
        rel={!hasChildren && item.open === 'new' ? 'noopener noreferrer' : undefined}
        onClick={handleClick}
        className="flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors cursor-pointer"
        style={{
          paddingLeft: `${16 + depth * 16}px`,
          color: 'var(--text-base)',
          borderBottom: '1px solid var(--border-dim)',
          textDecoration: 'none',
        }}
      >
        {item.icon && <span className="text-base shrink-0">{item.icon}</span>}
        <span className="flex-1">{item.label}</span>
        {hasChildren && (
          <span className="text-xs text-muted-foreground transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }}>▾</span>
        )}
      </a>
      {hasChildren && open && (
        <div>
          {item.children!.map(child => (
            <NavItemRow key={child.id} item={child} depth={depth + 1} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MobileMenu({ navItems }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Hamburger button — only visible on mobile */}
      <button
        className="lg:hidden flex flex-col gap-1.5 p-1 shrink-0"
        aria-label="菜单"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span className="block w-5 h-px bg-white/70" />
        <span className="block w-5 h-px bg-white/70" />
        <span className="block w-5 h-px bg-white/70" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <div
        className="fixed top-0 left-0 z-[70] h-full w-72 lg:hidden flex flex-col"
        style={{
          background: 'var(--bg-elevated)',
          borderRight: '1px solid var(--border-dim)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        }}
        aria-hidden={!open}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-dim)', paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}>
          <span className="text-sm font-bold" style={{ color: 'var(--text-base)' }}>菜单</span>
          <button onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-white text-lg" aria-label="关闭菜单">✕</button>
        </div>

        {/* Nav items */}
        <div className="flex-1 overflow-y-auto">
          {navItems.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">暂无导航项</p>
          ) : (
            navItems.map(item => (
              <NavItemRow key={item.id} item={item} onClose={() => setOpen(false)} />
            ))
          )}
        </div>
      </div>
    </>
  );
}
