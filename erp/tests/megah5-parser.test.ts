// erp/tests/megah5-parser.test.ts
import { describe, it, expect } from 'vitest';
import { MegaH5CallbackParser } from '@/lib/providers/adapters/megah5/MegaH5CallbackParser';

const parser = new MegaH5CallbackParser();

describe('MegaH5CallbackParser', () => {
  it('parseAuthenticateRequest extracts resolved userId', () => {
    const body = {
      playerID: 999,
      userName: 'u5@test',
      password: 'u5@test',
      referenceID: 'ref123',
      __resolved_user_id: '5',
    };
    const req = parser.parseAuthenticateRequest(body);
    expect(req.provider).toBe('MEGAH5');
    expect(req.provider_player_id).toBe('5');
    expect(req.username).toBe('u5@test');
    expect(req.reference_id).toBe('ref123');
  });

  it('parseGetBalanceRequest maps currency', () => {
    const body = { playerID: 1, referenceID: 'ref456', currency: 'MYR', __resolved_user_id: '7' };
    const req = parser.parseGetBalanceRequest(body);
    expect(req.currency).toBe('MYR');
    expect(req.provider_player_id).toBe('7');
  });

  it('parseBetRequest maps betAmount', () => {
    const body = {
      playerID: 1, referenceID: 'bet1', roundID: 'rnd1',
      gameID: 'g1', betAmount: 10.5, currency: 'MYR',
      roundDetails: 'spin', __resolved_user_id: '3',
    };
    const req = parser.parseBetRequest(body);
    expect(req.bet_amount).toBe(10.5);
    expect(req.game_id).toBe('g1');
    expect(req.round_id).toBe('rnd1');
  });

  it('parseBetResultRequest maps winAmount', () => {
    const body = {
      playerID: 1, referenceID: 'res1', roundID: 'rnd1',
      gameID: 'g1', winAmount: 20, currency: 'MYR',
      betReferenceID: 'bet1', roundDetails: 'win', __resolved_user_id: '3',
    };
    const req = parser.parseBetResultRequest(body);
    expect(req.win_amount).toBe(20);
    expect(req.bet_reference_id).toBe('bet1');
  });

  it('parseRefundRequest maps betReferenceID', () => {
    const body = {
      playerID: 1, referenceID: 'ref1', betReferenceID: 'bet1',
      betAmount: 5, currency: 'MYR', roundDetails: 'refund',
      __resolved_user_id: '3',
    };
    const req = parser.parseRefundRequest(body);
    expect(req.refund_amount).toBe(5);
    expect(req.bet_reference_id).toBe('bet1');
  });
});
