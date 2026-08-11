'use client';

import { PRESET_META, PresetCard } from './PresetCard';
import type { DesignPreset } from '@/providers/AppearanceProvider';

interface PresetGridProps {
  current: DesignPreset;
  onSelect: (id: DesignPreset) => void;
}

export function PresetGrid({ current, onSelect }: PresetGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {PRESET_META.map((preset) => (
        <PresetCard
          key={preset.id}
          preset={preset}
          active={current === preset.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
