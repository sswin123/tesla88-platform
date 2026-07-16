interface VipLevel {
  name:          string;
  min_deposit:   string;
  cashback:      string;
  weekly_bonus:  string;
  monthly_bonus: string;
}

interface VipCardConfig {
  title?:  string;
  levels?: VipLevel[];
}

const TIER_COLORS = [
  { bg: 'linear-gradient(135deg,#c0a060,#e8c97c)', text: '#3a2800' },
  { bg: 'linear-gradient(135deg,#6b6b80,#a8a8c0)', text: '#1a1a2e' },
  { bg: 'linear-gradient(135deg,#b87333,#d4965a)', text: '#2a1200' },
  { bg: 'linear-gradient(135deg,#7c3aed,#a855f7)', text: '#fff' },
];

export default function VipCardSection({ config }: { config: VipCardConfig }) {
  const { title = 'VIP 会员特权', levels = [] } = config;
  if (levels.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-base)' }}>{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {levels.map((lv, i) => {
          const { bg, text } = TIER_COLORS[i % TIER_COLORS.length];
          return (
            <div
              key={i}
              className="rounded-xl p-4 space-y-3"
              style={{ background: bg, color: text }}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-lg">{lv.name}</h3>
                <span className="text-xs opacity-70">最低 {lv.min_deposit}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: '返水', value: lv.cashback },
                  { label: '每周奖金', value: lv.weekly_bonus },
                  { label: '每月奖金', value: lv.monthly_bonus },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg p-2" style={{ background: 'rgba(0,0,0,0.15)' }}>
                    <div className="text-sm font-bold">{value}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
