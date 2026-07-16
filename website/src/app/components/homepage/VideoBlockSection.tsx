interface VideoBlockConfig {
  title?:      string;
  video_url?:  string;
  poster_url?: string;
  autoplay?:   boolean;
  muted?:      boolean;
  loop?:       boolean;
}

function isYouTube(url: string) {
  return url.includes('youtube.com/embed') || url.includes('youtu.be');
}

export default function VideoBlockSection({ config }: { config: VideoBlockConfig }) {
  const { title, video_url, poster_url, autoplay, muted = true, loop } = config;
  if (!video_url) return null;

  return (
    <section className="space-y-3">
      {title && (
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>{title}</h2>
      )}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
        {isYouTube(video_url) ? (
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={video_url}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : (
          <video
            src={video_url}
            poster={poster_url || undefined}
            autoPlay={autoplay}
            muted={muted}
            loop={loop}
            playsInline
            controls={!autoplay}
            preload="metadata"
            className="w-full"
          />
        )}
      </div>
    </section>
  );
}
