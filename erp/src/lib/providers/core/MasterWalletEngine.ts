import type { IMasterWalletEngine } from '../interfaces/IMasterWalletEngine';
import type { IProviderRepository } from '../interfaces/IProviderRepository';
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
import { TRANSACTION_TYPE } from '../types/transaction.types';
import { TransactionEngine } from './TransactionEngine';
import pool from '@/lib/db';
import { randomUUID } from 'crypto';

const ERROR = {
  OK: 0,
  UNKNOWN: 1,
  PLAYER_NOT_FOUND: 2,
  INSUFFICIENT_BALANCE: 3,
  AUTH_FAILED: 4,
  DUPLICATE: 6,
  MAINTENANCE: 8,
  SYSTEM_ERROR: 9,
  INVALID_TOKEN: 100,
} as const;

/**
 * Master Wallet Engine — the ONLY service that processes game-related
 * balance changes.  It handles all Seamless Wallet callbacks in a
 * provider-agnostic way.
 *
 * Each method:
 *  1. Verifies the player exists in our system
 *  2. Delegates to TransactionEngine (which handles idempotency + DB)
 *  3. Returns a normalized response
 *
 * Provider adapters call formatXxxResponse() to convert the normalized
 * response back into the provider's expected JSON shape.
 */
export class MasterWalletEngine implements IMasterWalletEngine {
  constructor(
    private readonly txEngine: TransactionEngine,
    private readonly providerRepo: IProviderRepository,
  ) {}

  async handleAuthenticate(req: AuthenticateRequest): Promise<AuthenticateResponse> {
    const user = await this.findUserByUsername(req.username);
    if (!user) {
      return { player_id: '', balance: 0, currency: 'MYR', error_code: ERROR.PLAYER_NOT_FOUND };
    }

    const balance = await this.txEngine.getBalance(user.id);

    return {
      player_id: String(user.id),
      balance,
      currency: 'MYR',
      error_code: ERROR.OK,
    };
  }

  async handleGetBalance(req: GetBalanceRequest): Promise<GetBalanceResponse> {
    const userId = parseInt(req.provider_player_id, 10);
    if (isNaN(userId)) {
      return { balance: 0, currency: req.currency, error_code: ERROR.PLAYER_NOT_FOUND };
    }

    try {
      const balance = await this.txEngine.getBalance(userId);
      return { balance, currency: req.currency, error_code: ERROR.OK };
    } catch {
      return { balance: 0, currency: req.currency, error_code: ERROR.PLAYER_NOT_FOUND };
    }
  }

  async handleBet(req: BetRequest): Promise<BetResponse> {
    const userId = parseInt(req.provider_player_id, 10);
    if (isNaN(userId)) {
      return { transaction_id: '', balance: 0, currency: req.currency, error_code: ERROR.PLAYER_NOT_FOUND };
    }

    // Free spin / informational round — no balance change
    const isFreeRound = /free\s*spin/i.test(req.round_details ?? '');
    if (isFreeRound) {
      const balance = await this.txEngine.getBalance(userId);
      return {
        transaction_id: randomUUID(),
        balance,
        currency: req.currency,
        error_code: ERROR.OK,
      };
    }

    try {
      const result = await this.txEngine.process({
        provider: req.provider,
        user_id: userId,
        amount: req.bet_amount,
        currency: req.currency,
        type: TRANSACTION_TYPE.BET,
        reference_id: req.reference_id,
        game_id: req.game_id,
        round_id: req.round_id ?? null,
        metadata: { round_details: req.round_details, raw: req.raw_payload },
      });

      return {
        transaction_id: result.transaction_id,
        balance: result.balance_after,
        currency: req.currency,
        error_code: ERROR.OK,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Insufficient balance')) {
        return { transaction_id: '', balance: 0, currency: req.currency, error_code: ERROR.INSUFFICIENT_BALANCE };
      }
      throw err;
    }
  }

  async handleBetResult(req: BetResultRequest): Promise<BetResultResponse> {
    const userId = parseInt(req.provider_player_id, 10);
    if (isNaN(userId)) {
      return { transaction_id: '', balance: 0, currency: req.currency, error_code: ERROR.PLAYER_NOT_FOUND };
    }

    const result = await this.txEngine.process({
      provider: req.provider,
      user_id: userId,
      amount: req.win_amount,
      currency: req.currency,
      type: TRANSACTION_TYPE.WIN,
      reference_id: req.reference_id,
      game_id: req.game_id,
      round_id: req.round_id ?? null,
      metadata: {
        round_details: req.round_details,
        bet_reference_id: req.bet_reference_id,
        result_url: req.result_url,
        raw: req.raw_payload,
      },
    });

    return {
      transaction_id: result.transaction_id,
      balance: result.balance_after,
      currency: req.currency,
      error_code: ERROR.OK,
    };
  }

