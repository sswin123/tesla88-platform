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
  });
});

describe('POST /api/livechat/messages', () => {
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
  });
});

describe('GET /api/livechat/messages', () => {
  it('returns 400 when session_id missing', async () => {
    const res = await getMessages(makeReq('GET') as never);
    expect(res.status).toBe(400);
  });

  it('returns 403 when session does not belong to member', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);
    const res = await getMessages(new Request('http://localhost/?session_id=99') as never);
    expect(res.status).toBe(403);
  });

  it('returns messages array', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 1, sender_type: 'USER', content: 'hi', created_at: new Date().toISOString() }] } as never);
    const res = await getMessages(new Request('http://localhost/?session_id=1') as never);
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
  });
});
