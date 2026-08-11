'use client';

import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import type { DesignPreset } from '@/providers/AppearanceProvider';

interface PresetMeta {
  id: DesignPreset;
  name: string;
  description: string;
  suitability: 'dark' | 'light' | 'both';
  lightBg: string;
  darkBg: string;
  sidebarLight: string;
  sidebarDark: string;
  primary: string;
  primaryDark: string;
}

// Primary hex values match the spec exactly
export const PRESET_META: PresetMeta[] = [
  {
    id: 'tesla88',
    name: 'Tesla88 Premium',
    description: 'Tesla88 premium branded ERP',
    suitability: 'dark',
    lightBg: '#f5f0ff',
    darkBg: '#06070f',
    sidebarLight: '#ede9fe',
    sidebarDark: '#0e0f1c',
    primary: '#7c3aed',
    primaryDark: '#a78bfa',
  },
  {
    id: 'midnight',
    name: 'Midnight Pro',
    description: 'Premium dark enterprise',
    suitability: 'dark',
    lightBg: '#f5f0ff',
    darkBg: '#0f0f13',
    sidebarLight: '#ede9fe',
    sidebarDark: '#111120',
    primary: '#8b5cf6',
    primaryDark: '#a78bfa',
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    description: 'Fintech / banking / technology',
    suitability: 'both',
    lightBg: '#eff6ff',
    darkBg: '#040d1a',
    sidebarLight: '#dbeafe',
    sidebarDark: '#070e1c',
    primary: '#3b82f6',
    primaryDark: '#60a5fa',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Minimal enterprise',
    suitability: 'both',
    lightBg: '#f4f4f6',
    darkBg: '#111113',
    sidebarLight: '#e8e8ec',
    sidebarDark: '#18181c',
    primary: '#5e5ce6',
    primaryDark: '#818cf8',
  },
  {
    id: 'neon',
    name: 'Purple Neon',
    description: 'Gaming / entertainment',
    suitability: 'dark',
    lightBg: '#fdf4ff',
    darkBg: '#08060e',
    sidebarLight: '#f3e8ff',
    sidebarDark: '#0e0810',
    primary: '#a855f7',
    primaryDark: '#c084fc',
  },
  {
    id: 'emerald',
    name: 'Emerald Finance',
    description: 'Finance / operations',
    suitability: 'both',
    lightBg: '#ecfdf5',
    darkBg: '#0a0f0c',
    sidebarLight: '#d1fae5',
    sidebarDark: '#0d1410',
    primary: '#10b981',
    primaryDark: '#34d399',
  },
  {
    id: 'clean',
    name: 'Clean Light',
    description: 'Modern SaaS',
    suitability: 'light',
    lightBg: '#f8fafc',
    darkBg: '#1a1b35',
    sidebarLight: '#f0f1fe',
    sidebarDark: '#1e1f3a',
    primary: '#6366f1',
    primaryDark: '#818cf8',
  },
  {
    id: 'cloud',
    name: 'Cloud Gray',
    description: 'Soft enterprise',
    suitability: 'light',
    lightBg: '#f1f3f5',
    darkBg: '#111519',
    sidebarLight: '#e8edf2',
    sidebarDark: '#161b1f',
    primary: '#339af0',
    primaryDark: '#74c0fc',
  },
];

const SUIT_LABELS: Record<PresetMeta['suitability'], string> = {
  dark: 'Dark',
  light: 'Light',
  both: 'Light & Dark',
};

interface PresetCardProps {
  preset: PresetMeta;
  active: boolean;
  onSelect: (id: DesignPreset) => void;
}

