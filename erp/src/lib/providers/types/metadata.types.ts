/**
 * Gaming Provider Framework Phase 3 — Metadata & Event Types
 *
 * ProviderMetadata: structured behavioral flags in gp_providers.metadata (JSONB).
 *   Describes HOW a provider behaves (UI mode, launch style, protocol).
 *   wallet_type is NOT here — it lives as the authoritative top-level column.
 *   supports_* capability flags should migrate to PROVIDER_CAPABILITY over time;
 *   the ones here are temporarily needed to gate UI branching in Tasks 5–6.
 *
 * PROVIDER_LAUNCH_MODE: typed const — no magic strings anywhere.
 *
 * GamingEventType: all event types GamingActivityService can record.
 *   Defined once here. Do NOT add event types elsewhere.
 *   Principle: GAME_LAUNCH_START/SUCCESS/FAILED — not just a single GAME_LAUNCH —
 *   so failed launches are also visible in the Activity Timeline.
 */


// ─── Provider Launch Mode ─────────────────────────────────────────────────────

/**
 * Typed constant for all known provider launch modes.
 * Reference via PROVIDER_LAUNCH_MODE.WEBVIEW — never write 'webview' directly.
 */
export const PROVIDER_LAUNCH_MODE = {
  /** Open H5 lobby in an in-app browser / iframe (e.g. MEGAH5). */
  WEBVIEW:          'webview',
  /** Open the provider's native lobby URL externally (e.g. 918KISS). */
  LOBBY:            'lobby',
  /** Show MEGA888 credentials dialog; player launches the native app (MEGAAPP). */
  MEGAAPP_DIALOG:   'megaapp_dialog',
} as const;

export type ProviderLaunchMode = typeof PROVIDER_LAUNCH_MODE[keyof typeof PROVIDER_LAUNCH_MODE];

/**
 * Valid values for the gp_providers.website_launch_mode DB column.
 * Used by ERP settings API to validate incoming updates — never write these strings inline.
 */
export const WEBSITE_LAUNCH_MODES = ['LOBBY', 'DIRECT', 'MEGAAPP_DIALOG'] as const;
export type WebsiteLaunchMode = typeof WEBSITE_LAUNCH_MODES[number];

export type ProviderUiMode = 'modern' | 'legacy';


// ─── Provider Metadata ────────────────────────────────────────────────────────

/**
 * Typed shape of gp_providers.metadata JSONB.
 * All fields optional for forward-compatible partial updates.
 * Read via ProviderRegistryService — never query gp_providers.metadata directly.
 *
 * Capability reminder: supports_* here are UI/protocol gates only.
 * Functional feature flags belong in PROVIDER_CAPABILITY (capability.types.ts).
 */
export interface ProviderMetadata {
  /** ERP Gaming Platform settings page rendering mode. Replaces isLegacy hardcode (Task 6). */
  ui_mode?: ProviderUiMode;

  /** How the game session is presented to the player. Use PROVIDER_LAUNCH_MODE constants. */
  launch_mode?: ProviderLaunchMode;

  /** Whether this provider shows an in-app game picker (e.g. MegaH5GamePicker). */
  supports_game_picker?: boolean;

  /** Whether this provider exposes a game catalog sync API (/sync endpoint). */
  supports_game_list?: boolean;

  /**
   * Whether the connection test route runs the H5 lobby auth flow.
   * Replaces: `if (upperCode === '918KISS' && k === 'h5_lobby_domain')` (Task 6).
   */
  supports_lobby_auth_test?: boolean;

  /**
   * Callback protocol identifier. Maps to the dedicated callback route:
   *   megah5_v1   → /api/games/megah5/callback/[action]
   *   kiss918_v1  → /api/games/kiss918/callback/[action]
   *   megaapp_v1  → /api/mega/callback
   */
  callback_protocol?: string;
}


// ─── Gaming Event Types ───────────────────────────────────────────────────────

/**
 * Canonical event type vocabulary for GamingActivityService.record().
 * Define ALL event types here. Never add GamingEventType values elsewhere.
 *
 * Category mapping (member_activity_logs.category):
 *   'GAME'          → LaunchStart/Success/Failed, Authenticate, Session*, Close, Provider*
 *   'GAME_WALLET'   → Transfer*, Bet, Win, Refund, JackpotWin, FundReturn, Sync*, BalanceRefresh
 *   'GAME_ACCOUNT'  → Account* (game account management)
 *   'SYSTEM'        → ProviderHealthCheck, ProviderConfigUpdate
 */
