import pool from '@/lib/db';
import type { ApkVersion } from '@/lib/types';
import { DownloadButton } from './DownloadButton';

export const dynamic = 'force-dynamic';

export default async function DownloadPage() {
  const res = await pool.query<ApkVersion>(
    'SELECT id, version_name, version_code, release_notes, media_id, min_android, download_count, created_at FROM apk_versions WHERE is_current = TRUE LIMIT 1'
  );
  const apk = res.rows[0] ?? null;

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Download App</h1>
      <p className="text-gray-500 mb-8">Get the latest version of our Android app.</p>
      {!apk ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-3">🚀</div>
          <p className="text-gray-600">App coming soon. Check back later!</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="text-5xl">📱</div>
            <div>
              <h2 className="text-xl font-bold">Version {apk.version_name}</h2>
              <p className="text-sm text-gray-500">Build {apk.version_code} · Android {apk.min_android}+</p>
              <p className="text-sm text-gray-400">{apk.download_count.toLocaleString()} downloads</p>
            </div>
          </div>
          {apk.release_notes && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">What&apos;s New</h3>
              <p className="text-sm text-gray-600 whitespace-pre-line">{apk.release_notes}</p>
            </div>
          )}
          <DownloadButton href={apk.media_id ? `/api/public/media/${apk.media_id}` : '#'} apkId={apk.id} />
          <p className="mt-3 text-xs text-gray-400 text-center">Enable &quot;Install from unknown sources&quot; in Android settings before installing.</p>
        </div>
      )}
    </div>
  );
}
