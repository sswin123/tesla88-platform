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
import { GamingActivityService } from '@/lib/services/gaming-activity';
import { GamingEventType } from '@/lib/providers/types/metadata.types';


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
 *
 * Gaming Activity instrumentation (Phase 3 Task 2):
 *  GamingActivityService.record() is called AFTER txEngine.process() returns
 *  (AFTER COMMIT). It is void fire-and-forget and never throws.
 *  Idempotent results (result.was_idempotent === true) are skipped to avoid
 *  duplicate activity entries. handleGetBalance is intentionally not recorded
 *  — it is a high-frequency polling call with no business audit value.
 */
export class MasterWalletEngine implements IMasterWalletEngine {
  constructor(
    private readonly txEngine: TransactionEngine,
    private readonly providerRepo: IProviderRepository,
  ) {}

  async handleAuthenticate(req: AuthenticateRequest): Promise<AuthenticateResponse> {
    // Kiss918Adapter pre-resolves provider_player_id to users.id from the
    // accountID format (u{userId}@{postfix}).  Use it directly when available.
    // Fallback to username lookup for adapters that don't pre-resolve.
    const preResolved = parseInt(req.provider_player_id, 10);
    const user =
      !isNaN(preResolved) && preResolved > 0
        ? await this.findUserById(preResolved)
        : await this.findUserByUsername(req.username);

    if (!user) {
      return { player_id: '', balance: 0, currency: 'MYR', error_code: ERROR.PLAYER_NOT_FOUND };
    }

    const balance = await this.txEngine.getBalance(user.id);

    // AFTER balance query — no wallet change, safe to record immediately
    void GamingActivityService.record({
      memberId:     user.id,
      providerCode: req.provider,
      eventType:    GamingEventType.Authenticate,
      balanceBefore: balance,
      balanceAfter:  balance,
    });

    return {
      player_id: String(user.id),
      balance,
      currency: 'MYR',
      error_code: ERROR.OK,
    };
  }

  async handleGetBalance(req: GetBalanceRequest): Promise<GetBalanceResponse> {
    // Intentionally not recorded — GetBalance is a high-frequency polling
    // call (every few seconds per active player). Recording it would create
    // massive log volume with no audit value; balance changes are fully
    // captured through Bet / Win / Refund events.
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

    // Free spin / informational round — credit $0 to preserve idempotency
    // and produce a stable transaction_id without debiting the wallet.
    const isFreeRound = /free\s*spin|free\s*game|free\s*round/i.test(req.round_details ?? '');
    if (isFreeRound) {
      const result = await this.txEngine.process({
        provider: req.provider,
        user_id: userId,
        amount: 0,
        currency: req.currency,
        type: TRANSACTION_TYPE.WIN, // $0 credit: no balance change, creates audit row
        reference_id: req.reference_id,
        game_id: req.game_id,
        round_id: req.round_id ?? null,
        metadata: {
          free_round: true,
          round_details: req.round_details,
          raw: req.raw_payload,
        },
      });
      // AFTER COMMIT — record free round as Win($0) with free_round flag
      if (!result.was_idempotent) {
        void GamingActivityService.record({
          memberId:      userId,
          providerCode:  req.provider,
          eventType:     GamingEventType.Win,
          amount:        0,
          balanceBefore: result.balance_before,
          balanceAfter:  result.balance_after,
          metadata: {
            transaction_id: result.transaction_id,
            free_round: true,
            game_id: req.game_id,
            round_id: req.round_id ?? null,
          },
        });
      }
      return {
        transaction_id: result.transaction_id,
        balance: result.balance_after,
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
      // AFTER COMMIT — Insufficient Balance path never reaches here
      if (!result.was_idempotent) {
        void GamingActivityService.record({
          memberId:      userId,
          providerCode:  req.provider,
          eventType:     GamingEventType.Bet,
          amount:        req.bet_amount,
          balanceBefore: result.balance_before,
          balanceAfter:  result.balance_after,
          metadata: {
            transaction_id: result.transaction_id,
            game_id: req.game_id,
            round_id: req.round_id ?? null,
          },
        });
      }

      return {
        transaction_id: result.transaction_id,
        balance: result.balance_after,
        currency: req.currency,
        error_code: ERROR.OK,
      };
    } catch (err: unknown) {
      // Insufficient Balance: ROLLBACK already occurred — do NOT record
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
    // AFTER COMMIT
    if (!result.was_idempotent) {
      void GamingActivityService.record({
        memberId:      userId,
        providerCode:  req.provider,
        eventType:     GamingEventType.Win,
        amount:        req.win_amount,
        balanceBefore: result.balance_before,
        balanceAfter:  result.balance_after,
        metadata: {
          transaction_id: result.transaction_id,
          game_id: req.game_id,
          round_id: req.round_id ?? null,
        },
      });
    }

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
    // AFTER COMMIT
    if (!result.was_idempotent) {
      void GamingActivityService.record({
        memberId:      userId,
        providerCode:  req.provider,
        eventType:     GamingEventType.Refund,
        amount:        req.refund_amount,
        balanceBefore: result.balance_before,
        balanceAfter:  result.balance_after,
        metadata: {
          transaction_id: result.transaction_id,
          game_id: req.game_id,
          round_id: req.round_id ?? null,
        },
      });
    }

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
    // AFTER COMMIT
    if (!result.was_idempotent) {
      void GamingActivityService.record({
        memberId:      userId,
        providerCode:  req.provider,
        eventType:     GamingEventType.JackpotWin,
        amount:        req.win_amount,
        balanceBefore: result.balance_before,
        balanceAfter:  result.balance_after,
        metadata: {
          transaction_id: result.transaction_id,
          game_id: req.game_id,
          round_id: req.round_id ?? null,
          jackpot_module: req.jackpot_module ?? null,
        },
      });
    }

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
      // AFTER COMMIT — Insufficient Balance path never reaches here
      if (!result.was_idempotent) {
        void GamingActivityService.record({
          memberId:      userId,
          providerCode:  req.provider,
          eventType:     GamingEventType.FundRequest,
          amount:        req.request_amount,
          balanceBefore: result.balance_before,
          balanceAfter:  result.balance_after,
          metadata: { transaction_id: result.transaction_id },
        });
      }

      return {
        transaction_id: result.transaction_id,
        balance: result.balance_after,
        currency: req.currency,
        error_code: ERROR.OK,
      };
    } catch (err: unknown) {
      // Insufficient Balance: ROLLBACK already occurred — do NOT record
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
    // AFTER COMMIT
    if (!result.was_idempotent) {
      void GamingActivityService.record({
        memberId:      userId,
        providerCode:  req.provider,
        eventType:     GamingEventType.FundReturn,
        amount:        req.return_amount,
        balanceBefore: result.balance_before,
        balanceAfter:  result.balance_after,
        metadata: { transaction_id: result.transaction_id },
      });
    }

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

  private async findUserById(id: number): Promise<{ id: number } | null> {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

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
