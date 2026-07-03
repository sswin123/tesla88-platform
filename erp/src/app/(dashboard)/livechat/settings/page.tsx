'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveChatSettingsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/livechat/quick-replies'); }, [router]);
  return (
    <div className="flex h-40 items-center justify-center text-gray-400 text-sm">
      Redirecting to Quick Replies…
    </div>
  );
}