  async handleRefund(req: RefundRequest): Promise<RefundResponse> {
    const userId = parseInt(req.provider_player_id, 10);
    if (isNaN(userId)) {
      return { transaction_id: '', balance: 0, currency: req.currency, error_code: ERROR.PLAYER_NOT_FOUND };
    }

    const result = await this.txEngine.process({
      provider: req.provider,
      user_id: userId,
      amount: req.refund_amount,
      currency: req.currency,
      type: TRANSACTION_TYPE.REFUND,
      reference_id: req.reference_id,
      game_id: req.game_id,
      round_id: req.round_id ?? null,
      metadata: { bet_reference_id: req.bet_reference_id, raw: req.raw_payload },
    });

    return {
      transaction_id: result.transaction_id,
      balance: result.balance_after,
      currency: req.currency,
      error_code: ERROR.OK,
    };
  }

  async handleJackpotWin(req: JackpotWinRequest): Promise<JackpotWinResponse> {
    const userId = parseInt(req.provider_player_id, 10);
    if (isNaN(userId)) {
      return { transaction_id: '', balance: 0, currency: req.currency, error_code: ERROR.PLAYER_NOT_FOUND };
    }

    const result = await this.txEngine.process({
      provider: req.provider,
      user_id: userId,
      amount: req.win_amount,
      currency: req.currency,
      type: TRANSACTION_TYPE.WIN,
      reference_id: req.reference_id,
      game_id: req.game_id,
      round_id: req.round_id ?? null,
      metadata: {
        jackpot_module: req.jackpot_module,
        round_details: req.round_details,
        raw: req.raw_payload,
      },
    });

    return {
      transaction_id: result.transaction_id,
      balance: result.balance_after,
      currency: req.currency,
      error_code: ERROR.OK,
    };
  }

  async handleFundRequest(req: FundRequestRequest): Promise<FundRequestResponse> {
    const userId = parseInt(req.provider_player_id, 10);
    if (isNaN(userId)) {
      return { transaction_id: '', balance: 0, currency: req.currency, error_code: ERROR.PLAYER_NOT_FOUND };
    }

    try {
      const result = await this.txEngine.process({
        provider: req.provider,
        user_id: userId,
        amount: req.request_amount,
        currency: req.currency,
        type: TRANSACTION_TYPE.FUND_REQUEST,
        reference_id: req.reference_id,
        metadata: { raw: req.raw_payload },
      });

      return {
        transaction_id: result.transaction_id,
        balance: result.balance_after,
        currency: req.currency,
        error_code: ERROR.OK,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Insufficient balance')) {
        return { transaction_id: '', balance: 0, currency: req.currency, error_code: ERROR.INSUFFICIENT_BALANCE };
      }
      throw err;
    }
  }

  async handleFundReturn(req: FundReturnRequest): Promise<FundReturnResponse> {
    const userId = parseInt(req.provider_player_id, 10);
    if (isNaN(userId)) {
      return { transaction_id: '', balance: 0, currency: req.currency, error_code: ERROR.PLAYER_NOT_FOUND };
    }

    const result = await this.txEngine.process({
      provider: req.provider,
      user_id: userId,
      amount: req.return_amount,
      currency: req.currency,
      type: TRANSACTION_TYPE.FUND_RETURN,
      reference_id: req.reference_id,
      metadata: { raw: req.raw_payload },
    });

    return {
      transaction_id: result.transaction_id,
      balance: result.balance_after,
      currency: req.currency,
      error_code: ERROR.OK,
    };
  }

  /**
   * FundBetResult — MUST NOT update the wallet balance.
   * Return success immediately; the actual bet/result will arrive as separate callbacks.
   */
  handleFundBetResult(_req: FundBetResultRequest): Promise<FundBetResultResponse> {
    return Promise.resolve({ error_code: ERROR.OK });
  }

  // ── Internal Helpers ───────────────────────────────────────────────────────

  private async findUserByUsername(
    username: string,
  ): Promise<{ id: number; username: string } | null> {
    const { rows } = await pool.query<{ id: number; username: string }>(
      `SELECT id, username FROM users WHERE username = $1 LIMIT 1`,
      [username],
    );
    return rows[0] ?? null;
  }
}
