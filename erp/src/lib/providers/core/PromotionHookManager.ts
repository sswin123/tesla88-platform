import type {
  IPromotionHook,
  PromotionBetContext,
  PromotionHookType,
  PromotionSessionContext,
  PromotionWinContext,
} from '../interfaces/IPromotionHook';

/**
 * Promotion Hook Manager — extension point registry for promotion integrations.
 *
 * Phase G1: The infrastructure is in place and hooks can be registered, but
 * no hooks are invoked until Phase G7+ (Promotion Integration).
 *
 * When a Bet, Win, or Session-End event occurs, the wallet engine (or session
 * service) calls the corresponding broadcast method here.  Each registered
 * hook that handles the event type is invoked in sequence.  Hook failures
 * are caught and logged — they never interrupt the main wallet operation.
 */
export class PromotionHookManager {
  private readonly hooks = new Map<PromotionHookType, IPromotionHook[]>();

  /** Register a promotion hook implementation. */
  register(hook: IPromotionHook): void {
    const existing = this.hooks.get(hook.hookType) ?? [];
    existing.push(hook);
    this.hooks.set(hook.hookType, existing);
  }

  /** Return all registered hook types. */
  registeredTypes(): PromotionHookType[] {
    return Array.from(this.hooks.keys());
  }

  /** Broadcast a bet event to all registered onBet handlers. */
  async onBet(context: PromotionBetContext): Promise<void> {
    await this.broadcastAll(
      context,
      (hook) => typeof hook.onBet === 'function' && hook.onBet(context),
      'onBet',
    );
  }

  /** Broadcast a win event to all registered onWin handlers. */
  async onWin(context: PromotionWinContext): Promise<void> {
    await this.broadcastAll(
      context,
      (hook) => typeof hook.onWin === 'function' && hook.onWin(context),
      'onWin',
    );
  }

  /** Broadcast a session-end event to all registered onSessionEnd handlers. */
  async onSessionEnd(context: PromotionSessionContext): Promise<void> {
    await this.broadcastAll(
      context,
      (hook) => typeof hook.onSessionEnd === 'function' && hook.onSessionEnd(context),
      'onSessionEnd',
    );
  }

  private async broadcastAll(
    _context: unknown,
    invoke: (hook: IPromotionHook) => Promise<boolean> | boolean | undefined,
    eventName: string,
  ): Promise<void> {
    const allHooks = Array.from(this.hooks.values()).flat();
    for (const hook of allHooks) {
      try {
        await invoke(hook);
      } catch (err) {
        console.error(`[PromotionHookManager] Hook "${hook.hookType}" threw on ${eventName}:`, err);
      }
    }
  }
}
