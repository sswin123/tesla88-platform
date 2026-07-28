// erp/tests/megah5-adapter-factory.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: { query: vi.fn() } }));
vi.mock('@/lib/providers/core/MasterWalletEngine', () => ({
  MasterWalletEngine: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@/lib/providers/core/EventLogger', () => ({
  EventLogger: vi.fn().mockImplementation(() => ({})),
}));

import { createAdapter } from '@/lib/providers/adapters/AdapterFactory';

const mockDeps = {
  wallet: {} as never,
  eventLogger: {} as never,
  providerRepo: {} as never,
};

const MEGAH5_CREDS = {
  api_token: 'tok', operator_token: 'optok',
  secret_key: 'sec', encrypt_key: 'enc12345', md5_key: 'md5k',
};
const MEGAH5_CFG = {
  api_base_url: 'https://api.test', h5_api_domain: 'https://h5.test',
  h5_lobby_domain: 'https://lobby.test', h5_game_domain: 'https://game.test',
  postfix_id: 'tst', currency: 'MYR', timeout_ms: '10000',
};

describe('AdapterFactory — MEGAH5', () => {
  it('creates MegaH5Adapter for MEGAH5 code', () => {
    const adapter = createAdapter('MEGAH5', MEGAH5_CREDS, MEGAH5_CFG, mockDeps);
    expect(adapter.code).toBe('MEGAH5');
    expect(adapter.walletType).toBe('SEAMLESS');
  });

  it('creates MegaH5Adapter for megah5 (lowercase)', () => {
    const adapter = createAdapter('megah5', MEGAH5_CREDS, MEGAH5_CFG, mockDeps);
    expect(adapter.code).toBe('MEGAH5');
  });

  it('throws for unknown provider', () => {
    expect(() => createAdapter('UNKNOWN_XYZ', {}, {}, mockDeps)).toThrow(
      /no adapter implementation for provider code "UNKNOWN_XYZ"/i,
    );
  });

  it('MEGAH5 adapter declares SEAMLESS_WALLET capability', () => {
    const adapter = createAdapter('MEGAH5', MEGAH5_CREDS, MEGAH5_CFG, mockDeps);
    const caps = adapter.getCapabilities();
    expect(caps).toContain('SEAMLESS_WALLET');
  });

  it('MEGAH5 adapter declares LOBBY capability', () => {
    const adapter = createAdapter('MEGAH5', MEGAH5_CREDS, MEGAH5_CFG, mockDeps);
    expect(adapter.getCapabilities()).toContain('LOBBY');
  });
});
