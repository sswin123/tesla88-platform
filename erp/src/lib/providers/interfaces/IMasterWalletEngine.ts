import type {
  AuthenticateRequest,
  AuthenticateResponse,
  BetRequest,
  BetResponse,
  BetResultRequest,
  BetResultResponse,
  FundBetResultRequest,
  FundBetResultResponse,
  FundRequestRequest,
  FundRequestResponse,
  FundReturnRequest,
  FundReturnResponse,
  GetBalanceRequest,
  GetBalanceResponse,
  JackpotWinRequest,
  JackpotWinResponse,
  RefundRequest,
  RefundResponse,
} from '../types/wallet.types';

/**
 * Master Wallet Engine contract.
 *
 * This is the ONLY service allowed to modify player balances for game
 * operations.  It integrates with the existing wallet_transactions table
 * via the adjustWallet() function in lib/services/wallet.ts.
 *
 * Every method is idempotency-safe: duplicate calls with the same
 * reference_id return the previously computed response without
 * performing another balance operation.
 */
export interface IMasterWalletEngine {
  handleAuthenticate(req: AuthenticateRequest): Promise<AuthenticateResponse>;
  handleGetBalance(req: GetBalanceRequest): Promise<GetBalanceResponse>;
  handleBet(req: BetRequest): Promise<BetResponse>;
  handleBetResult(req: BetResultRequest): Promise<BetResultResponse>;
  handleRefund(req: RefundRequest): Promise<RefundResponse>;
  handleJackpotWin(req: JackpotWinRequest): Promise<JackpotWinResponse>;
  handleFundRequest(req: FundRequestRequest): Promise<FundRequestResponse>;
  handleFundReturn(req: FundReturnRequest): Promise<FundReturnResponse>;
  /** FundBetResult is informational — MUST NOT update the wallet balance. */
  handleFundBetResult(req: FundBetResultRequest): Promise<FundBetResultResponse>;
}
