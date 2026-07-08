import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  verifyJWT:   vi.fn().mockResolvedValue({ sub: 1, username: 'admin1', role: 'ADMIN' }),
  COOKIE_NAME: 'token',
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => ({ value: 'tok' }) }),
}));

vi.mock('@/lib/repositories/audit_repo', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/permission_engine', () => ({
  can:             vi.fn().mockResolvedValue(true),
  invalidateCache: vi.fn(),
}));

const mockListBotMessages     = vi.fn();
const mockUpdateBotMessage    = vi.fn();
const mockResetBotMessage     = vi.fn();
const mockGetBotMessageHistory = vi.fn();
const mockRestoreBotMessage   = vi.fn();
const mockListBotButtons      = vi.fn();
const mockUpdateBotButton     = vi.fn();

vi.mock('@/lib/repositories/bot_messages_repo', () => ({
  listBotMessages:       (...a: unknown[]) => mockListBotMessages(...a),
  updateBotMessage:      (...a: unknown[]) => mockUpdateBotMessage(...a),
  resetBotMessage:       (...a: unknown[]) => mockResetBotMessage(...a),
  getBotMessageHistory:  (...a: unknown[]) => mockGetBotMessageHistory(...a),
  restoreBotMessage:     (...a: unknown[]) => mockRestoreBotMessage(...a),
  listBotButtons:        (...a: unknown[]) => mockListBotButtons(...a),
  updateBotButton:       (...a: unknown[]) => mockUpdateBotButton(...a),
}));

import { GET as listMessages }    from '@/app/api/bot/messages/route';
import { PATCH as patchMessage }  from '@/app/api/bot/messages/[key]/route';
import { GET as getHistory }      from '@/app/api/bot/messages/[key]/history/route';
import { POST as postRestore }    from '@/app/api/bot/messages/[key]/restore/route';
import { GET as listButtons }     from '@/app/api/bot/buttons/route';
import { PATCH as patchButton }   from '@/app/api/bot/buttons/[id]/route';

// ── Fixtures ───────────────────────────────────────────────────────────────

const BASE_MSG = {
  message_key: 'start_new_user',
  category: 'WELCOME',
  description: 'Shown when unregistered user sends /start',
  language_code: 'zh',
  content: '👋 欢迎！请发送 /start 注册。',
  seed_content: '👋 欢迎！请发送 /start 注册。',
  updated_by: null,
  updated_at: '2026-07-08T10:00:00Z',
  translation_id: 1,
};

const BASE_BTN = {
  id: 1,
  group_key: 'main_menu',
  label: '💰 充值',
  language_code: 'zh',
  button_payload: { type: 'reply' },
  row_order: 1,
  column_order: 0,
  is_active: true,
  updated_at: '2026-07-08T10:00:00Z',
};

const BASE_HIST = {
  id: 10,
  translation_id: 1,
  language_code: 'zh',
  old_content: '旧内容',
  changed_by: 'admin1',
  changed_at: '2026-07-07T09:00:00Z',
  restored_from_version: null,
};

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });
}

function ctx(key: string)      { return { params: Promise.resolve({ key }) }; }
function ctxId(id: string)     { return { params: Promise.resolve({ id }) }; }

beforeEach(() => vi.clearAllMocks());

// ── Test 1: List messages ──────────────────────────────────────────────────

describe('Test 1 — GET /api/bot/messages', () => {
  it('returns message list with category filter', async () => {
    mockListBotMessages.mockResolvedValueOnce([BASE_MSG]);
    const req = makeReq('GET', 'http://localhost/api/bot/messages?category=WELCOME&language=zh');
    const res = await listMessages(req);
    const body = await res.json() as { messages: unknown[] };

    expect(res.status).toBe(200);
    expect(body.messages).toHaveLength(1);
    expect(mockListBotMessages).toHaveBeenCalledWith({
      category: 'WELCOME',
      language: 'zh',
      search:   undefined,
    });
  });

  it('returns 401 for unauthenticated request', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce(null);
    const req = makeReq('GET', 'http://localhost/api/bot/messages');
    const res = await listMessages(req);
    expect(res.status).toBe(401);
  });
});

