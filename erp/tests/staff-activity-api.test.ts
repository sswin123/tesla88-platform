import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyJWT: vi.fn(), COOKIE_NAME: 'erp_session' }));
vi.mock('@/lib/repositories/staff_monitor_repo', () => ({
  getOnlineStatus:    vi.fn(),
  upsertOnlineStatus: vi.fn(),
  logActivity:        vi.fn(),
}));

import { cookies } from 'next/headers';
import { verifyJWT } from '@/lib/auth';
import { getOnlineStatus, upsertOnlineStatus, logActivity } from '@/lib/repositories/staff_monitor_repo';
import { POST } from '@/app/api/staff/activity/route';

beforeEach(() => vi.clearAllMocks());

function makeReq(body: unknown) {
  return new Request('http://localhost/api/staff/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537', 'x-forwarded-for': '10.0.0.5' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/staff/activity', () => {
  it('returns 401 when not logged in', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
    const res = await POST(makeReq({ module: 'member', page: 'list' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid module', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }) } as never);
    vi.mocked(verifyJWT).mockResolvedValue({ sub: 1, username: 'a', role: 'ADMIN', iat: 0, exp: 9999999999 } as never);
    const res = await POST(makeReq({ module: 'not-real', page: 'list' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid page', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }) } as never);
    vi.mocked(verifyJWT).mockResolvedValue({ sub: 1, username: 'a', role: 'ADMIN', iat: 0, exp: 9999999999 } as never);
    const res = await POST(makeReq({ module: 'member', page: 'not-real' }) as never);
    expect(res.status).toBe(400);
  });

  it('upserts status and returns 200 on valid heartbeat', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }) } as never);
    vi.mocked(verifyJWT).mockResolvedValue({ sub: 1, username: 'a', role: 'ADMIN', iat: 0, exp: 9999999999 } as never);
    vi.mocked(getOnlineStatus).mockResolvedValue(null);
    const res = await POST(makeReq({ module: 'member', page: 'list' }) as never);
    expect(res.status).toBe(200);
    expect(upsertOnlineStatus).toHaveBeenCalledWith(1, { module: 'member', page: 'list', ip: '10.0.0.5', browser: 'Chrome', device: 'Desktop', operatingSystem: 'Windows' });
  });

  it('logs a PAGE_VIEW activity when module/page changed since last heartbeat', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }) } as never);
    vi.mocked(verifyJWT).mockResolvedValue({ sub: 1, username: 'a', role: 'ADMIN', iat: 0, exp: 9999999999 } as never);
    vi.mocked(getOnlineStatus).mockResolvedValue({ current_module: 'dashboard', current_page: 'view' } as never);
    await POST(makeReq({ module: 'member', page: 'list' }) as never);
    expect(logActivity).toHaveBeenCalledWith(1, 'PAGE_VIEW', 'member', 'list');
  });

  it('does not log an activity when module/page is unchanged', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: 'tok' }) } as never);
    vi.mocked(verifyJWT).mockResolvedValue({ sub: 1, username: 'a', role: 'ADMIN', iat: 0, exp: 9999999999 } as never);
    vi.mocked(getOnlineStatus).mockResolvedValue({ current_module: 'member', current_page: 'list' } as never);
    await POST(makeReq({ module: 'member', page: 'list' }) as never);
    expect(logActivity).not.toHaveBeenCalled();
  });
});
