interface ProviderLogoAvatarProps {
  providerCode: string;
  size?: 'sm' | 'md';
}

export function ProviderLogoAvatar({ providerCode, size = 'md' }: ProviderLogoAvatarProps) {
  const initials = providerCode.slice(0, 2).toUpperCase();
  const px = size === 'sm' ? 28 : 36;
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <div
      className={`flex items-center justify-center rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold shrink-0 ${textSize}`}
      style={{ width: px, height: px }}
    >
      {initials}
    </div>
  );
}
