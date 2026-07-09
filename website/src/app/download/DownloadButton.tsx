'use client';

export function DownloadButton({ href, apkId }: { href: string; apkId: number }) {
  async function handleClick() {
    await fetch('/api/public/apk', {
      method: 'POST',
      body: JSON.stringify({ id: apkId }),
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return (
    <a
      href={href}
      onClick={handleClick}
      className="block w-full py-3 text-center rounded-lg font-semibold btn-brand"
      download
    >
      Download APK
    </a>
  );
}
