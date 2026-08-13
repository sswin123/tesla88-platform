/**
 * Partner pages layout — this file stays a pass-through.
 * The root layout renders CasinoHeader + BottomNav for /p/* routes (same
 * data-driven chrome as the rest of the site) but skips the account-only
 * shell (MemberPanel sidebar, max-w-7xl container, Providers) so Partner
 * Builder's own --pb-* themed content controls its own full-width layout.
 * See the `isPartnerPage` branch in src/app/layout.tsx.
 */
export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
