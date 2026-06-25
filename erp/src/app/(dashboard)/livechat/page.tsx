import { Suspense } from 'react';
import LiveChatClient from './LiveChatClient';

export default function Page() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <LiveChatClient />
    </Suspense>
  );
}
