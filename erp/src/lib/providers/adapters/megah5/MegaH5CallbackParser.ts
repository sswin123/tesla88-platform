// erp/src/lib/providers/adapters/megah5/MegaH5CallbackParser.ts
import { MEGAH5_CODE } from './constants';
import type {
  AuthenticateRequest, GetBalanceRequest, BetRequest, BetResultRequest,
  RefundRequest, JackpotWinRequest, FundRequestRequest, FundReturnRequest,
  FundBetResultRequest,
} from '../../types/wallet.types';

/**
 * MegaH5CallbackParser — translates raw MEGAH5 inbound callback bodies into
 * the normalized wallet callback shapes consumed by MasterWalletEngine.
 *
 * Expects `body.__resolved_user_id` to be pre-injected by the adapter's
 * async callback handlers (same pattern as Kiss918Adapter).
 *
 * Field mapping (MEGAH5 → our types):
 *   playerID       → provider_player_id (resolved via __resolved_user_id)
 *   referenceID    → reference_id
 *   roundID        → round_id
 *   gameID         → game_id
 *   betAmount      → bet_amount
 *   winAmount      → win_amount
 *   betReferenceID → bet_reference_id
 *   requestAmount  → request_amount (FundRequest)
 *   returnAmount   → return_amount (FundReturn)
 */
export class MegaH5CallbackParser {
  private resolvedId(body: Record<string, unknown>): string {
    if (body.__resolved_user_id != null) return String(body.__resolved_user_id);
    return String(body.playerID ?? '');
  }

  private raw(body: Record<string, unknown>): Record<string, unknown> {
    const { __resolved_user_id: _, ...rest } = body;
    return rest;
  }

  parseAuthenticateRequest(body: Record<string, unknown>): AuthenticateRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? `auth_${Date.now()}`),
      round_id:           null,
      username:           String(body.userName ?? ''),
      password:           String(body.password ?? ''),
      raw_payload:        this.raw(body),
    };
  }

  parseGetBalanceRequest(body: Record<string, unknown>): GetBalanceRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? `bal_${Date.now()}`),
      round_id:           null,
      currency:           String(body.currency ?? 'MYR'),
      raw_payload:        this.raw(body),
    };
  }

  parseBetRequest(body: Record<string, unknown>): BetRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      game_id:            String(body.gameID ?? ''),
      game_code:          body.gameCode != null ? String(body.gameCode) : null,
      bet_amount:         Number(body.betAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      round_details:      String(body.roundDetails ?? 'bet'),
      session_id:         null,
      platform:           null,
      raw_payload:        this.raw(body),
    };
  }

  parseBetResultRequest(body: Record<string, unknown>): BetResultRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      game_id:            String(body.gameID ?? ''),
      game_code:          body.gameCode != null ? String(body.gameCode) : null,
      win_amount:         Number(body.winAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      round_details:      String(body.roundDetails ?? 'result'),
      bet_reference_id:   body.betReferenceID != null ? String(body.betReferenceID) : null,
      result_url:         null,
      session_id:         null,
      jackpot_contribution: null,
      raw_payload:        this.raw(body),
    };
  }

  parseRefundRequest(body: Record<string, unknown>): RefundRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      game_id:            String(body.gameID ?? ''),
      refund_amount:      Number(body.betAmount ?? body.refundAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      bet_reference_id:   String(body.betReferenceID ?? ''),
      raw_payload:        this.raw(body),
    };
  }

  parseJackpotWinRequest(body: Record<string, unknown>): JackpotWinRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? `jp_${Date.now()}`),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      game_id:            String(body.gameID ?? ''),
      win_amount:         Number(body.winAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      jackpot_module:     body.jackpotModule != null ? Number(body.jackpotModule) : null,
      raw_payload:        this.raw(body),
    };
  }

  parseFundRequestRequest(body: Record<string, unknown>): FundRequestRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           null,
      request_amount:     Number(body.requestAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      raw_payload:        this.raw(body),
    };
  }

  parseFundReturnRequest(body: Record<string, unknown>): FundReturnRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           null,
      return_amount:      Number(body.returnAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      raw_payload:        this.raw(body),
    };
  }

  parseFundBetResultRequest(body: Record<string, unknown>): FundBetResultRequest {
    return {
      provider:           MEGAH5_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      game_id:            String(body.gameID ?? ''),
      net_amount:         Number(body.netAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      raw_payload:        this.raw(body),
    };
  }
}
