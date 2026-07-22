/**
 * Seamless Wallet callback types.
 *
 * These are the request and response shapes for callbacks that the PROVIDER
 * sends TO OUR platform.  Field names are kept generic — each adapter maps
 * its provider-specific payload to these shapes before passing them to the
 * MasterWalletEngine.
 */

/** Base fields present on every inbound wallet callback. */
export interface WalletCallbackBase {
  /** Provider code that identifies which adapter to route to. */
  provider: string;
  /** Provider's player identifier. */
  provider_player_id: string;
  /** Unique reference for idempotency checks. */
  reference_id: string;
  /** Round identifier grouping a bet and its result. */
  round_id?: string | null;
  /** Raw provider-specific payload for audit storage. */
  raw_payload: Record<string, unknown>;
}

/** Authenticate — provider verifies a player session. */
export interface AuthenticateRequest extends WalletCallbackBase {
  username: string;
  password: string;
}

export interface AuthenticateResponse {
  player_id: string;
  balance: number;
  currency: string;
  error_code: number;
  error_message?: string;
}

/** GetBalance — provider queries the current player balance. */
export interface GetBalanceRequest extends WalletCallbackBase {
  currency: string;
}

export interface GetBalanceResponse {
  balance: number;
  currency: string;
  error_code: number;
  error_message?: string;
}

/** Bet (Debit) — provider debits a bet amount from the player's wallet. */
export interface BetRequest extends WalletCallbackBase {
  game_id: string;
  game_code?: string | null;
  bet_amount: number;
  currency: string;
  /** Describes the nature of the debit: "spin", "bet", "gamble", "free spin", etc. */
  round_details: string;
  session_id?: string | null;
  platform?: 'MOBILE' | 'WEB' | null;
}

export interface BetResponse {
  transaction_id: string;
  balance: number;
  currency: string;
  error_code: number;
  error_message?: string;
}

/** BetResult (Credit) — provider credits a win amount after a round completes. */
export interface BetResultRequest extends WalletCallbackBase {
  game_id: string;
  game_code?: string | null;
  win_amount: number;
  currency: string;
  round_details: string;
  /** Reference to the original Bet's reference_id. */
  bet_reference_id?: string | null;
  result_url?: string | null;
  session_id?: string | null;
  jackpot_contribution?: number | null;
}

export interface BetResultResponse {
  transaction_id: string;
  balance: number;
  currency: string;
  error_code: number;
  error_message?: string;
}

/** Refund — provider refunds a bet (e.g., disconnection, void round). */
export interface RefundRequest extends WalletCallbackBase {
  game_id: string;
  refund_amount: number;
  currency: string;
  /** reference_id of the original Bet being refunded. */
  bet_reference_id: string;
}

export interface RefundResponse {
  transaction_id: string;
  balance: number;
  currency: string;
  error_code: number;
  error_message?: string;
}

/** JackpotWin — provider credits a jackpot award (separate from BetResult). */
export interface JackpotWinRequest extends WalletCallbackBase {
  game_id: string;
  win_amount: number;
  currency: string;
  jackpot_module?: number | null;
  round_details?: string | null;
}

export interface JackpotWinResponse {
  transaction_id: string;
  balance: number;
  currency: string;
  error_code: number;
  error_message?: string;
}

/** FundRequest — provider requests a float transfer for high-speed games. */
export interface FundRequestRequest extends WalletCallbackBase {
  request_amount: number;
  currency: string;
}

export interface FundRequestResponse {
  transaction_id: string;
  balance: number;
  currency: string;
  error_code: number;
  error_message?: string;
}

/** FundReturn — provider returns the float after a high-speed game session ends. */
export interface FundReturnRequest extends WalletCallbackBase {
  return_amount: number;
  currency: string;
}

export interface FundReturnResponse {
  transaction_id: string;
  balance: number;
  currency: string;
  error_code: number;
  error_message?: string;
}

/**
 * FundBetResult — informational callback for high-speed games.
 * OPERATOR must NOT update the wallet balance; just return success.
 */
export interface FundBetResultRequest extends WalletCallbackBase {
  game_id: string;
  net_amount: number;
  currency: string;
  round_details?: string | null;
}

export interface FundBetResultResponse {
  error_code: number;
  error_message?: string;
}

/** Union of all wallet callback request types. */
export type WalletCallbackRequest =
  | AuthenticateRequest
  | GetBalanceRequest
  | BetRequest
  | BetResultRequest
  | RefundRequest
  | JackpotWinRequest
  | FundRequestRequest
  | FundReturnRequest
  | FundBetResultRequest;
