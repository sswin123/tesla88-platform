import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('@/lib/member-auth', () => ({ getMember: vi.fn().mockResolvedValue({ sub: 1, phone: '0123456789', first_name: 'Alice' }) }));

import pool from '@/lib/db';
import { getMember } from '@/lib/member-auth';
import { GET as getSession } from '@/app/api/livechat/session/route';
import { GET as getMessages, POST as postMessage } from '@/app/api/livechat/messages/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(method: string, body?: unknown, search?: string) {
  return new Request(`http://localhost/${search ?? ''}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

/* ── Session ──────────────────────────────────────────────────── */

describe('GET /api/livechat/session', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await getSession();
    expect(res.status).toBe(401);
  });

  it('returns existing open session', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 5, status: 'OPEN', created_at: new Date().toISOString() }] } as never);
    const res = await getSession();
    expect(res.status).toBe(200);
    const data = await res.json() as { id: number };
    expect(data.id).toBe(5);
  });

  it('creates new session when none exists', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 10, status: 'OPEN', created_at: new Date().toISOString() }] } as never);
    const res = await getSession();
    expect(res.status).toBe(201);
    const data = await res.json() as { id: number; status: string };
    expect(data.id).toBe(10);
    expect(data.status).toBe('OPEN');
  });

  it('queries with correct user_id for session isolation', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: 7, status: 'ACTIVE', created_at: new Date().toISOString() }] } as never);
    await getSession();
    const callArgs = vi.mocked(pool.query).mock.calls[0];
    expect(callArgs[1]).toEqual([1]); /* member.sub = 1 */
  });
});

/* ── Send message ─────────────────────────────────────────────── */

describe('POST /api/livechat/messages', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await postMessage(makeReq('POST', { session_id: 1, content: 'hi' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 when session_id missing', async () => {
    const res = await postMessage(makeReq('POST', { content: 'hi' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when content missing', async () => {
    const res = await postMessage(makeReq('POST', { session_id: 1 }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 404 when session not found or closed', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await postMessage(makeReq('POST', { session_id: 99, content: 'hi' }) as never);
    expect(res.status).toBe(404);
  });

  it('returns 201 on success', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 50, created_at: new Date().toISOString() }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const res = await postMessage(makeReq('POST', { session_id: 1, content: 'Hello' }) as never);
    expect(res.status).toBe(201);
    const data = await res.json() as { ok: boolean; id: number };
    expect(data.ok).toBe(true);
    expect(data.id).toBe(50);
  });

  it('session ownership check uses member user_id', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    await postMessage(makeReq('POST', { session_id: 5, content: 'hi' }) as never);
    const callArgs = vi.mocked(pool.query).mock.calls[0];
    /* Second param should be [session_id, member.sub] */
    expect(callArgs[1]).toEqual([5, 1]);
  });
});

/* ── Receive messages ─────────────────────────────────────────── */

describe('GET /api/livechat/messages', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getMember).mockResolvedValueOnce(null);
    const res = await getMessages(makeReq('GET') as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 when session_id missing', async () => {
    const res = await getMessages(makeReq('GET') as never);
    expect(res.status).toBe(400);
  });

  it('returns 403 when session does not belong to member (session isolation)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getMessages(new Request('http://localhost/?session_id=99') as never);
    expect(res.status).toBe(403);
  });

  it('ownership check passes user_id to query', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await getMessages(new Request('http://localhost/?session_id=1') as never);
    const callArgs = vi.mocked(pool.query).mock.calls[0];
    expect(callArgs[1]).toEqual(['1', 1]); /* session_id string, member.sub number */
  });

  it('returns messages array ordered by created_at', async () => {
    const now = new Date().toISOString();
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      .mockResolvedValueOnce({
        rows: [
          { id: 1, sender_type: 'AGENT', message_type: 'TEXT', content: '你好！', caption: null, created_at: now },
          { id: 2, sender_type: 'USER',  message_type: 'TEXT', content: '你好',  caption: null, created_at: now },
        ],
      } as never);
    const res = await getMessages(new Request('http://localhost/?session_id=1') as never);
    expect(res.status).toBe(200);
    const data = await res.json() as { id: number; sender_type: string }[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
    expect(data[0].sender_type).toBe('AGENT');
    expect(data[1].sender_type).toBe('USER');
  });
});