export const GamingEventType = {

  // ── Game Session Lifecycle ── category: GAME ──────────────────────────────
  /** Player clicked launch. Trace ID is minted at this point. */
  LaunchStart:      'GAME_LAUNCH_START',
  /** Launch URL returned to player successfully. */
  LaunchSuccess:    'GAME_LAUNCH_SUCCESS',
  /** Launch failed (balance check, adapter error, config missing, etc.). */
  LaunchFailed:     'GAME_LAUNCH_FAILED',
  /** Seamless: player authenticated with provider (handleAuthenticate). */
  Authenticate:     'GAME_AUTHENTICATE',
  /** Game session is active (post-auth, pre-close). */
  SessionStart:     'GAME_SESSION_START',
  /** Game session ended (logout, timeout, or explicit close callback). */
  SessionEnd:       'GAME_SESSION_END',
  /** Player closed the game / navigated away. */
  GameClose:        'GAME_CLOSE',

  // ── Transfer Wallet Events ── category: GAME_WALLET ──────────────────────
  /** Funds moved main wallet → provider wallet before play. */
  TransferIn:       'WALLET_TRANSFER_IN',
  /** Funds recovered provider wallet → main wallet on login/logout. */
  TransferOut:      'WALLET_TRANSFER_OUT',
  /** Transfer In reversed (topUp failed, concurrent lock, etc.). */
  TransferRollback: 'WALLET_TRANSFER_ROLLBACK',
  /** Transfer failed permanently — manual review may be needed. */
  TransferFailed:   'WALLET_TRANSFER_FAILED',

  // ── Seamless Wallet Events ── category: GAME_WALLET ──────────────────────
  /** Provider debited player balance (handleBet / handleFundRequest). */
  Bet:          'WALLET_BET',
  /** Provider credited player balance (handleBetResult / handleFundBetResult). */
  Win:          'WALLET_WIN',
  /** Provider cancelled a bet and returned funds (handleRefund). */
  Refund:       'WALLET_REFUND',
  /** Jackpot prize credited to player (handleJackpotWin). */
  JackpotWin:   'WALLET_JACKPOT_WIN',
  /** Float advance debited from player balance (handleFundRequest). */
  FundRequest:  'WALLET_FUND_REQUEST',
  /** Float advance returned to player balance (handleFundReturn). */
  FundReturn:   'WALLET_FUND_RETURN',

  // ── Wallet Sync Events ── category: GAME_WALLET ──────────────────────────
  /** Admin or system triggered a wallet balance sync for a provider. */
  SyncStart:    'WALLET_SYNC_START',
  /** Sync completed — balance updated in provider_accounts. */
  SyncSuccess:  'WALLET_SYNC_SUCCESS',
  /** Sync failed — balance could not be retrieved from provider. */
  SyncFailed:   'WALLET_SYNC_FAILED',
  /** Player balance queried (handleGetBalance) or refreshed on demand. */
  BalanceRefresh: 'BALANCE_REFRESH',

  // ── Game Account Events ── category: GAME_ACCOUNT ────────────────────────
  /** Player game account manually created by admin or via API. */
  AccountCreate:     'ACCOUNT_CREATE',
  /** Player game account auto-created on first game launch. */
  AccountAutoCreate: 'ACCOUNT_AUTO_CREATE',
  /** Player game account disabled (banned, suspended, etc.). */
  AccountDisable:    'ACCOUNT_DISABLE',

  // ── Provider System Events ── category: GAME / SYSTEM ────────────────────
  /** Raw provider callback received (use for callbacks not covered by specific events). */
  ProviderCallback:     'PROVIDER_CALLBACK',
  /** Health check performed against provider API. */
  ProviderHealthCheck:  'PROVIDER_HEALTH_CHECK',
  /** Provider credentials or config updated by admin. */
  ProviderConfigUpdate: 'PROVIDER_CONFIG_UPDATE',

} as const;

export type GamingEventTypeValue = typeof GamingEventType[keyof typeof GamingEventType];
