'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useAppearance } from '@/providers/AppearanceProvider';
import { PresetGrid } from './PresetGrid';

const MODES = [
  { value: 'light',  label: 'Light',  description: 'Always light',  Icon: Sun },
  { value: 'dark',   label: 'Dark',   description: 'Always dark',   Icon: Moon },
  { value: 'system', label: 'System', description: 'Follow OS',     Icon: Monitor },
] as const;

export default function AppearancePage() {
  const { design, setDesign } = useAppearance();
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Appearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize the look and feel of the ERP interface.
        </p>
      </div>

      {/* Color Preset */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Color Preset</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose a color theme for the interface.
          </p>
        </div>
        <PresetGrid current={design} onSelect={setDesign} />
      </section>

      <div className="border-t border-border" />

      {/* Display Mode */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Display Mode</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Switch between light and dark mode.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {MODES.map(({ value, label, description, Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                theme === value
                  ? 'border-primary bg-sidebar-active-bg text-sidebar-active-text shadow-md'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
              )}
              aria-pressed={theme === value}
            >
              <Icon size={22} />
              <div className="text-center">
                <p className="text-sm font-medium leading-none">{label}</p>
                <p className="mt-1 text-[10px] opacity-70">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
