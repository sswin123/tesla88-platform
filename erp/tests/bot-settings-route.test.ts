import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  verifyJWT:   vi.fn().mockResolvedValue({ sub: 1, username: 'superadmin', role: 'SUPER_ADMIN' }),
  COOKIE_NAME: 'token',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

const mockGetAllSettings  = vi.fn();
const mockSetSettings     = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/repositories/settings_repo', () => ({
  getAllSettings: (...a: unknown[]) => mockGetAllSettings(...a),
  setSettings:   (...a: unknown[]) => mockSetSettings(...a),
}));

vi.mock('@/lib/repositories/audit_repo', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/media', () => ({
  mediaService: {
    save: vi.fn(),
  },
  MediaValidationError: class extends Error {},
}));

const mockGetMe                 = vi.fn();
const mockSetMyName             = vi.fn();
const mockSetMyDescription      = vi.fn();
const mockSetMyShortDescription = vi.fn();

vi.mock('@/lib/telegram/bot_api', () => ({
  getMe:                (...a: unknown[]) => mockGetMe(...a),
  setMyName:            (...a: unknown[]) => mockSetMyName(...a),
  setMyDescription:     (...a: unknown[]) => mockSetMyDescription(...a),
  setMyShortDescription:(...a: unknown[]) => mockSetMyShortDescription(...a),
}));

// Stub BOT_TOKEN before importing routes
vi.stubEnv('BOT_TOKEN', 'test:abc123xyz');

import { GET, PATCH } from '../src/app/api/settings/bot/route';
import { POST as syncPost } from '../src/app/api/settings/bot/sync/route';

// ── Helpers ────────────────────────────────────────────────────────────────

const SETTINGS_DB = [
  { key: 'bot_name',     value: 'OldName' },
  { key: 'bot_username', value: 'oldbot' },
  { key: 'bot_description', value: 'Old description' },
];

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/settings/bot', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllSettings.mockResolvedValue(SETTINGS_DB);
  mockSetMyName.mockResolvedValue({ ok: true, result: true });
  mockSetMyDescription.mockResolvedValue({ ok: true, result: true });
  mockSetMyShortDescription.mockResolvedValue({ ok: true, result: true });
  mockGetMe.mockResolvedValue({
    ok: true,
    result: { id: 123456789, is_bot: true, first_name: 'NewName', username: 'newbot' },
  });
});

// ── Test 1: Save display name calls setMyName ──────────────────────────────

describe('Test 1 — Save display name calls setMyName', () => {
  it('calls setMyName when bot_name is in PATCH body', async () => {
    const req = makeRequest({ bot_name: 'MyBot' });
    const res = await PATCH(req);
    const body = await res.json() as { ok: boolean };

    expect(body.ok).toBe(true);
    expect(mockSetMyName).toHaveBeenCalledOnce();
    expect(mockSetMyName).toHaveBeenCalledWith('test:abc123xyz', 'MyBot');
  });
});

// ── Test 2: Save description calls setMyDescription ───────────────────────

describe('Test 2 — Save description calls setMyDescription', () => {
  it('calls setMyDescription when bot_description is in PATCH body', async () => {
    const req = makeRequest({ bot_description: 'New description' });
    const res = await PATCH(req);
    const body = await res.json() as { ok: boolean };

    expect(body.ok).toBe(true);
    expect(mockSetMyDescription).toHaveBeenCalledOnce();
    expect(mockSetMyDescription).toHaveBeenCalledWith('test:abc123xyz', 'New description');
  });
});

// ── Test 3: Username cannot be updated via PATCH ───────────────────────────

describe('Test 3 — Username cannot be updated', () => {
  it('strips bot_username from PATCH and does not call Telegram', async () => {
    const req = makeRequest({ bot_username: 'hackedbot' });
    const res = await PATCH(req);

    expect(res.status).toBe(400); // no valid writable keys remain
    expect(mockSetMyName).not.toHaveBeenCalled();
    expect(mockSetSettings).not.toHaveBeenCalled();
  });

  it('does not update bot_username even if combined with other keys', async () => {
    const req = makeRequest({ bot_name: 'NewName', bot_username: 'hackedbot' });
    await PATCH(req);

    // setSettings should be called but bot_username must NOT be included
    const callArgs = mockSetSettings.mock.calls[0][0] as Record<string, string>;
    expect(callArgs).not.toHaveProperty('bot_username');
    expect(callArgs).toHaveProperty('bot_name', 'NewName');
  });
});

