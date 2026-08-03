// erp/tests/megah5-crypto.test.ts
import { describe, it, expect } from 'vitest';
import { MEGAH5_CODE, MEGAH5_NAME, OPERATOR_ERROR, H5_PATH, API_PATH } from '@/lib/providers/adapters/megah5/constants';
import { MegaH5Crypto } from '@/lib/providers/adapters/megah5/MegaH5Crypto';

describe('megah5/constants', () => {
  it('exports correct provider code', () => {
    expect(MEGAH5_CODE).toBe('MEGAH5');
    expect(MEGAH5_NAME).toBe('Mega888H5');
  });

  it('OPERATOR_ERROR.OK is 0', () => {
    expect(OPERATOR_ERROR.OK).toBe(0);
    expect(OPERATOR_ERROR.PLAYER_NOT_FOUND).toBe(2);
    expect(OPERATOR_ERROR.DUPLICATE).toBe(6);
  });

  it('H5_PATH.LOGIN is defined', () => {
    expect(H5_PATH.LOGIN).toBe('/api/Acc/Login');
  });

  it('API_PATH.CREATE_PLAYER is defined', () => {
    expect(API_PATH.CREATE_PLAYER).toBe('/operator/v2/CreatePlayer');
  });
});

describe('MegaH5Crypto', () => {
  const crypto = new MegaH5Crypto();

  it('md5Hex returns lowercase 32-char hex', () => {
    const result = crypto.md5Hex('hello');
    expect(result).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(result).toHaveLength(32);
    expect(result).toBe(result.toLowerCase());
  });

  it('desEncrypt produces known ciphertext for known key+plaintext', () => {
    const key = '12345678';
    const result = crypto.desEncrypt('hello world', key);
    // Pinned value — fails if cipher mode, key/IV handling, or encoding changes
    expect(result).toBe('CyqS6B+0nOGkMmaqyup7gQ==');
  });

  it('desEncrypt is deterministic for same key+plaintext', () => {
    const key = 'testkey1';
    const out1 = crypto.desEncrypt('test payload', key);
    const out2 = crypto.desEncrypt('test payload', key);
    expect(out1).toBe(out2);
  });

  it('buildLoginPayload returns q and s fields', () => {
    const result = crypto.buildLoginPayload({
      accountId:   'u1@testpostfix',
      currency:    'MYR',
      nickname:    'Player1',
      language:    2,
      secretKey:   'secret123',
      encryptKey:  'enckey12',
      md5Key:      'md5keyxx',
      delimiter:   '|',
    });
    expect(result).toHaveProperty('q');
    expect(result).toHaveProperty('s');
    expect(typeof result.q).toBe('string');
    expect(typeof result.s).toBe('string');
    expect(result.s).toHaveLength(32); // MD5 is always 32 hex chars
  });
});
