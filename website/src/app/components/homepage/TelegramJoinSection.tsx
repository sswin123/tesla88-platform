import Link from 'next/link';

interface TelegramJoinConfig {
  title?:        string;
  subtitle?:     string;
  telegram_url?: string;
  button_text?:  string;
  bg_color?:     string;
}

export default function TelegramJoinSection({ config }: { config: TelegramJoinConfig }) {
  const {
    title       = '加入我们的 Telegram',
    subtitle    = '获取最新优惠和活动资讯',
    telegram_url = '#',
    button_text = '立即加入',
    bg_color,
  } = config;

  return (
    <section
      className="rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
      style={{ background: bg_color || 'linear-gradient(135deg,#0088cc,#005f8e)' }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          ✈
        </div>
        <div>
          <p className="font-bold text-white text-base">{title}</p>
          {subtitle && <p className="text-sm text-white/70 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <Link
        href={telegram_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-80"
        style={{ background: '#fff', color: '#0088cc' }}
      >
        {button_text}
      </Link>
    </section>
  );
}
