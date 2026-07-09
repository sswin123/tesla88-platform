'use client';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatSession } from '@/lib/types';

export default function ChatPage() {
  const [session, setSession]   = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Get or create session
    fetch('/api/livechat/session')
      .then(r => r.json())
      .then(async (s: ChatSession) => {
        setSession(s);
        const msgs = await fetch(`/api/livechat/messages?session_id=${s.id}`).then(r => r.json()) as ChatMessage[];
        setMessages(msgs);

        // Connect SSE
        const lastId = msgs.length > 0 ? msgs[msgs.length - 1].id : 0;
        const es = new EventSource(`/api/livechat/stream?session_id=${s.id}&last_id=${lastId}`);
        es.onmessage = (e) => {
          const data = JSON.parse(e.data as string) as { type: string } & ChatMessage;
          if (data.type === 'message') setMessages(prev => [...prev, data]);
          if (data.type === 'session_closed') { es.close(); setSession(prev => prev ? { ...prev, status: 'CLOSED' } : prev); }
        };
        return () => es.close();
      })
      .catch(() => setError('Failed to connect. Please refresh.'));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !session || sending) return;
    setSending(true);
    const res = await fetch('/api/livechat/messages', {
      method: 'POST',
      body: JSON.stringify({ session_id: session.id, content: input.trim() }),
      headers: { 'Content-Type': 'application/json' },
    });
    setSending(false);
    if (res.ok) {
      setMessages(prev => [...prev, { id: Date.now(), sender_type: 'USER', message_type: 'TEXT', content: input.trim(), caption: null, created_at: new Date().toISOString() }]);
      setInput('');
    }
  }

  if (error) return <div className="text-center py-12 text-red-400">{error}</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Live Support</h1>
      <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ height: '65vh' }}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${session?.status === 'ACTIVE' ? 'bg-green-500' : 'bg-yellow-400'}`} />
          <span className="text-sm font-medium">{session?.status === 'ACTIVE' ? 'Agent connected' : 'Waiting for agent…'}</span>
          {session?.status === 'CLOSED' && <span className="text-xs text-gray-400 ml-auto">Session closed</span>}
        </div>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 text-sm mt-8">
              <p>How can we help you today?</p>
              <p className="mt-1">Our team will respond shortly.</p>
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.sender_type === 'USER' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs px-3 py-2 rounded-2xl text-sm ${
                m.sender_type === 'USER'
                  ? 'bubble-brand rounded-br-sm'
                  : 'bg-gray-100 text-gray-900 rounded-bl-sm'
              }`}>
                {m.content}
                <div className={`text-xs mt-0.5 ${m.sender_type === 'USER' ? 'bubble-brand-time' : 'text-gray-400'}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {/* Input */}
        <form onSubmit={sendMessage} className="border-t border-gray-200 p-3 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={session?.status === 'CLOSED' ? 'Session closed' : 'Type a message…'}
            disabled={!session || session.status === 'CLOSED'}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm input-brand disabled:bg-gray-50"
          />
          <button type="submit" disabled={!input.trim() || !session || session.status === 'CLOSED' || sending}
            className="px-4 py-2 btn-brand rounded-lg text-sm font-medium disabled:opacity-50">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
