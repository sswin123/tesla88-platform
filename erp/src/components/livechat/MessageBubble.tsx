import type { SupportMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaUrl(fileId: string): string {
  return `/api/livechat/media/${encodeURIComponent(fileId)}`;
}

const FILE_ICONS: Record<string, string> = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  ppt: '📊', pptx: '📊', txt: '📄', csv: '📄', rtf: '📝',
  json: '📄', xml: '📄', html: '📄', css: '📄',
  js: '📄', ts: '📄', py: '📄', java: '📄', kt: '📄', swift: '📄',
  zip: '📦', rar: '📦', '7z': '📦', gz: '📦', tar: '📦', bz2: '📦',
  apk: '📦', ipa: '📦', exe: '📦', msi: '📦', dmg: '📦', pkg: '📦', deb: '📦',
  mp3: '🎵', wav: '🎵', aac: '🎵', ogg: '🎵', flac: '🎵', m4a: '🎵',
};

function getFileIcon(fileName?: string | null): string {
  const ext = fileName?.split('.').pop()?.toLowerCase() ?? '';
  return FILE_ICONS[ext] ?? '📎';
}

function MediaContent({
  msg,
  onPhotoClick,
}: {
  msg: SupportMessage;
  onPhotoClick?: () => void;
}) {
  const { message_type, content, caption, file_name, file_size } = msg;

  if (message_type === 'TEXT') {
    return <p className="whitespace-pre-wrap break-words">{content}</p>;
  }

  if (message_type === 'PHOTO') {
    if (!content) return <span className="italic text-xs">[Photo]</span>;
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
        <video controls preload="metadata" src={mediaUrl(content)} className="max-h-48 max-w-xs rounded-lg" />
        <div className="flex items-center justify-between mt-1 gap-2">
          {caption && <p className="flex-1 whitespace-pre-wrap break-words text-sm">{caption}</p>}
          <a
            href={mediaUrl(content)}
            target="_blank"
            rel="noopener noreferrer"
            download={file_name ?? undefined}
            className="shrink-0 text-xs opacity-60 hover:opacity-100"
          >
            ⬇ Download
          </a>
        </div>
      </div>
    );
  }

  if (message_type === 'VIDEO_NOTE') {
    if (!content) return <span className="italic text-xs">[Video note]</span>;
    return (
      /* eslint-disable-next-line jsx-a11y/media-has-caption */
      <video
        controls
        preload="metadata"
        src={mediaUrl(content)}
        className="h-40 w-40 rounded-full object-cover"
      />
    );
  }

  if (message_type === 'ANIMATION') {
    if (!content) return <span className="italic text-xs">[GIF]</span>;
    return (
      /* eslint-disable-next-line jsx-a11y/media-has-caption */
      <video src={mediaUrl(content)} autoPlay loop muted playsInline className="max-h-48 max-w-xs rounded-lg" />
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
      <div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={mediaUrl(content)} className="max-w-xs" />
        {file_name && <p className="text-xs opacity-60 mt-0.5 truncate max-w-xs">{file_name}</p>}
      </div>
    );
  }

  if (message_type === 'STICKER') {
    if (!content) return <span className="italic text-xs">[Sticker]</span>;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={mediaUrl(content)} alt="sticker" className="h-24 w-24 object-contain" loading="lazy" />
    );
  }

  if (message_type === 'DOCUMENT') {
    if (!content) return <span className="italic text-xs">[Document]</span>;
    const icon = getFileIcon(file_name);
    const ext = file_name?.split('.').pop()?.toUpperCase() ?? 'FILE';
    return (
      <div>
        <a
          href={mediaUrl(content)}
          target="_blank"
          rel="noopener noreferrer"
          download={file_name ?? undefined}
          className="flex items-center gap-3 rounded-lg border border-current/20 bg-current/5 px-3 py-2 min-w-[180px] max-w-[260px] hover:bg-current/10 transition-colors"
        >
          <span className="text-2xl shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file_name ?? 'Document'}</p>
            <p className="text-xs opacity-60">
              {ext}{file_size ? ` · ${formatBytes(file_size)}` : ''}
            </p>
          </div>
          <span className="text-xs opacity-60 shrink-0">⬇</span>
        </a>
        {caption && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{caption}</p>}
      </div>
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
  onReply?: (msg: SupportMessage) => void;
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
