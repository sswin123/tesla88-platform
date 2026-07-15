import pool from '@/lib/db';

interface ProviderRow {
  id: number;
  name: string;
  display_name: string | null;
  logo_media_id: number | null;
  logo_url: string | null;
}

interface ProvidersConfig {
  title?: string;
  columns?: number;
}

async function getProviders(): Promise<ProviderRow[]> {
  try {
    const { rows } = await pool.query<ProviderRow>(
      `SELECT id, name, display_name, logo_media_id, logo_url
       FROM website_game_providers
       WHERE is_active = TRUE
       ORDER BY display_order ASC, id ASC
       LIMIT 20`
    );
    return rows;
  } catch {
    return [];
  }
}

export default async function ProvidersSection({ config }: { config: ProvidersConfig }) {
  const { title = '游戏合作伙伴', columns = 4 } = config;
  const providers = await getProviders();
  if (providers.length === 0) {
    return (
      <section>
        {title && (
          <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--text-base)' }}>{title}</h2>
        )}
        <div
          className="flex flex-col items-center justify-center py-10 rounded-2xl"
          style={{ background: 'var(--bg-surface2)' }}
        >
          <div className="text-3xl mb-2">🎰</div>
          <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-base)' }}>Coming Soon</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>游戏平台即将接入，敬请期待</p>
        </div>
      </section>
    );
  }

  const colMap: Record<number, string> = {
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  };
  const gridClass = colMap[columns] ?? 'grid-cols-4';

  return (
    <section>
      {title && (
        <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--text-base)' }}>{title}</h2>
      )}
      <div className={`grid ${gridClass} gap-2`}>
        {providers.map(p => {
          const logoSrc = p.logo_media_id
            ? `/api/public/media/${p.logo_media_id}`
            : p.logo_url ?? null;

          return (
            <div
              key={p.id}
              className="casino-card p-2 flex flex-col items-center justify-center gap-1 text-center"
            >
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt={p.display_name ?? p.name}
                  className="w-9 h-9 object-contain"
                  loading="lazy"
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--brand-primary)' }}
                >
                  {(p.display_name ?? p.name).slice(0, 2).toUpperCase()}
                </div>
              )}
              <p className="text-xs font-medium leading-tight" style={{ color: 'var(--text-muted)' }}>
                {p.display_name ?? p.name}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
