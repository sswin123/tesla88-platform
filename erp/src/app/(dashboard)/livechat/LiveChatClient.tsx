'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConversationList } from '@/components/livechat/ConversationList';
import { ChatWindow } from '@/components/livechat/ChatWindow';
import { ReplyBox } from '@/components/livechat/ReplyBox';
import { MemberCard } from '@/components/livechat/MemberCard';
import { SessionActions } from '@/components/livechat/SessionActions';
import { NotesPanel } from '@/components/livechat/NotesPanel';
import type { SupportSession, SupportMessage, MemberCardData } from '@/lib/types';

export default function LiveChatClient({
  currentUsername,
  currentRole,
}: {
  currentUsername: string | null;
  currentRole: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get('session');

  // selectedId is local state so clicks respond immediately without waiting for
  // useSearchParams() to update across the Suspense/server-render cycle.
  const [selectedId, setSelectedId] = useState<number | null>(
    sessionParam ? parseInt(sessionParam, 10) : null,
  );

  // Sync with URL so back/forward navigation and direct links still work.
  useEffect(() => {
    setSelectedId(sessionParam ? parseInt(sessionParam, 10) : null);
  }, [sessionParam]);

  const [session, setSession] = useState<SupportSession | null>(null);
  const [member, setMember] = useState<MemberCardData | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  // Load session + member when selection changes; reset unread immediately
  useEffect(() => {
    if (!selectedId) {
      setSession(null);
      setMember(null);
      setMessages([]);
      setHasMore(false);
      return;
    }

    setLoadingSession(true);

    fetch(`/api/livechat/sessions/${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        setSession((d as { session?: SupportSession }).session ?? null);
        setMember((d as { member?: MemberCardData }).member ?? null);
        setMessages((d as { messages?: SupportMessage[] }).messages ?? []);
        setHasMore((d as { hasMore?: boolean }).hasMore ?? false);
        setLoadingSession(false);

        // Reset unread count after loading
        fetch(`/api/livechat/sessions/${selectedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset_unread' }),
        }).catch(() => {});
      })
      .catch(() => setLoadingSession(false));
  }, [selectedId]);

  const handleSelect = useCallback(
    (id: number) => {
      setSelectedId(id);
      router.push(`/livechat?session=${id}`, { scroll: false });
    },
    [router],
  );

  const handleMessageSent = useCallback((msg: SupportMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Left: conversation list */}
      <ConversationList selectedId={selectedId} onSelect={handleSelect} currentUsername={currentUsername} />

      {/* Middle: chat area */}
      {selectedId && session ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Session header */}
          <div className="flex flex-shrink-0 items-center gap-3 border-b bg-white px-4 py-2">
            <div>
              <p className="text-sm font-semibold">{member?.first_name ?? '…'}</p>
              <p className="text-xs text-gray-400">
                {member?.telegram_username
                  ? `@${member.telegram_username}`
                  : `UID ${session.user_id}`}
                {' · '}Session #{selectedId}
              </p>
            </div>
          </div>

          {/* Actions toolbar */}
          <SessionActions
              session={session}
              onUpdate={(s) => setSession(s)}
              onNewSession={(s) => handleSelect(s.id)}
              currentUsername={currentUsername}
              currentRole={currentRole}
            />

          {/* Messages */}
          <ChatWindow
            sessionId={selectedId}
            messages={messages}
            setMessages={setMessages}
            hasMore={hasMore}
            setHasMore={setHasMore}
            memberName={member?.first_name ?? 'User'}
          />

          {/* Reply box or closed notice */}
          {session.status !== 'CLOSED' ? (
            <ReplyBox sessionId={selectedId} onMessageSent={handleMessageSent} />
          ) : (
            <div className="flex-shrink-0 border-t bg-gray-50 px-4 py-3 text-center text-sm text-gray-400">
              This conversation is closed.{' '}
              <button
                className="text-blue-500 underline"
                onClick={() =>
                  fetch(`/api/livechat/sessions/${selectedId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reopen' }),
                  })
                    .then((r) => r.json())
                    .then((d) => {
                      if ((d as { session?: SupportSession }).session) {
                        setSession((d as { session: SupportSession }).session);
                      }
                    })
                    .catch(() => {})
                }
              >
                Reopen
              </button>
            </div>
          )}
        </div>
      ) : loadingSession ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          Loading…
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          Select a conversation to start chatting
        </div>
      )}

      {/* Right: member card + notes */}
      <div className="w-72 flex-shrink-0 overflow-y-auto border-l bg-white">
        {member && session ? (
          <MemberCard
            member={member}
            sessionId={session.id}
            onStatusChange={(s) => setMember((m) => (m ? { ...m, status: s } : m))}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">
            Select a conversation
          </div>
        )}
        {session && <NotesPanel sessionId={session.id} />}
      </div>
    </div>
  );
}
