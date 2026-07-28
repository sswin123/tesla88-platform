// erp/tests/megah5-crypto.test.ts
import { describe, it, expect } from 'vitest';
import { MEGAH5_CODE, MEGAH5_NAME, OPERATOR_ERROR, H5_PATH, API_PATH } from '@/lib/providers/adapters/megah5/constants';

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
