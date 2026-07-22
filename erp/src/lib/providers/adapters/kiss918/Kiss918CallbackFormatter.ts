import { OPERATOR_ERROR } from './constants';
import type {
  AuthenticateResponse,
  BetResponse,
  BetResultResponse,
  FundBetResultResponse,
  FundRequestResponse,
  FundReturnResponse,
  GetBalanceResponse,
  JackpotWinResponse,
  RefundResponse,
} from '../../types/wallet.types';

/**
 * Kiss918CallbackFormatter — serializes normalized wallet responses back into
 * the JSON shapes that 918KISS expects from the OPERATOR.
 *
 * 918KISS response field conventions:
 *   error        — integer error code (0 = success)
 *   balance      — current player balance (float, 2 decimals)
 *   playerID     — only in Authenticate response
 *   referenceID  — only in Bet/BetResult/JackpotWin/FundRequest/FundReturn responses
 */
export class Kiss918CallbackFormatter {
  formatAuthenticate(res: AuthenticateResponse): Record<string, unknown> {
    return {
      error:    res.error_code,
      playerID: res.error_code === OPERATOR_ERROR.OK ? Number(res.player_id) : 0,
      balance:  this.round(res.balance),
    };
  }

  formatGetBalance(res: GetBalanceResponse): Record<string, unknown> {
    return {
      error:   res.error_code,
      balance: this.round(res.balance),
    };
  }

  formatBet(res: BetResponse): Record<string, unknown> {
    return {
      error:       res.error_code,
      balance:     this.round(res.balance),
      referenceID: res.transaction_id,
    };
  }

  formatBetResult(res: BetResultResponse): Record<string, unknown> {
    return {
      error:       res.error_code,
      balance:     this.round(res.balance),
      referenceID: res.transaction_id,
    };
  }

  formatRefund(res: RefundResponse): Record<string, unknown> {
    return {
      error:       res.error_code,
      balance:     this.round(res.balance),
      referenceID: res.transaction_id,
    };
  }

  formatJackpotWin(res: JackpotWinResponse): Record<string, unknown> {
    return {
      error:       res.error_code,
      balance:     this.round(res.balance),
      referenceID: res.transaction_id,
    };
  }

  formatFundRequest(res: FundRequestResponse): Record<string, unknown> {
    return {
      error:       res.error_code,
      balance:     this.round(res.balance),
      referenceID: res.transaction_id,
    };
  }

  formatFundReturn(res: FundReturnResponse): Record<string, unknown> {
    return {
      error:       res.error_code,
      balance:     this.round(res.balance),
      referenceID: res.transaction_id,
    };
  }

  /**
   * FundBetResult is informational — OPERATOR must NOT modify the wallet.
   * Always returns error=0 with no balance field.
   */
  formatFundBetResult(_res: FundBetResultResponse): Record<string, unknown> {
    return { error: OPERATOR_ERROR.OK };
  }

  /** Round a currency amount to 2 decimal places. */
  private round(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
