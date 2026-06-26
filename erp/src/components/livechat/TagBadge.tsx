'use client';

import type { CustomerTag } from '@/lib/types';

export function TagBadge({ tag, onRemove }: { tag: CustomerTag; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: tag.color }}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 rounded-full hover:bg-black/20 leading-none"
          title={`Remove ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
