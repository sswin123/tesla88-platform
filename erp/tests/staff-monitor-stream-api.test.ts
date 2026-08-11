import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/require_permission', () => ({ requirePermissionStrict: vi.fn() }));
vi.mock('pg', () => ({ Client: vi.fn() }));
vi.mock('@/lib/repositories/staff_monitor_repo', () => ({ getStaffRole: vi.fn() }));

import { requirePermissionStrict } from '@/lib/require_permission';
import { Client } from 'pg';
import { getStaffRole } from '@/lib/repositories/staff_monitor_repo';
import { GET, resolveMonitorStreamFrame } from '@/app/api/staff/monitor/stream/route';

beforeEach(() => vi.clearAllMocks());

function makeReq() {
  const controller = new AbortController();
  return new Request('http://localhost/api/staff/monitor/stream', { signal: controller.signal });
}

describe('GET /api/staff/monitor/stream', () => {
  it('returns 401 without establishing a DB connection when not logged in', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 401 });
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
    expect(Client).not.toHaveBeenCalled();
  });

  it('returns 403 without establishing a DB connection when permission denied', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: false, status: 403 });
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(403);
    expect(Client).not.toHaveBeenCalled();
  });
});

describe('resolveMonitorStreamFrame — SUPER_ADMIN visibility (Task 8B + Live Monitor visibility fix)', () => {
  const PAYLOAD = JSON.stringify({ type: 'status_update', staff_id: 1, status: 'ONLINE', current_module: null, current_page: null, last_activity: '2026-08-11T00:00:00.000Z' });

  it('Test 6: a SUPER_ADMIN viewer gets every event verbatim, without even looking up the target role', async () => {
    const frame = await resolveMonitorStreamFrame(PAYLOAD, 'SUPER_ADMIN');
    expect(frame).toBe(`data: ${PAYLOAD}\n\n`);
    expect(getStaffRole).not.toHaveBeenCalled();
  });

  it('Test 5: a normal Admin viewer never receives an event whose staff_id is a SUPER_ADMIN', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('SUPER_ADMIN');
    const frame = await resolveMonitorStreamFrame(PAYLOAD, 'CS');
    expect(frame).toBeNull();
    expect(getStaffRole).toHaveBeenCalledWith(1);
  });

  it('a normal Admin viewer still receives events about non-SUPER_ADMIN staff', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('CS');
    const frame = await resolveMonitorStreamFrame(PAYLOAD, 'CS');
    expect(frame).toBe(`data: ${PAYLOAD}\n\n`);
  });

  it('a malformed payload is forwarded unchanged rather than silently dropped (not a security boundary — NOTIFY is only ever produced by our own DB trigger)', async () => {
    const frame = await resolveMonitorStreamFrame('not-json', 'CS');
    expect(frame).toBe('data: not-json\n\n');
    expect(getStaffRole).not.toHaveBeenCalled();
  });

  it('a payload with no staff_id is forwarded unchanged rather than crashing the role lookup', async () => {
    const frame = await resolveMonitorStreamFrame(JSON.stringify({ type: 'other' }), 'CS');
    expect(frame).toBe(`data: ${JSON.stringify({ type: 'other' })}\n\n`);
    expect(getStaffRole).not.toHaveBeenCalled();
  });
});

describe('GET /api/staff/monitor/stream — end-to-end wiring (SUPER_ADMIN visibility)', () => {
  type NotificationHandler = (msg: { payload: string }) => void;

  function makeMockClient() {
    const handlers: Record<string, NotificationHandler> = {};
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, cb: NotificationHandler) => { handlers[event] = cb; }),
      __handlers: handlers,
    };
  }

  async function readNextFrame(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs = 50): Promise<string | 'timeout'> {
    const decoder = new TextDecoder();
    const result = await Promise.race([
      reader.read().then((r) => (r.done ? 'timeout' as const : decoder.decode(r.value))),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
    ]);
    return result;
  }

  it('a SUPER_ADMIN connection forwards a SUPER_ADMIN staff_id event through the real stream', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 1, username: 'root', role: 'SUPER_ADMIN', iat: 0, exp: 0 } });
    const mockClient = makeMockClient();
    vi.mocked(Client).mockImplementation(() => mockClient as never);

    const res = await GET(makeReq() as never);
    const reader = res.body!.getReader();
    await readNextFrame(reader); // ": connected\n\n"

    const payload = JSON.stringify({ type: 'status_update', staff_id: 1, status: 'ONLINE' });
    mockClient.__handlers.notification({ payload });

    const frame = await readNextFrame(reader);
    expect(frame).toBe(`data: ${payload}\n\n`);
  });

  it('a normal Admin connection suppresses an event about a SUPER_ADMIN staff_id — nothing is enqueued', async () => {
    vi.mocked(requirePermissionStrict).mockResolvedValue({ ok: true, payload: { sub: 2, username: 'cs1', role: 'CS', iat: 0, exp: 0 } });
    vi.mocked(getStaffRole).mockResolvedValue('SUPER_ADMIN');
    const mockClient = makeMockClient();
    vi.mocked(Client).mockImplementation(() => mockClient as never);

    const res = await GET(makeReq() as never);
    const reader = res.body!.getReader();
    await readNextFrame(reader); // ": connected\n\n"

    const payload = JSON.stringify({ type: 'status_update', staff_id: 9, status: 'ONLINE' });
    mockClient.__handlers.notification({ payload });

    const frame = await readNextFrame(reader);
    expect(frame).toBe('timeout'); // nothing arrived — the event was suppressed
  });
});
