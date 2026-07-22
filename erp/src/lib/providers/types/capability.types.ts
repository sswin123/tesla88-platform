/**
 * Provider Capability flags.
 *
 * Each capability string represents an optional feature that a provider may or
 * may not support.  Adapters declare their capabilities at registration time;
 * the framework and ERP query them via IGameProvider.getCapabilities() — they
 * never hardcode provider names to check for a feature.
 */

export const PROVIDER_CAPABILITY = {
  /** Provider supports Seamless Wallet (OPERATOR owns the balance). */
  SEAMLESS_WALLET: 'SEAMLESS_WALLET',

  /** Provider supports Transfer Wallet (provider holds a float). */
  TRANSFER_WALLET: 'TRANSFER_WALLET',

  /** Provider can trigger jackpot win callbacks. */
  JACKPOT: 'JACKPOT',

  /** Provider supports tournament mode. */
  TOURNAMENT: 'TOURNAMENT',

  /** Provider supports bonus rounds initiated by OPERATOR. */
  BONUS: 'BONUS',

  /** Provider supports free-spin awards. */
  FREE_SPIN: 'FREE_SPIN',

  /** Provider exposes a game-list sync API. */
  GAME_SYNC: 'GAME_SYNC',

  /** Provider has an H5 lobby URL (not just direct game launch). */
  LOBBY: 'LOBBY',

  /** Provider supports game history / replay URLs. */
  HISTORY: 'HISTORY',

  /** Provider uses a timepoint-based data-feed pagination cursor. */
  TIME_POINT: 'TIME_POINT',

  /** Provider exposes a FailedTransactions feed for reconciliation. */
  FAILED_TRANSACTION: 'FAILED_TRANSACTION',

  /** Provider supports updating a player's display nickname. */
  NICKNAME_UPDATE: 'NICKNAME_UPDATE',

  /** Provider exposes a logout / invalidate-session API. */
  LOGOUT: 'LOGOUT',

  /** Provider supports FundRequest / FundReturn (high-speed game float). */
  FUND_FLOAT: 'FUND_FLOAT',

  /** Provider exposes a CheckOrder API for verifying TopUp/Withdraw. */
  CHECK_ORDER: 'CHECK_ORDER',

  /** Provider supports multi-currency in a single integration. */
  MULTI_CURRENCY: 'MULTI_CURRENCY',
} as const;

export type ProviderCapability = (typeof PROVIDER_CAPABILITY)[keyof typeof PROVIDER_CAPABILITY];

/** Type-guard: returns true when `s` is a known ProviderCapability string. */
export function isProviderCapability(s: string): s is ProviderCapability {
  return Object.values(PROVIDER_CAPABILITY).includes(s as ProviderCapability);
}
