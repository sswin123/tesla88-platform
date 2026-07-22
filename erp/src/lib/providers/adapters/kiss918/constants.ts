/** 918KISS adapter — shared constants. */

export const KISS918_CODE = '918KISS';
export const KISS918_NAME = '918Kiss';

/** Integration (Operations) API endpoints. */
export const API_PATH = {
  CREATE_PLAYER:       '/operator/v2/CreatePlayer',
  UPDATE_PLAYER:       '/operator/v2/UpdatePlayer',
  GET_BALANCE:         '/operator/v2/GetBalance',
  TOP_UP:             '/operator/v2/TopUp',
  WITHDRAW:           '/operator/v2/Withdraw',
  LOGOUT:             '/operator/v2/LogOut',
  CHECK_PLAYER:       '/operator/v2/CheckPlayer',
  GET_TIMEPOINT:      '/operator/v2/GetTimepoint',
  CHECK_ORDER:        '/operator/v2/CheckOrder',
  PLAY_SESSIONS:      '/operator/v2/PlaySessions',
  FAILED_TRANSACTIONS:'/operator/v2/FailedTransactions',
  CHECK_PLAY_SESSION: '/operator/v2/CheckPlaySession',
} as const;

/** H5 API endpoints (separate domain). */
export const H5_PATH = {
  LOGIN:            '/api/Acc/Login',
  GAME_LIST:        '/api/Game/GameList',
  UPDATE_NICKNAME:  '/api/Acc/UpdateNickname',
} as const;

/**
 * Error codes the OPERATOR returns to 918KISS in Seamless Wallet callbacks.
 * These must match 918KISS's documented error code table exactly.
 */
export const OPERATOR_ERROR = {
  OK:                  0,
  UNKNOWN:             1,
  PLAYER_NOT_FOUND:    2,
  INSUFFICIENT_BALANCE:3,
  AUTH_FAILED:         4,
  DUPLICATE:           6,
  MAINTENANCE:         8,
  SYSTEM_ERROR:        9,
  INVALID_TOKEN:       100,
} as const;

/** 918KISS platform codes. */
export const KISS918_PLATFORM = { MOBILE: 1, WEB: 2 } as const;

/**
 * 918KISS language codes.
 * 1=English, 2=Mandarin, 3=Thai, 5=Indonesian, 7=Vietnamese
 */
export const KISS918_LANGUAGE = { EN: 1, ZH: 2, TH: 3, ID: 5, VI: 7 } as const;

/**
 * CheckOrder transStatus codes.
 */
export const ORDER_STATUS = {
  UNCONFIRMED: 170,
  CONFIRMED:   177,
  CANCELLED:   178,
  REMOVED:     179,
  PENDING:     180,
} as const;

/**
 * FailedTransaction status values.
 * "I" = Incomplete (needs OPERATOR confirmation).
 */
export const FAILED_TX_STATUS = { INCOMPLETE: 'I', COMPLETE: 'C' } as const;

/**
 * Round details patterns for free-round detection.
 * Bets with these patterns should NOT deduct balance (handled by MasterWalletEngine).
 */
export const FREE_ROUND_RE = /free\s*spin|free\s*game|free\s*round/i;