function MiniPreview({ preset, isDark }: { preset: PresetMeta; isDark: boolean }) {
  const bg = isDark ? preset.darkBg : preset.lightBg;
  const sidebar = isDark ? preset.sidebarDark : preset.sidebarLight;
  const primary = isDark ? preset.primaryDark : preset.primary;
  const textFaint = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)';
  const textMid = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.20)';
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.80)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';

  return (
    <div className="h-24 w-full overflow-hidden rounded-lg" style={{ background: bg, border: `1px solid ${border}` }}>
      {/* Top header bar */}
      <div className="flex h-5 items-center gap-1 px-1.5" style={{ background: sidebar, borderBottom: `1px solid ${border}` }}>
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: primary }} />
        <div className="h-1 w-8 rounded-sm" style={{ background: textMid }} />
        <div className="ml-auto flex gap-0.5">
          <div className="h-3 w-3 rounded-sm" style={{ background: `${primary}44` }} />
          <div className="h-3 w-3 rounded-full" style={{ background: textFaint }} />
        </div>
      </div>

      {/* Body */}
      <div className="flex h-[76px]">
        {/* Sidebar */}
        <div className="flex w-9 flex-shrink-0 flex-col gap-1 p-1.5" style={{ background: sidebar, borderRight: `1px solid ${border}` }}>
          {/* Active nav item */}
          <div className="flex h-2 items-center gap-0.5 rounded-sm px-0.5" style={{ background: primary }}>
            <div className="h-1 w-1 rounded-full bg-white/70" />
            <div className="h-0.5 flex-1 rounded-sm bg-white/60" />
          </div>
          {/* Inactive items */}
          {[0.45, 0.35, 0.3].map((opacity, i) => (
            <div key={i} className="flex h-1.5 items-center gap-0.5 px-0.5">
              <div className="h-1 w-1 rounded-sm" style={{ background: primary, opacity }} />
              <div className="h-0.5 flex-1 rounded-sm" style={{ background: textMid }} />
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-1 p-1.5">
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-0.5">
            {[primary, `${primary}55`, `${primary}33`].map((bg2, i) => (
              <div key={i} className="flex h-5 flex-col justify-center gap-0.5 rounded-sm px-1" style={{ background: i === 0 ? bg2 : cardBg, border: `1px solid ${border}` }}>
                <div className="h-0.5 w-2/3 rounded-sm" style={{ background: i === 0 ? 'rgba(255,255,255,0.7)' : primary, opacity: i === 0 ? 1 : 0.6 }} />
                <div className="h-1 w-1/2 rounded-sm" style={{ background: i === 0 ? 'rgba(255,255,255,0.9)' : textMid }} />
              </div>
            ))}
          </div>
          {/* Table rows */}
          <div className="flex flex-col gap-0.5">
            <div className="flex gap-1 rounded-sm px-0.5" style={{ background: cardBg, border: `1px solid ${border}` }}>
              <div className="h-1.5 w-4 rounded-sm" style={{ background: textMid }} />
              <div className="h-1.5 flex-1 rounded-sm" style={{ background: textFaint }} />
              <div className="h-1.5 w-3 rounded-full" style={{ background: `${primary}88` }} />
            </div>
            <div className="flex gap-1 rounded-sm px-0.5" style={{ background: 'transparent' }}>
              <div className="h-1.5 w-4 rounded-sm" style={{ background: textFaint }} />
              <div className="h-1.5 flex-1 rounded-sm" style={{ background: textFaint }} />
              <div className="h-1.5 w-3 rounded-full" style={{ background: textFaint }} />
            </div>
          </div>
          {/* Button */}
          <div className="flex justify-end">
            <div className="h-2.5 w-8 rounded-sm" style={{ background: primary }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PresetCard({ preset, active, onSelect }: PresetCardProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => onSelect(preset.id)}
      className={cn(
        'group relative flex flex-col gap-2 rounded-xl border-2 p-1.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active
          ? 'border-primary shadow-md'
          : 'border-border hover:border-primary/50',
      )}
      aria-pressed={active}
      aria-label={`${preset.name} preset${active ? ' (active)' : ''}`}
    >
      <MiniPreview preset={preset} isDark={isDark} />

      <div className="space-y-0.5 px-0.5 pb-0.5">
        <div className="flex items-center justify-between gap-1">
          <span
            className={cn(
              'text-xs font-semibold leading-none',
              active ? 'text-primary' : 'text-foreground',
            )}
          >
            {preset.name}
          </span>
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none"
            style={{
              background: active ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted))',
              color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            }}
          >
            {SUIT_LABELS[preset.suitability]}
          </span>
        </div>
        <p className="text-[10px] leading-none text-muted-foreground">{preset.description}</p>
      </div>

      {active && (
        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground shadow">
          ✓
        </span>
      )}
    </button>
  );
}
