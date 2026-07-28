// erp/src/lib/providers/adapters/megah5/MegaH5CallbackFormatter.ts
import { OPERATOR_ERROR } from './constants';
import type {
  AuthenticateResponse, GetBalanceResponse, BetResponse, BetResultResponse,
  RefundResponse, JackpotWinResponse, FundRequestResponse, FundReturnResponse,
} from '../../types/wallet.types';

/**
 * MegaH5CallbackFormatter — serializes normalized wallet responses back into
 * the JSON shapes that MEGAH5 expects from the OPERATOR.
 *
 * Response field conventions (same as 918KISS):
 *   error       — integer error code (0 = success)
 *   balance     — current player balance (2 decimal places)
 *   playerID    — only in Authenticate response
 *   referenceID — only in Bet/BetResult/Refund/JackpotWin/FundRequest/FundReturn
 */
export class MegaH5CallbackFormatter {
  formatAuthenticate(res: AuthenticateResponse): Record<string, unknown> {
    return {
      error:    res.error_code,
      playerID: res.error_code === OPERATOR_ERROR.OK ? Number(res.player_id) : 0,
      balance:  this.round(res.balance),
    };
  }

  formatGetBalance(res: GetBalanceResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance) };
  }

  formatBet(res: BetResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  formatBetResult(res: BetResultResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  formatRefund(res: RefundResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  formatJackpotWin(res: JackpotWinResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  formatFundRequest(res: FundRequestResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  formatFundReturn(res: FundReturnResponse): Record<string, unknown> {
    return { error: res.error_code, balance: this.round(res.balance), referenceID: res.transaction_id };
  }

  /** FundBetResult is informational — OPERATOR must NOT modify wallet. */
  formatFundBetResult(_res: Record<string, unknown>): Record<string, unknown> {
    return { error: OPERATOR_ERROR.OK };
  }

  private round(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
