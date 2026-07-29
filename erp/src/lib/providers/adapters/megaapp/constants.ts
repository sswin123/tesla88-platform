// erp/src/lib/providers/adapters/megaapp/constants.ts

export const MEGAAPP_CODE = 'MEGAAPP';
export const MEGAAPP_NAME = 'MEGA888 App';

/** JSON-RPC 2.0 method names — Operator → MEGA */
export const MEGAAPP_METHOD = {
  CREATE_MEMBER:      'open.mega.user.create',
  GET_MEMBER:         'open.mega.user.get',
  LOGOUT:             'open.mega.user.logout',
  BALANCE_TRANSFER:   'open.mega.balance.transfer',
  AUTO_TRANSFER_OUT:  'open.mega.balance.auto.transfer.out',
  TRANSFER_QUERY:     'open.mega.balance.transfer.query',
} as const;

/**
 * Callback method name that MEGA calls on OUR server.
 * Endpoint: POST /api/games/megaapp/callback/login
 */
export const MEGAAPP_CALLBACK_LOGIN = 'open.operator.user.login';

/**
 * App deeplink scheme.
 * Android:  lobbymegarelease://?account={id}&password={pw}
 * iOS:      lobbymegarelease://account={id}&password={pw}
 */
export const MEGAAPP_DEEPLINK_SCHEME = 'lobbymegarelease';

/** Error codes returned by MEGA API */
export const MEGAAPP_ERROR = {
  MISSING_PARAM:         700,
  DIGEST_INVALID:        721,
  USER_CANCELLED:        2214,
  USER_BANNED:           2215,
  USER_DISABLED:         2217,
  RATE_LIMIT:            2632,
  MEMBER_NOT_EXIST:      21102,
  ILLEGAL_PARAM:         21108,
  ILLEGAL_ACCOUNT:       21110,
  REGION_RESTRICTED:     21116,
  ILLEGAL_PLAYER:        21117,
  MAINTENANCE:           21118,
  ILLEGAL_API_SOURCE:    21119,
  API_NOT_OPEN:          21120,
  LOGIN_DISABLED:        21121,
  TRANSFER_FAIL:         37120,
  TRANSFER_IN_FAIL:      37122,
  BALANCE_INSUFFICIENT:  37123,
  TRANSFER_OUT_FAIL:     37124,
  PLAYER_IN_GAME:        37131,
  AGENT_NOT_EXIST:       37134,
  TOO_FREQUENT:          37150,
  AGENT_STATUS_ERROR:    37170,
  CREATE_MEMBER_FAIL:    37171,
  CREATE_FAIL_DAILY_CAP: 37196,
  API_CLIENT_NOT_EXIST:  37197,
  TRANSFER_AGENT_INSUF:  37199,
  API_CLIENT_DISABLED:   37203,
  ACCOUNT_EXISTS:        37320,
  QUERY_TOO_FREQUENT:    37321,
  TRANSFER_IN_PROGRESS:  37153,
} as const;
