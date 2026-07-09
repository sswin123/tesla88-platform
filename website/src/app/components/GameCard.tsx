interface Props {
  title: string;
  subtitle?: string;
  badge?: string;
  imageUrl?: string;
  emoji?: string;
  href?: string;
  onClick?: () => void;
}

export default function GameCard({ title, subtitle, badge, imageUrl, emoji, href, onClick }: Props) {
  const content = (
    <div
      className="casino-card casino-card-hover relative overflow-hidden cursor-pointer transition-all duration-200"
      style={{ aspectRatio: '3/4', minHeight: '160px' }}
      onClick={onClick}
    >
      {/* Background image or emoji placeholder */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center text-4xl"
          style={{ background: 'var(--bg-surface2)' }}
        >
          {emoji ?? '🎮'}
        </div>
      )}

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, rgba(10,11,20,0.95) 0%, rgba(10,11,20,0.2) 60%, transparent 100%)',
        }}
      />

      {/* Badge */}
      {badge && (
        <span
          className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-bold"
          style={{
            background: 'var(--brand-primary)',
            color: '#fff',
            boxShadow: '0 0 8px color-mix(in srgb, var(--brand-primary) 50%, transparent)',
          }}
        >
          {badge}
        </span>
      )}

      {/* Title */}
      <div className="absolute bottom-0 inset-x-0 p-3">
        <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-base)' }}>
          {title}
        </p>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} style={{ textDecoration: 'none' }}>
        {content}
      </a>
    );
  }
  return content;
}
