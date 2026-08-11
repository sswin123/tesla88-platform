'use client';

type EventCategory = 'created' | 'processing' | 'approved' | 'rejected' | 'note' | 'system';

function classify(event: string): EventCategory {
  if (event.startsWith('INTERNAL_NOTE')) return 'note';
  if (event.endsWith('_PROCESSING'))    return 'processing';
  if (event.endsWith('_APPROVED'))      return 'approved';
  if (event.endsWith('_REJECTED'))      return 'rejected';
  if (event.endsWith('_CREATED'))       return 'created';
  return 'system';
}

const BADGE_CLASS: Record<EventCategory, string> = {
  created:    'bg-muted          text-muted-foreground border border-border',
  processing: 'bg-blue-100   text-blue-700   border border-blue-200',
  approved:   'bg-green-100  text-green-700  border border-green-200',
  rejected:   'bg-red-100    text-red-700    border border-red-200',
  note:       'bg-purple-100 text-purple-700 border border-purple-200',
  system:     'bg-muted          text-muted-foreground border border-border',
};

const DOT_CLASS: Record<EventCategory, string> = {
  created:    'bg-muted-foreground',
  processing: 'bg-blue-500',
  approved:   'bg-green-500',
  rejected:   'bg-red-500',
  note:       'bg-purple-500',
  system:     'bg-muted-foreground',
};

function formatEvent(event: string): string {
  return event
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

interface Props {
  event: string;
}

export function TimelineEventBadge({ event }: Props) {
  const cat = classify(event);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${BADGE_CLASS[cat]}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${DOT_CLASS[cat]}`} />
      {formatEvent(event)}
    </span>
  );
}

export function timelineDotClass(event: string): string {
  return DOT_CLASS[classify(event)];
}