// ── Test 4: Sync button refreshes getMe data ──────────────────────────────

describe('Test 4 — Sync button refreshes getMe data', () => {
  it('POST /api/settings/bot/sync calls getMe and updates settings', async () => {
    const res  = await syncPost();
    const body = await res.json() as { ok: boolean; bot_username: string; bot_name: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.bot_username).toBe('newbot');
    expect(body.bot_name).toBe('NewName');

    expect(mockGetMe).toHaveBeenCalledOnce();

    // setSettings must be called with the data from getMe
    const saved = mockSetSettings.mock.calls[0][0] as Record<string, string>;
    expect(saved.bot_id).toBe('123456789');
    expect(saved.bot_username).toBe('newbot');
    expect(saved.bot_name).toBe('NewName');
    expect(saved.last_synced_at).toBeDefined();
  });
});

// ── Test 5: Telegram API failure handled gracefully ───────────────────────

describe('Test 5 — Telegram API failure is handled', () => {
  it('returns ok:true even when Telegram setMyName fails', async () => {
    mockSetMyName.mockResolvedValue({ ok: false, description: 'Unauthorized' });
    // getMe still called after failed profile sync
    mockGetMe.mockRejectedValue(new Error('network error'));

    const req = makeRequest({ bot_name: 'AnotherName' });
    const res = await PATCH(req);
    const body = await res.json() as { ok: boolean; telegram_error?: string };

    // DB save succeeded
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // error is reported
    expect(typeof body.telegram_error).toBe('string');
  });

  it('handles Telegram network exception without corrupting DB', async () => {
    mockSetMyName.mockRejectedValue(new Error('timeout'));

    const req = makeRequest({ bot_name: 'Boom' });
    const res = await PATCH(req);
    const body = await res.json() as { ok: boolean; telegram_error?: string };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // DB setSettings was called (DB save succeeded before Telegram error)
    expect(mockSetSettings).toHaveBeenCalled();
    const firstCall = mockSetSettings.mock.calls[0][0] as Record<string, string>;
    expect(firstCall['bot_name']).toBe('Boom');
  });
});

// ── Test 6: Database save still works ─────────────────────────────────────

describe('Test 6 — Database save works independently', () => {
  it('saves to DB first before calling Telegram', async () => {
    const req = makeRequest({ bot_name: 'DbFirst', bot_language: 'zh' });
    await PATCH(req);

    // First setSettings call must be the DB save (user-provided keys)
    const dbSaveCall = mockSetSettings.mock.calls[0][0] as Record<string, string>;
    expect(dbSaveCall).toHaveProperty('bot_name', 'DbFirst');
    expect(dbSaveCall).toHaveProperty('bot_language', 'zh');
  });

  it('saves relay/notification settings without calling Telegram API', async () => {
    const req = makeRequest({ notify_deposit: 'true', relay_timeout_secs: '30' });
    await PATCH(req);

    // No Telegram calls for non-profile keys
    expect(mockSetMyName).not.toHaveBeenCalled();
    expect(mockSetMyDescription).not.toHaveBeenCalled();
    expect(mockSetMyShortDescription).not.toHaveBeenCalled();
    // DB save did happen
    expect(mockSetSettings).toHaveBeenCalled();
  });
});

// ── Test 7: Token never returned in response ──────────────────────────────

describe('Test 7 — Token never returned in response', () => {
  it('GET /api/settings/bot does not include raw bot token', async () => {
    const res  = await GET();
    const body = await res.json() as { settings: Record<string, string>; env: Record<string, string> };

    // raw token must not appear anywhere in the response
    const text = JSON.stringify(body);
    expect(text).not.toContain('test:abc123xyz');

    // masked token is present
    expect(body.env.bot_token_masked).toBeDefined();
    expect(body.env.bot_token_masked).toMatch(/^\w{4}\.\.\.\w{4}$/);
  });
});
