'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConversationList } from '@/components/livechat/ConversationList';

// Stubs to be replaced in Tasks 5 and 6
function ChatWindowStub({ sessionId }: { sessionId: number | null }) {
  if (!sessionId)
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
        Select a conversation to start chatting
      </div>
    );
  return (
    <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
      Chat window — Session #{sessionId}
    </div>
  );
}

function MemberCardStub({ sessionId }: { sessionId: number | null }) {
  if (!sessionId) return <div className="w-72 border-l bg-gray-50" />;
  return (
    <div className="w-72 border-l bg-gray-50 flex items-center justify-center text-xs text-gray-400">
      Member card
    </div>
  );
}

export default function LiveChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get('session');
  const selectedId = sessionParam ? parseInt(sessionParam, 10) : null;

  const handleSelect = useCallback(
    (id: number) => {
      router.push(`/livechat?session=${id}`, { scroll: false });
    },
    [router],
  );

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      <ConversationList selectedId={selectedId} onSelect={handleSelect} />
      <ChatWindowStub sessionId={selectedId} />
      <MemberCardStub sessionId={selectedId} />
    </div>
  );
}
