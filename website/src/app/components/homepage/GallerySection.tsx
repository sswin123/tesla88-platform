interface GalleryImage {
  media_url: string;
  alt?:      string;
}

interface GalleryConfig {
  title?:   string;
  images?:  GalleryImage[];
  columns?: number;
}

export default function GallerySection({ config }: { config: GalleryConfig }) {
  const { title, images = [], columns = 3 } = config;
  if (images.length === 0) return null;

  const gridCols = columns === 2
    ? 'grid-cols-2'
    : columns === 4
      ? 'grid-cols-2 sm:grid-cols-4'
      : 'grid-cols-2 sm:grid-cols-3';

  return (
    <section className="space-y-3">
      {title && (
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>{title}</h2>
      )}
      <div className={`grid ${gridCols} gap-2`}>
        {images.map((img, i) => (
          <div key={i} className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
            <img
              src={img.media_url}
              alt={img.alt || ''}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
