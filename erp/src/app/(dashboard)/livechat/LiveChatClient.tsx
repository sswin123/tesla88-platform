'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ConversationList } from '@/components/livechat/ConversationList';
import { ChatWindow } from '@/components/livechat/ChatWindow';
import { ReplyBox } from '@/components/livechat/ReplyBox';
import { MemberCard } from '@/components/livechat/MemberCard';
import { SessionActions } from '@/components/livechat/SessionActions';
import { NotesPanel } from '@/components/livechat/NotesPanel';
import { ChatSkeleton } from '@/components/livechat/ChatSkeleton';
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
    const id = sessionParam ? parseInt(sessionParam, 10) : null;
    setSelectedId(id);
    setMobilePanel(id !== null ? 'chat' : 'list');
  }, [sessionParam]);

  const [session, setSession] = useState<SupportSession | null>(null);
  const [member, setMember] = useState<MemberCardData | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [scrollToSessionId, setScrollToSessionId] = useState<number | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<SupportMessage | null>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    setScrollToSessionId(null);
  }, [selectedId]);

  useEffect(() => {
    setReplyToMessage(null);
  }, [selectedId]);

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

  // Mobile panel state — 'list' or 'chat'; initialized from URL for direct links
  const [mobilePanel, setMobilePanel] = useState<'list' | 'chat'>(
    sessionParam ? 'chat' : 'list',
  );

  // When a session is selected, switch to chat panel on mobile
  const handleSelect = useCallback(
    (id: number) => {
      setSelectedId(id);
      setMobilePanel('chat');
      router.push(`/livechat?session=${id}`, { scroll: false });
    },
    [router],
  );

  // Mobile back button — return to conversation list
  const handleMobileBack = useCallback(() => {
    setMobilePanel('list');
    setSelectedId(null);
    router.push('/livechat', { scroll: false });
  }, [router]);

  const handleMessageSent = useCallback((msg: SupportMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel: conversation list
          Desktop: w-80 always visible
          Mobile: full-width when on list panel, hidden when on chat panel */}
      <ConversationList
        selectedId={selectedId}
        onSelect={handleSelect}
        currentUsername={currentUsername}
        className={
          mobilePanel === 'chat'
            ? 'hidden lg:flex lg:w-80'
            : 'w-full lg:w-80'
        }
      />

      {/* Middle + Right: chat area + member card
          Desktop: always visible (flex-1 + w-72)
          Mobile: hidden when on list panel, full-width when on chat panel */}
      <div className={`flex flex-1 overflow-hidden ${mobilePanel === 'list' ? 'hidden lg:flex' : 'flex'}`}>

      {/* Middle: chat area — also acts as a drop zone for files */}
      {selectedId && session ? (
        <div
          className="flex flex-1 flex-col overflow-hidden relative"
          onDragEnter={(e) => {
            e.preventDefault();
            dragCounterRef.current++;
            if (e.dataTransfer.types.includes('Files')) setDroppedFile(null);
          }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDragLeave={(e) => {
            e.preventDefault();
            dragCounterRef.current--;
            if (dragCounterRef.current <= 0) dragCounterRef.current = 0;
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragCounterRef.current = 0;
            const file = e.dataTransfer.files[0];
            if (file) setDroppedFile(file);
          }}
        >
          {/* Session header */}
          <div className="flex flex-shrink-0 items-center gap-2 border-b bg-card px-4 py-2">
            {/* Mobile back button */}
            <button
              className="lg:hidden flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:bg-muted"
              onClick={handleMobileBack}
              aria-label="Back to conversations"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold font-mono">
                {session.guest_id
                  ? session.guest_id
                  : session.public_id
                    ? session.public_id
                    : member?.telegram_username
                      ? `@${member.telegram_username}`
                      : session.user_id
                        ? `UID ${session.user_id}`
                        : 'Guest'}
              </p>
              <p className="text-xs text-muted-foreground">
                {member?.first_name ?? '…'}
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
            userId={member?.id ?? 0}
            sessionId={selectedId}
            sessions={member?.previous_sessions ?? []}
            messages={messages}
            setMessages={setMessages}
            hasMore={hasMore}
            setHasMore={setHasMore}
            memberName={member?.first_name ?? 'User'}
            scrollToSessionId={scrollToSessionId}
            onScrollConsumed={() => setScrollToSessionId(null)}
            unreadCount={session?.erp_unread_count}
            onReply={setReplyToMessage}
          />

          {/* Reply box or closed notice */}
          {session.status !== 'CLOSED' ? (
            <ReplyBox
                sessionId={selectedId}
                onMessageSent={handleMessageSent}
                externalFile={droppedFile}
                onExternalFileConsumed={() => setDroppedFile(null)}
                replyToMessage={replyToMessage}
                onClearReply={() => setReplyToMessage(null)}
              />
          ) : (
            <div className="flex-shrink-0 border-t bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
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
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-shrink-0 items-center gap-2 border-b bg-card px-4 py-2">
            <button
              className="lg:hidden flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:bg-muted"
              onClick={handleMobileBack}
              aria-label="Back to conversations"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
          <ChatSkeleton />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select a conversation to start chatting
        </div>
      )}

      {/* Right: member card + notes — always hidden on mobile */}
      <div className="hidden lg:flex w-72 flex-shrink-0 flex-col overflow-y-auto border-l bg-card">
        {member && session ? (
          <MemberCard
            member={member}
            sessionId={session.id}
            onStatusChange={(s) => setMember((m) => (m ? { ...m, status: s } : m))}
            onSessionSelect={setScrollToSessionId}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Select a conversation
          </div>
        )}
        {session && <NotesPanel sessionId={session.id} />}
      </div>

      </div>{/* end chat+right wrapper */}
    </div>
  );
}
