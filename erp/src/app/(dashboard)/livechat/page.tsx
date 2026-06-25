'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConversationList } from '@/components/livechat/ConversationList';
import { ChatWindow } from '@/components/livechat/ChatWindow';
import { ReplyBox } from '@/components/livechat/ReplyBox';
import type { SupportSession, SupportMessage, MemberCardData } from '@/lib/types';

// MemberCard stub — replaced in Task 6
function MemberCardStub({
  member,
  session,
}: {
  member: MemberCardData | null;
  session: SupportSession | null;
}) {
  if (!member || !session)
    return <div className="w-72 border-l bg-gray-50 flex-shrink-0" />;
  return (
    <div className="w-72 border-l bg-gray-50 flex-shrink-0 p-3 overflow-y-auto">
      <h3 className="font-semibold text-sm mb-2">Member Card</h3>
      <p className="text-xs text-gray-500">UID: {member.id}</p>
      <p className="text-xs text-gray-500">{member.first_name}</p>
    </div>
  );
}

export default function LiveChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get('session');
  const selectedId = sessionParam ? parseInt(sessionParam, 10) : null;

  const [session, setSession] = useState<SupportSession | null>(null);
  const [member, setMember] = useState<MemberCardData | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);

  // Load session + member when selection changes; reset unread immediately
  useEffect(() => {
    if (!selectedId) {
      setSession(null);
      setMember(null);
      setMessages([]);
      return;
    }

    // Reset unread count immediately
    fetch(`/api/livechat/sessions/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_unread' }),
    }).catch(() => {});

    // Fetch session + member details (messages fetched inside ChatWindow)
    fetch(`/api/livechat/sessions/${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        setSession(d.session ?? null);
        setMember(d.member ?? null);
      })
      .catch(() => {});
  }, [selectedId]);

  const handleSelect = useCallback(
    (id: number) => {
      router.push(`/livechat?session=${id}`, { scroll: false });
    },
    [router],
  );

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      <ConversationList selectedId={selectedId} onSelect={handleSelect} />

      {/* Middle: Chat area */}
      {selectedId ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Session header */}
          <div className="flex items-center gap-3 border-b bg-white px-4 py-2 flex-shrink-0">
            <div>
              <p className="font-semibold text-sm">{member?.first_name ?? '…'}</p>
              <p className="text-xs text-gray-400">
                {member?.telegram_username
                  ? `@${member.telegram_username}`
                  : `UID ${session?.user_id ?? '…'}`}
                {' · '}Session #{selectedId}
              </p>
            </div>
            <div className="ml-auto">
              {session?.status === 'CLOSED' && (
                <span className="text-xs text-gray-400 italic">Closed</span>
              )}
            </div>
          </div>

          <ChatWindow
            sessionId={selectedId}
            messages={messages}
            setMessages={setMessages}
            memberName={member?.first_name ?? 'User'}
          />

          {session?.status !== 'CLOSED' ? (
            <ReplyBox
              sessionId={selectedId}
              onMessageSent={(m) => setMessages((prev) => [...prev, m])}
            />
          ) : (
            <div className="border-t bg-gray-50 text-center py-3 text-sm text-gray-400 flex-shrink-0">
              This conversation is closed.
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
          Select a conversation to start chatting
        </div>
      )}

      <MemberCardStub member={member} session={session} />
    </div>
  );
}
