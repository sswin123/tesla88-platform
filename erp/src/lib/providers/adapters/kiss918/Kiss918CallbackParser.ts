import { KISS918_CODE, KISS918_PLATFORM } from './constants';
import type {
  AuthenticateRequest,
  BetRequest,
  BetResultRequest,
  FundBetResultRequest,
  FundRequestRequest,
  FundReturnRequest,
  GetBalanceRequest,
  JackpotWinRequest,
  RefundRequest,
} from '../../types/wallet.types';

/**
 * Kiss918CallbackParser — translates raw 918KISS inbound callback bodies into
 * the normalized wallet callback shapes consumed by MasterWalletEngine.
 *
 * Field naming conventions (918KISS → our types):
 *   playerID       → provider_player_id (must be pre-resolved to users.id by the
 *                    route handler via Kiss918Adapter.resolveUserId())
 *   referenceID    → reference_id
 *   roundID        → round_id
 *   gameID         → game_id
 *   betAmount      → bet_amount
 *   winAmount      → win_amount
 *   betReferenceID → bet_reference_id
 *   betRefundID    → bet_reference_id (refund)
 *   requestAmount  → request_amount
 *   returnAmount   → return_amount
 *   netAmount      → net_amount
 *   jackpotModule  → jackpot_module
 *   roundDetails   → round_details
 *
 * IMPORTANT: All parse methods expect `body.__resolved_user_id` to be present.
 * The adapter's async callback handlers call `resolveUserId()` before parsing,
 * then inject the result as `__resolved_user_id`.  Without it, parsing falls
 * back to the raw `playerID` field (which will be 918KISS's internal ID, not
 * our users.id, and will fail wallet lookups).
 */
export class Kiss918CallbackParser {
  /** Extract the users.id string injected by the route handler. */
  private resolvedId(body: Record<string, unknown>): string {
    // Pre-resolved path (adapter injects __resolved_user_id after DB lookup)
    if (body.__resolved_user_id != null) {
      return String(body.__resolved_user_id);
    }
    // Fallback — not recommended for production; routes should always resolve
    return String(body.playerID ?? '');
  }

  private raw(body: Record<string, unknown>): Record<string, unknown> {
    // Strip internal helper field before storing raw payload
    const { __resolved_user_id: _, ...rest } = body;
    return rest;
  }

  parseAuthenticateRequest(body: Record<string, unknown>): AuthenticateRequest {
    return {
      provider:           KISS918_CODE,
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
      provider:           KISS918_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? `bal_${Date.now()}`),
      round_id:           null,
      currency:           String(body.currency ?? 'MYR'),
      raw_payload:        this.raw(body),
    };
  }

  parseBetRequest(body: Record<string, unknown>): BetRequest {
    const platform918 = Number(body.platform ?? 0);
    return {
      provider:           KISS918_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      game_id:            String(body.gameID ?? ''),
      game_code:          null,
      bet_amount:         Number(body.betAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      round_details:      String(body.roundDetails ?? 'spin'),
      session_id:         body.sessionID != null ? String(body.sessionID) : null,
      platform:           platform918 === KISS918_PLATFORM.MOBILE ? 'MOBILE'
                        : platform918 === KISS918_PLATFORM.WEB    ? 'WEB'
                        : null,
      raw_payload:        this.raw(body),
    };
  }

  parseBetResultRequest(body: Record<string, unknown>): BetResultRequest {
    return {
      provider:             KISS918_CODE,
      provider_player_id:   this.resolvedId(body),
      reference_id:         String(body.referenceID ?? ''),
      round_id:             body.roundID != null ? String(body.roundID) : null,
      game_id:              String(body.gameID ?? ''),
      game_code:            null,
      win_amount:           Number(body.winAmount ?? 0),
      currency:             String(body.currency ?? 'MYR'),
      round_details:        String(body.roundDetails ?? 'spin'),
      bet_reference_id:     body.betReferenceID != null ? String(body.betReferenceID) : null,
      result_url:           body.resultUrl != null ? String(body.resultUrl) : null,
      session_id:           null,
      jackpot_contribution: body.jackpotContributionAmt != null
                              ? Number(body.jackpotContributionAmt)
                              : null,
      raw_payload:          this.raw(body),
    };
  }

  parseRefundRequest(body: Record<string, unknown>): RefundRequest {
    return {
      provider:           KISS918_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           null,
      game_id:            String(body.gameID ?? ''),
      refund_amount:      Number(body.betAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      bet_reference_id:   String(body.betRefundID ?? ''),
      raw_payload:        this.raw(body),
    };
  }

  parseJackpotWinRequest(body: Record<string, unknown>): JackpotWinRequest {
    return {
      provider:           KISS918_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           body.roundID != null ? String(body.roundID) : null,
      game_id:            String(body.gameID ?? ''),
      win_amount:         Number(body.winAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      jackpot_module:     body.jackpotModule != null ? Number(body.jackpotModule) : null,
      round_details:      null,
      raw_payload:        this.raw(body),
    };
  }

  parseFundRequestRequest(body: Record<string, unknown>): FundRequestRequest {
    return {
      provider:           KISS918_CODE,
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
      provider:           KISS918_CODE,
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
      provider:           KISS918_CODE,
      provider_player_id: this.resolvedId(body),
      reference_id:       String(body.referenceID ?? ''),
      round_id:           null,
      game_id:            String(body.gameID ?? ''),
      net_amount:         Number(body.netAmount ?? 0),
      currency:           String(body.currency ?? 'MYR'),
      round_details:      body.roundDetails != null ? String(body.roundDetails) : null,
      raw_payload:        this.raw(body),
    };
  }
}
