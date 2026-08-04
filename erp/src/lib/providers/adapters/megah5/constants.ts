// erp/src/lib/providers/adapters/megah5/constants.ts

export const MEGAH5_CODE = 'MEGAH5';
export const MEGAH5_NAME = 'Mega888H5';

/** H5 API endpoints (on h5_api_domain). */
export const H5_PATH = {
  LOGIN:      '/api/Acc/Login',
  GAME_LIST:  '/api/Game/GameList',
  LOGOUT:     '/api/Acc/Logout',
} as const;

/** Operations API endpoints (on api_base_url). */
export const API_PATH = {
  CREATE_PLAYER:  '/api/createplayer',          // MG888H5 API v1.0.5 confirmed (curl 405)
  CHECK_PLAYER:   '/operator/v2/CheckPlayer',   // unverified — left unchanged pending investigation
  HEALTH:         '/operator/v2/HealthCheck',   // unverified
} as const;

/**
 * Error codes returned by OPERATOR to MEGAH5 in Seamless Wallet callbacks.
 * Mirror of Kiss918 OPERATOR_ERROR — same numeric convention.
 */
export const OPERATOR_ERROR = {
  OK:                   0,
  UNKNOWN:              1,
  PLAYER_NOT_FOUND:     2,
  INSUFFICIENT_BALANCE: 3,
  AUTH_FAILED:          4,
  DUPLICATE:            6,
  MAINTENANCE:          8,
  SYSTEM_ERROR:         9,
} as const;

export type OperatorErrorCode = typeof OPERATOR_ERROR[keyof typeof OPERATOR_ERROR];

/** Language codes understood by MEGAH5. */
export const MEGAH5_LANGUAGE = { EN: 1, ZH: 2, TH: 3, ID: 5, VI: 7 } as const;