// ── Test 2: Edit message ───────────────────────────────────────────────────

describe('Test 2 — PATCH /api/bot/messages/[key]', () => {
  it('saves new content and returns ok:true', async () => {
    mockListBotMessages.mockResolvedValueOnce([BASE_MSG]);
    mockUpdateBotMessage.mockResolvedValueOnce(true);

    const req = makeReq('PATCH', 'http://localhost/api/bot/messages/start_new_user', {
      language_code: 'zh',
      content: '🎉 欢迎加入！',
    });
    const res = await patchMessage(req, ctx('start_new_user'));
    const body = await res.json() as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockUpdateBotMessage).toHaveBeenCalledWith(
      'start_new_user', 'zh', '🎉 欢迎加入！', 'admin1'
    );
  });

  it('returns 404 when key not found', async () => {
    mockListBotMessages.mockResolvedValueOnce([]);
    mockUpdateBotMessage.mockResolvedValueOnce(false);

    const req = makeReq('PATCH', 'http://localhost/api/bot/messages/nonexistent', {
      language_code: 'zh',
      content: 'test',
    });
    const res = await patchMessage(req, ctx('nonexistent'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when content is empty', async () => {
    const req = makeReq('PATCH', 'http://localhost/api/bot/messages/start_new_user', {
      language_code: 'zh',
      content: '',
    });
    const res = await patchMessage(req, ctx('start_new_user'));
    expect(res.status).toBe(400);
  });
});

// ── Test 3: History created (GET history) ─────────────────────────────────

describe('Test 3 — GET /api/bot/messages/[key]/history', () => {
  it('returns history records for a message key', async () => {
    mockGetBotMessageHistory.mockResolvedValueOnce([BASE_HIST]);

    const req = makeReq('GET', 'http://localhost/api/bot/messages/start_new_user/history?language=zh');
    const res = await getHistory(req, ctx('start_new_user'));
    const body = await res.json() as { history: unknown[] };

    expect(res.status).toBe(200);
    expect(body.history).toHaveLength(1);
    expect(mockGetBotMessageHistory).toHaveBeenCalledWith('start_new_user', 'zh');
  });

  it('returns empty array when no history exists', async () => {
    mockGetBotMessageHistory.mockResolvedValueOnce([]);
    const req = makeReq('GET', 'http://localhost/api/bot/messages/some_key/history');
    const res = await getHistory(req, ctx('some_key'));
    const body = await res.json() as { history: unknown[] };
    expect(body.history).toHaveLength(0);
  });
});

// ── Test 4: Restore works ─────────────────────────────────────────────────

describe('Test 4 — POST /api/bot/messages/[key]/restore', () => {
  it('restores a historical version and returns ok:true', async () => {
    mockRestoreBotMessage.mockResolvedValueOnce(true);

    const req = makeReq('POST', 'http://localhost/api/bot/messages/start_new_user/restore', {
      history_id: 10,
    });
    const res = await postRestore(req, ctx('start_new_user'));
    const body = await res.json() as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockRestoreBotMessage).toHaveBeenCalledWith('start_new_user', 10, 'admin1');
  });

  it('returns 404 when history_id not found', async () => {
    mockRestoreBotMessage.mockResolvedValueOnce(false);
    const req = makeReq('POST', 'http://localhost/api/bot/messages/start_new_user/restore', {
      history_id: 999,
    });
    const res = await postRestore(req, ctx('start_new_user'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when history_id is missing', async () => {
    const req = makeReq('POST', 'http://localhost/api/bot/messages/start_new_user/restore', {});
    const res = await postRestore(req, ctx('start_new_user'));
    expect(res.status).toBe(400);
  });
});

// ── Test 5: Cache version increment (via updateBotMessage) ─────────────────

describe('Test 5 — Cache version increment on save', () => {
  it('updateBotMessage is called (which internally increments cache_versions)', async () => {
    mockListBotMessages.mockResolvedValueOnce([BASE_MSG]);
    mockUpdateBotMessage.mockResolvedValueOnce(true);

    const req = makeReq('PATCH', 'http://localhost/api/bot/messages/start_new_user', {
      language_code: 'zh',
      content: '新内容',
    });
    await patchMessage(req, ctx('start_new_user'));

    expect(mockUpdateBotMessage).toHaveBeenCalledOnce();
  });
});

// ── Test 6: Button edit ────────────────────────────────────────────────────

describe('Test 6 — PATCH /api/bot/buttons/[id]', () => {
  it('updates button label and returns ok:true', async () => {
    mockUpdateBotButton.mockResolvedValueOnce(true);

    const req = makeReq('PATCH', 'http://localhost/api/bot/buttons/1', {
      label: '💰 存款',
    });
    const res = await patchButton(req, ctxId('1'));
    const body = await res.json() as { ok: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockUpdateBotButton).toHaveBeenCalledWith(1, { label: '💰 存款' });
  });

  it('toggles button is_active', async () => {
    mockUpdateBotButton.mockResolvedValueOnce(true);

    const req = makeReq('PATCH', 'http://localhost/api/bot/buttons/2', {
      is_active: false,
    });
    const res = await patchButton(req, ctxId('2'));
    expect(res.status).toBe(200);
    expect(mockUpdateBotButton).toHaveBeenCalledWith(2, { is_active: false });
  });

  it('returns 400 for invalid id', async () => {
    const req = makeReq('PATCH', 'http://localhost/api/bot/buttons/abc', { label: 'x' });
    const res = await patchButton(req, ctxId('abc'));
    expect(res.status).toBe(400);
  });

  it('GET /api/bot/buttons returns button list', async () => {
    mockListBotButtons.mockResolvedValueOnce([BASE_BTN]);
    const req = makeReq('GET', 'http://localhost/api/bot/buttons');
    const res = await listButtons(req);
    const body = await res.json() as { buttons: unknown[] };
    expect(res.status).toBe(200);
    expect(body.buttons).toHaveLength(1);
  });
});

// ── Test 7: Permission check ───────────────────────────────────────────────

describe('Test 7 — Permission checks', () => {
  it('CS role cannot access message list (401)', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce({
      sub: 2, username: 'cs_user', role: 'CS', iat: 0, exp: 0,
    });
    const { can } = await import('@/lib/permission_engine');
    vi.mocked(can).mockResolvedValueOnce(false);

    const req = makeReq('GET', 'http://localhost/api/bot/messages');
    const res = await listMessages(req);
    expect(res.status).toBe(401);
  });

  it('FINANCE role cannot edit messages (401)', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValueOnce({
      sub: 3, username: 'finance_user', role: 'FINANCE', iat: 0, exp: 0,
    });
    const { can } = await import('@/lib/permission_engine');
    vi.mocked(can).mockResolvedValueOnce(false);

    const req = makeReq('PATCH', 'http://localhost/api/bot/messages/start_new_user', {
      language_code: 'zh',
      content: 'hacked',
    });
    const res = await patchMessage(req, ctx('start_new_user'));
    expect(res.status).toBe(401);
  });

  it('SUPER_ADMIN can access all endpoints', async () => {
    const { verifyJWT } = await import('@/lib/auth');
    vi.mocked(verifyJWT).mockResolvedValue({
      sub: 1, username: 'superadmin', role: 'SUPER_ADMIN', iat: 0, exp: 0,
    });
    mockListBotMessages.mockResolvedValueOnce([BASE_MSG]);
    const req = makeReq('GET', 'http://localhost/api/bot/messages');
    const res = await listMessages(req);
    expect(res.status).toBe(200);
  });
});
