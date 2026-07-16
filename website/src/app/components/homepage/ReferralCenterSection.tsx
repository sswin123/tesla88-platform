import Link from 'next/link';

interface ReferralCenterConfig {
  title?:               string;
  subtitle?:            string;
  bonus_per_referral?:  string;
  button_text?:         string;
}

export default function ReferralCenterSection({ config }: { config: ReferralCenterConfig }) {
  const {
    title              = '推荐好友',
    subtitle           = '每成功推荐一位好友即可获得奖励',
    bonus_per_referral = 'RM 50',
    button_text        = '立即推荐',
  } = config;

  return (
    <section
      className="rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
      style={{
        background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          🎁
        </div>
        <div>
          <p className="font-bold text-white text-base">{title}</p>
          <p className="text-sm text-white/75 mt-0.5">{subtitle}</p>
          <p className="text-lg font-black text-white mt-1">
            奖励：{bonus_per_referral} / 人
          </p>
        </div>
      </div>
      <Link
        href="/profile/invite"
        className="flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-80"
        style={{ background: '#fff', color: 'var(--brand-primary)' }}
      >
        {button_text}
      </Link>
    </section>
  );
}
