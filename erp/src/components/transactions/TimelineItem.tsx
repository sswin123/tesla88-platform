'use client';

import type { TimelineEvent } from './types';
import { timeAgo } from './types';
import { TimelineEventBadge, timelineDotClass } from './TimelineEventBadge';

interface Props {
  item: TimelineEvent;
  isLast: boolean;
}

export default function TimelineItem({ item, isLast }: Props) {
  return (
    <div className="flex gap-3">
      {/* Dot + vertical connector line */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full mt-0.5 ${timelineDotClass(item.event)}`} />
        {!isLast && <div className="w-px flex-1 bg-gray-200 mt-1 min-h-[16px]" />}
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-1 min-w-0 ${isLast ? 'pb-0' : 'pb-4'}`}>
        <TimelineEventBadge event={item.event} />

        {item.description && (
          <p className="text-xs text-gray-600 leading-relaxed">{item.description}</p>
        )}

        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          {item.adminName && (
            <>
              <span>{item.adminName}</span>
              <span>·</span>
            </>
          )}
          <span>{timeAgo(item.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
