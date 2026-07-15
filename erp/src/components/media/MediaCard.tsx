'use client';

import { useState } from 'react';
import { Image, Film, Music, FileText, File, Package, Archive } from 'lucide-react';
import type { MediaRecord } from '@/lib/media/types';
import { formatBytes } from '@/lib/utils/format-bytes';

const TYPE_ICONS: Record<string, React.ElementType> = {
  IMAGE:    Image,
  GIF:      Image,
  VIDEO:    Film,
  AUDIO:    Music,
  VOICE:    Music,
  DOCUMENT: FileText,
  PDF:      FileText,
  APK:      Package,
  ZIP:      Archive,
  RAR:      Archive,
};

const TYPE_BADGE: Record<string, string> = {
  IMAGE:    'bg-blue-100 text-blue-700',
  GIF:      'bg-purple-100 text-purple-700',
  VIDEO:    'bg-red-100 text-red-700',
  AUDIO:    'bg-green-100 text-green-700',
  VOICE:    'bg-teal-100 text-teal-700',
  DOCUMENT: 'bg-gray-100 text-gray-700',
  PDF:      'bg-orange-100 text-orange-700',
  APK:      'bg-yellow-100 text-yellow-700',
  ZIP:      'bg-indigo-100 text-indigo-700',
  RAR:      'bg-indigo-100 text-indigo-700',
};

export function MediaCard({
  item,
  selected,
  onClick,
}: {
  item: MediaRecord;
  selected: boolean;
  onClick: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const isVisual = item.mediaType === 'IMAGE' || item.mediaType === 'GIF';
  const Icon = TYPE_ICONS[item.mediaType] ?? File;
  const badgeClass = TYPE_BADGE[item.mediaType] ?? 'bg-gray-100 text-gray-500';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={`group relative cursor-pointer rounded-lg border overflow-hidden transition-all focus:outline-none focus:ring-2 focus:ring-gray-400 ${
        selected
          ? 'border-gray-900 ring-2 ring-gray-900'
          : 'border-gray-200 hover:border-gray-400 hover:shadow-sm'
      }`}
    >
      {/* Thumbnail area — square aspect ratio */}
      <div className="aspect-square bg-gray-50 flex items-center justify-center relative">
        {isVisual && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/${item.id}/thumbnail`}
            alt={item.displayName}
            className="w-full h-full object-cover"
            onError={() => {
              console.warn(`[media] thumbnail missing for id=${item.id}`);
              setImgError(true);
            }}
          />
        ) : isVisual && imgError ? (
          <div className="flex flex-col items-center justify-center gap-1 text-gray-400">
            <span className="text-2xl">🖼</span>
            <span className="text-[10px] text-center px-1">Image unavailable</span>
          </div>
        ) : (
          <Icon size={32} className="text-gray-400" />
        )}
        {/* Media type badge — bottom right */}
        <span className={`absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
          {item.mediaType}
        </span>
        {/* Archived indicator */}
        {!item.isActive && (
          <span className="absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-gray-800 text-white opacity-80">
            ARCHIVED
          </span>
        )}
      </div>

      {/* File info */}
      <div className="px-2 py-1.5 bg-white">
        <p
          className="text-xs font-medium truncate text-gray-800 leading-tight"
          title={item.displayName}
        >
          {item.displayName}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">{formatBytes(item.fileSize)}</p>
      </div>
    </div>
  );
}
