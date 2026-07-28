// erp/tests/megah5-formatter.test.ts
import { describe, it, expect } from 'vitest';
import { MegaH5CallbackFormatter } from '@/lib/providers/adapters/megah5/MegaH5CallbackFormatter';
import { OPERATOR_ERROR } from '@/lib/providers/adapters/megah5/constants';

const fmt = new MegaH5CallbackFormatter();

describe('MegaH5CallbackFormatter', () => {
  it('formatAuthenticate success returns playerID and balance', () => {
    const res = fmt.formatAuthenticate({ player_id: '42', balance: 100.5, currency: 'MYR', error_code: OPERATOR_ERROR.OK });
    expect(res.error).toBe(0);
    expect(res.playerID).toBe(42);
    expect(res.balance).toBe(100.5);
  });

  it('formatAuthenticate error returns 0 playerID', () => {
    const res = fmt.formatAuthenticate({ player_id: '', balance: 0, currency: 'MYR', error_code: OPERATOR_ERROR.AUTH_FAILED });
    expect(res.error).toBe(4);
    expect(res.playerID).toBe(0);
  });

  it('formatGetBalance returns error and balance', () => {
    const res = fmt.formatGetBalance({ balance: 55.55, currency: 'MYR', error_code: 0 });
    expect(res.error).toBe(0);
    expect(res.balance).toBe(55.55);
  });

  it('formatBet includes referenceID', () => {
    const res = fmt.formatBet({ transaction_id: 'txn123', balance: 90, currency: 'MYR', error_code: 0 });
    expect(res.referenceID).toBe('txn123');
    expect(res.balance).toBe(90);
  });

  it('formatFundBetResult always returns error 0', () => {
    const res = fmt.formatFundBetResult({ transaction_id: '', balance: 0, currency: 'MYR', error_code: 0 });
    expect(res.error).toBe(0);
    expect(res.balance).toBeUndefined();
  });

  it('rounds balance to 2 decimal places', () => {
    const res = fmt.formatGetBalance({ balance: 10.123456, currency: 'MYR', error_code: 0 });
    expect(res.balance).toBe(10.12);
  });
});
