/**
 * Promotion Hook extension point contract.
 *
 * Promotion integrations register themselves here so that game events
 * (bet placed, win credited, session ended) can trigger promotion logic
 * WITHOUT any changes to the core wallet or transaction engine.
 *
 * This is Phase G1 scaffolding — hooks are registered but not yet invoked
 * until Phase G7+ (Promotion Integration).
 */
export interface IPromotionHook {
  /** Unique identifier for this hook type (matches gp_promotion_hooks.hook_type). */
  readonly hookType: PromotionHookType;

  /**
   * Called after a successful Bet is processed.
   * Return true to signal that the hook applied a promotion effect.
   */
  onBet?(context: PromotionBetContext): Promise<boolean>;

  /**
   * Called after a successful BetResult (win credit) is processed.
   */
  onWin?(context: PromotionWinContext): Promise<boolean>;

  /**
   * Called after a game session ends.
   */
  onSessionEnd?(context: PromotionSessionContext): Promise<boolean>;
}

export type PromotionHookType =
  | 'FREE_SPIN'
  | 'TOURNAMENT'
  | 'LUCKY_WHEEL'
  | 'CASHBACK'
  | 'VIP'
  | 'DAILY_MISSION'
  | 'REBATE';

export interface PromotionBetContext {
  userId: number;
  provider: string;
  gameCode: string | null;
  betAmount: number;
  currency: string;
  roundId: string | null;
  metadata: Record<string, unknown>;
}

export interface PromotionWinContext {
  userId: number;
  provider: string;
  gameCode: string | null;
  winAmount: number;
  currency: string;
  roundId: string | null;
  metadata: Record<string, unknown>;
}

export interface PromotionSessionContext {
  userId: number;
  provider: string;
  sessionId: number;
  durationSeconds: number;
  totalBet: number;
  totalWin: number;
  currency: string;
}
