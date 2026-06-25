import type { SupportMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MediaContent({ msg }: { msg: SupportMessage }) {
  const { message_type, content } = msg;
  if (message_type === 'TEXT') {
    return <p className="whitespace-pre-wrap break-words">{content}</p>;
  }
  if (message_type === 'PHOTO' || message_type === 'STICKER') {
    return content ? (
      <img
        src={`/api/livechat/media/${content}`}
        alt="media"
        className="max-h-64 max-w-xs rounded-lg object-contain"
        loading="lazy"
      />
    ) : (
      <span className="italic text-xs">[Photo]</span>
    );
  }
  if (message_type === 'DOCUMENT') {
    return content ? (
      <a
        href={`/api/livechat/media/${content}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-blue-500 text-xs"
      >
        📎 Download file
      </a>
    ) : (
      <span className="italic text-xs">[Document]</span>
    );
  }
  if (message_type === 'VOICE') {
    return content ? (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <audio controls src={`/api/livechat/media/${content}`} className="max-w-xs" />
    ) : (
      <span className="italic text-xs">[Voice message]</span>
    );
  }
  return <span className="italic text-xs">[{message_type}]</span>;
}

export function MessageBubble({
  msg,
  senderName,
}: {
  msg: SupportMessage;
  senderName?: string;
}) {
  const isAgent = msg.sender_type === 'AGENT';

  return (
    <div className={cn('flex gap-2', isAgent ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'max-w-sm rounded-2xl px-4 py-2 text-sm shadow-sm',
          isAgent
            ? 'bg-blue-500 text-white rounded-tr-none'
            : 'bg-white text-gray-800 rounded-tl-none border',
        )}
      >
        {!isAgent && senderName && (
          <p className="mb-1 text-xs font-semibold text-gray-500">{senderName}</p>
        )}
        <MediaContent msg={msg} />
        <p className={cn('mt-1 text-right text-xs opacity-70')}>
          {formatTime(msg.created_at)}
          {isAgent && <span className="ml-1">✓</span>}
        </p>
      </div>
    </div>
  );
}
