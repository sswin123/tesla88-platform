import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import LiveChatClient from './LiveChatClient';

export default async function Page() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyJWT(token) : null;

  return (
    <Suspense fallback={<div>Loading…</div>}>
      <LiveChatClient
        currentUsername={payload?.username ?? null}
        currentRole={payload?.role ?? null}
      />
    </Suspense>
  );
}
