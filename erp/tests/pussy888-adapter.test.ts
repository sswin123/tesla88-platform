/**
 * Pussy888 Adapter — Unit / Integration Tests
 *
 * Covers:
 *   1. Pussy888Signer  — sign() 签名算法正确性
 *   2. Pussy888ApiClient — createUser / getUserBalance / deposit / withdraw
 *      (fetch mocked；不发起真实网络请求)
 *   3. AdapterRegistry — PUSSY888APP 已注册，requiredCredentials 正确
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';

// ── 1. Signer ─────────────────────────────────────────────────────────────────

import { Pussy888Signer } from '@/lib/providers/adapters/pussy888/Pussy888Signer';

describe('Pussy888Signer', () => {
  const authcode  = 'TESTAUTH';
  const secretKey = 'TESTSECRET';
  const signer    = new Pussy888Signer(authcode, secretKey);

  it('sign() 使用 MD5((authcode+userName+time+secretKey).toLowerCase())', () => {
    const userName = 'PSYA333u42';
    const time     = '1700000000000';

    const expected = createHash('md5')
      .update((authcode + userName + time + secretKey).toLowerCase(), 'utf8')
      .digest('hex');

    expect(signer.sign(userName, time)).toBe(expected);
  });

  it('sign() 结果全为小写十六进制', () => {
    const result = signer.sign('testuser', '9999999999999');
    expect(result).toMatch(/^[0-9a-f]{32}$/);
  });

  it('timestamp() 返回 13 位毫秒时间戳字符串', () => {
    const ts = signer.timestamp();
    expect(ts).toMatch(/^\d{13}$/);
    expect(Number(ts)).toBeCloseTo(Date.now(), -2); // 误差 < 100ms
  });

  it('两次调用 sign() 使用相同参数结果相同（确定性）', () => {
    const a = signer.sign('PSYA333u1', '1700000000001');
    const b = signer.sign('PSYA333u1', '1700000000001');
    expect(a).toBe(b);
  });

  it('不同 userName 产生不同签名', () => {
    const time = '1700000000000';
    const s1   = signer.sign('PSYA333u1', time);
    const s2   = signer.sign('PSYA333u2', time);
    expect(s1).not.toBe(s2);
  });
});

// ── 2. ApiClient (fetch mocked) ───────────────────────────────────────────────

import { Pussy888ApiClient } from '@/lib/providers/adapters/pussy888/Pussy888ApiClient';
import type { Pussy888Credentials, Pussy888Config } from '@/lib/providers/adapters/pussy888/types';

const TEST_CREDS: Pussy888Credentials = {
  agent:      'PSYA333',
  authcode:   'testauthcode',
  secret_key: 'testsecretkey',
};

const TEST_CFG: Pussy888Config = {
  api_base_url:  'http://api.pussy888.test',
  api_base_url2: 'http://api2.pussy888.test',
  currency:      'MYR',
  timeout_ms:    5000,
  debug:         false,
};

// Helper: mock fetch response for getUserInfo/setScore endpoints (isSuccess/errCode/data format)
function mockSuccess<T>(data: T) {
  return Promise.resolve(new Response(
    JSON.stringify({ isSuccess: true, errCode: 0, msg: 'ok', data }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
}

function mockFailure(errCode: number, msg: string) {
  return Promise.resolve(new Response(
    JSON.stringify({ isSuccess: false, errCode, msg, data: null }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
}

// Helper: mock fetch response for /ashx/account/account.ashx (success/code/msg format)
function mockAddUserSuccess() {
  return Promise.resolve(new Response(
    JSON.stringify({ success: true, code: 0, msg: 'successful operation.', type: 2 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
}

function mockAddUserDuplicate() {
  return Promise.resolve(new Response(
    JSON.stringify({ success: false, code: -1, msg: 'fail operation. exist', type: 2 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
}

describe('Pussy888ApiClient', () => {
  let client: Pussy888ApiClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;

  beforeEach(() => {
    client   = new Pussy888ApiClient(TEST_CREDS, TEST_CFG);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── addUser ──────────────────────────────────────────────────────────────────

  describe('addUser', () => {
    it('调用 /ashx/account/account.ashx?action=addUser，并在 URL 中携带必要参数', async () => {
      fetchSpy.mockResolvedValueOnce(mockAddUserSuccess() as never);

      await expect(client.addUser('PSYA333u42', 'TestNickname', 'Test123')).resolves.toBeUndefined();

      const [url] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
      expect(url).toContain('/ashx/account/account.ashx');
      expect(url).toContain('loginUser=');   // 官方文档要求：每个接口带 loginUser（默认空字符串）
      expect(url).toContain('action=addUser');
      expect(url).toContain('agent=PSYA333');
      expect(url).toContain('userName=PSYA333u42');
      expect(url).toContain('Name=TestNickname');
      expect(url).toContain('PassWd=Test123');
      expect(url).toContain('UserType=1');
      expect(url).toContain('authcode=testauthcode');
      expect(url).toMatch(/time=\d{13}/);
      expect(url).toMatch(/sign=[0-9a-f]{32}/);
    });

    it('传入 fixed password 时 PassWd 字段与传入值完全一致', async () => {
      fetchSpy.mockResolvedValueOnce(mockAddUserSuccess() as never);
      await client.addUser('PSYA333u1', 'Player', 'Abc123');
      const [url] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
      expect(url).toContain('PassWd=Abc123');
    });

    it('code=-1（玩家已存在）时抛出含 "already exists" 的 Error', async () => {
      fetchSpy.mockResolvedValueOnce(mockAddUserDuplicate() as never);
      await expect(client.addUser('PSYA333u42', 'Player', 'Test123')).rejects.toThrow('already exists');
    });
  });

  // ── getUserBalance ──────────────────────────────────────────────────────────

  describe('getUserBalance (getUserInfo.ashx)', () => {
    it('返回 data.ScoreNum 字段的数值', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockSuccess({ UserName: 'PSYA333u42', ScoreNum: 123.50 }) as never,
      );

      const balance = await client.getUserBalance('PSYA333u42');

      expect(balance).toBe(123.50);
      const [url] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
      expect(url).toContain('getUserInfo.ashx');
    });

    it('ScoreNum 为 0 时返回 0', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockSuccess({ UserName: 'PSYA333u1', ScoreNum: 0 }) as never,
      );
      const balance = await client.getUserBalance('PSYA333u1');
      expect(balance).toBe(0);
    });
  });

  // ── deposit (setScore with positive scoreNum) ───────────────────────────────

  describe('deposit — setScore.ashx 存款（正数）', () => {
    it('发送 scoreNum=+100，返回新余额', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockSuccess({ UserName: 'PSYA333u42', ScoreNum: 200 }) as never,
      );

      const balance = await client.deposit('PSYA333u42', 100);

      expect(balance).toBe(200);
      const [url] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
      expect(url).toContain('setScore.ashx');
      expect(url).toContain('scoreNum=%2B100'); // URL-encoded "+"
    });

    it('小数金额格式化为 2 位小数', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockSuccess({ UserName: 'PSYA333u1', ScoreNum: 50.50 }) as never,
      );

      await client.deposit('PSYA333u1', 50.5);

      const [url] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
      expect(url).toContain('scoreNum=%2B50.50');
    });

    it('amount <= 0 时抛出异常，不发起请求', async () => {
      await expect(client.deposit('PSYA333u42', 0)).rejects.toThrow('positive');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ── withdraw (setScore with negative scoreNum) ──────────────────────────────

  describe('withdraw — setScore.ashx 取款（负数）', () => {
    it('发送 scoreNum=-50，返回新余额', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockSuccess({ UserName: 'PSYA333u42', ScoreNum: 50 }) as never,
      );

      const balance = await client.withdraw('PSYA333u42', 50);

      expect(balance).toBe(50);
      const [url] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
      expect(url).toContain('setScore.ashx');
      expect(url).toContain('scoreNum=-50');
    });

    it('amount <= 0 时抛出异常，不发起请求', async () => {
      await expect(client.withdraw('PSYA333u42', -10)).rejects.toThrow('positive');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ── withdrawAll ─────────────────────────────────────────────────────────────

  describe('withdrawAll — 全额取款', () => {
    it('balance > 0：先查余额再取款，返回取出金额', async () => {
      // First call: getUserInfo (balance = 300)
      fetchSpy
        .mockResolvedValueOnce(mockSuccess({ UserName: 'PSYA333u42', ScoreNum: 300 }) as never)
        // Second call: setScore withdraw 300
        .mockResolvedValueOnce(mockSuccess({ UserName: 'PSYA333u42', ScoreNum: 0 }) as never);

      const amount = await client.withdrawAll('PSYA333u42');

      expect(amount).toBe(300);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('balance = 0：直接返回 0，不发起 setScore 请求', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockSuccess({ UserName: 'PSYA333u42', ScoreNum: 0 }) as never,
      );

      const amount = await client.withdrawAll('PSYA333u42');

      expect(amount).toBe(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // only getUserInfo
    });
  });

  // ── Fallback URL ────────────────────────────────────────────────────────────

  describe('Primary URL 失败时自动切换 Fallback URL', () => {
    it('primary 网络错误 → fallback URL 成功', async () => {
      fetchSpy
        .mockRejectedValueOnce(new Error('ECONNREFUSED') as never)
        .mockResolvedValueOnce(mockSuccess({ UserName: 'PSYA333u1', ScoreNum: 10 }) as never);

      const balance = await client.getUserBalance('PSYA333u1');

      expect(balance).toBe(10);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [url2] = fetchSpy.mock.calls[1] as [string, ...unknown[]];
      expect(url2).toContain('api2.pussy888.test');
    });
  });

  // ── Sign 参数验证 ────────────────────────────────────────────────────────────

  describe('请求包含正确的签名参数', () => {
    it('sign 参数是 MD5((authcode+userName+time+secretKey).toLowerCase())', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockSuccess({ UserName: 'PSYA333u42', ScoreNum: 0 }) as never,
      );

      await client.getUserBalance('PSYA333u42');

      const [url] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
      const parsed = new URL(url);
      const time     = parsed.searchParams.get('time')!;
      const sign     = parsed.searchParams.get('sign')!;
      const userName = parsed.searchParams.get('userName')!;

      const expected = createHash('md5')
        .update(('testauthcode' + userName + time + 'testsecretkey').toLowerCase(), 'utf8')
        .digest('hex');

      expect(sign).toBe(expected);
    });
  });
});

// ── 3. AdapterRegistry 注册验证 ───────────────────────────────────────────────

describe('AdapterRegistry — PUSSY888APP', () => {
  // 必须先 import adapters/index 触发 self-registration
  it('PUSSY888APP 已注册', async () => {
    await import('@/lib/providers/adapters/index');
    const { AdapterRegistry } = await import('@/lib/providers/adapters/AdapterRegistry');

    expect(AdapterRegistry.isRegistered('PUSSY888APP')).toBe(true);
  });

  it('requiredCredentials = [agent, authcode, secret_key]', async () => {
    const { AdapterRegistry } = await import('@/lib/providers/adapters/AdapterRegistry');
    const required = AdapterRegistry.getRequiredCredentials('PUSSY888APP');
    expect(required).toEqual(expect.arrayContaining(['agent', 'authcode', 'secret_key']));
    expect(required).toHaveLength(3);
  });

  it('requiredConfig = [api_base_url, currency]', async () => {
    const { AdapterRegistry } = await import('@/lib/providers/adapters/AdapterRegistry');
    const required = AdapterRegistry.getRequiredConfig('PUSSY888APP');
    expect(required).toEqual(expect.arrayContaining(['api_base_url', 'currency']));
    expect(required).toHaveLength(2);
  });

  it('displayName = Pussy888App', async () => {
    const { AdapterRegistry } = await import('@/lib/providers/adapters/AdapterRegistry');
    expect(AdapterRegistry.getDisplayName('PUSSY888APP')).toBe('Pussy888App');
  });

  it('walletType = TRANSFER（通过 AdapterRegistry.create() 实例化后检查）', async () => {
    const { AdapterRegistry } = await import('@/lib/providers/adapters/AdapterRegistry');
    const adapter = AdapterRegistry.create(
      'PUSSY888APP',
      { agent: 'PSYA', authcode: 'x', secret_key: 'y' },
      { api_base_url: 'http://localhost', currency: 'MYR' },
      { wallet: {} as never, eventLogger: {} as never, providerRepo: {} as never },
    );
    expect(adapter.walletType).toBe('TRANSFER');
  });
});

// ── 4. provider-schemas.ts 注册验证 ──────────────────────────────────────────

describe('provider-schemas — PUSSY888APP', () => {
  it('getProviderSchema("PUSSY888APP") isStub=false', async () => {
    const { getProviderSchema } = await import('@/lib/provider-schemas');
    const schema = getProviderSchema('PUSSY888APP');
    expect(schema).not.toBeNull();
    expect(schema!.isStub).toBe(false);
  });

  it('credentials 包含 agent / authcode / secret_key', async () => {
    const { getProviderSchema } = await import('@/lib/provider-schemas');
    const schema = getProviderSchema('PUSSY888APP')!;
    const keys   = schema.credentials.map(f => f.key);
    expect(keys).toContain('agent');
    expect(keys).toContain('authcode');
    expect(keys).toContain('secret_key');
  });

  it('config 包含 api_base_url 和 currency', async () => {
    const { getProviderSchema } = await import('@/lib/provider-schemas');
    const schema = getProviderSchema('PUSSY888APP')!;
    const keys   = schema.config.map(f => f.key);
    expect(keys).toContain('api_base_url');
    expect(keys).toContain('currency');
  });
});
