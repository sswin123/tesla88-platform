import type { SupportMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mediaUrl(fileId: string): string {
  return `/api/livechat/media/${encodeURIComponent(fileId)}`;
}

function MediaContent({ msg, onPhotoClick }: { msg: SupportMessage; onPhotoClick?: () => void }) {
  const { message_type, content, caption } = msg;

  if (message_type === 'TEXT') {
    return <p className="whitespace-pre-wrap break-words">{content}</p>;
  }

  if (message_type === 'PHOTO') {
    if (!content) return <span className="italic text-xs">[Photo]</span>;
    return (
      <div>
        <img
          src={mediaUrl(content)}
          alt="photo"
          className="max-h-64 max-w-xs rounded-lg object-contain cursor-pointer hover:opacity-90"
          loading="lazy"
          onClick={onPhotoClick}
        />
        {caption && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{caption}</p>
        )}
      </div>
    );
  }

  if (message_type === 'VIDEO') {
    if (!content) return <span className="italic text-xs">[Video]</span>;
    return (
      <div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video controls src={mediaUrl(content)} className="max-h-48 max-w-xs rounded-lg" />
        {caption && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{caption}</p>
        )}
      </div>
    );
  }

  if (message_type === 'VIDEO_NOTE') {
    if (!content) return <span className="italic text-xs">[Video note]</span>;
    return (
      /* eslint-disable-next-line jsx-a11y/media-has-caption */
      <video
        controls
        src={mediaUrl(content)}
        className="h-40 w-40 rounded-full object-cover"
      />
    );
  }

  if (message_type === 'ANIMATION') {
    if (!content) return <span className="italic text-xs">[GIF]</span>;
    return (
      /* eslint-disable-next-line jsx-a11y/media-has-caption */
      <video
        src={mediaUrl(content)}
        autoPlay
        loop
        muted
        playsInline
        className="max-h-48 max-w-xs rounded-lg"
      />
    );
  }

  if (message_type === 'VOICE') {
    if (!content) return <span className="italic text-xs">[Voice message]</span>;
    return (
      /* eslint-disable-next-line jsx-a11y/media-has-caption */
      <audio controls src={mediaUrl(content)} className="max-w-xs" />
    );
  }

  if (message_type === 'AUDIO') {
    if (!content) return <span className="italic text-xs">[Audio]</span>;
    return (
      /* eslint-disable-next-line jsx-a11y/media-has-caption */
      <audio controls src={mediaUrl(content)} className="max-w-xs" />
    );
  }

  if (message_type === 'STICKER') {
    if (!content) return <span className="italic text-xs">[Sticker]</span>;
    return (
      <img
        src={mediaUrl(content)}
        alt="sticker"
        className="h-24 w-24 object-contain"
        loading="lazy"
      />
    );
  }

  if (message_type === 'DOCUMENT') {
    if (!content) return <span className="italic text-xs">[Document]</span>;
    return (
      <a
        href={mediaUrl(content)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-sm underline"
      >
        📎 Download file
      </a>
    );
  }

  return <span className="italic text-xs">[{message_type}]</span>;
}

export function MessageBubble({
  msg,
  senderName,
  onPhotoClick,
}: {
  msg: SupportMessage;
  senderName?: string;
  onPhotoClick?: () => void;
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
        <MediaContent msg={msg} onPhotoClick={onPhotoClick} />
        <p className={cn('mt-1 text-right text-xs opacity-70')}>
          {formatTime(msg.created_at)}
          {isAgent && <span className="ml-1">✓</span>}
        </p>
      </div>
    </div>
  );
}
