/**
 * Partner pages layout — standalone, no casino chrome.
 * The root layout is bypassed for /p/* routes via middleware + conditional render.
 */
export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
