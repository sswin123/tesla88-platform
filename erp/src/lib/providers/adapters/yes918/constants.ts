export const YES918_CODE = 'YES918';
export const YES918_NAME = '918KISS (Yes918)';

export const YES918_ACTION = {
  RANDOM_USERNAME:       'RandomUserName',
  ADD_USER:              'addUser',
  EDIT_USER:             'editUser',
  SET_SERVER_SCORE:      'setServerScore',
  GET_SEARCH_USER_INFO:  'getSearchUserInfo',
  GET_USER_INFO:         'getUserInfo',
  USER_SCORE_LOG:        'UserscoreLog',
  GAME_LOG:              'GameLog',
  DISABLE:               'disable',
  AGENT_TOTAL_REPORT:    'AgentTotalReport',
  PLAYER_TOTAL_REPORT:   'PlayerTotalReport',
  GET_ORDER:             'getOrder',
  KICK:                  'kick',
} as const;

/** Response code meanings from YES918 official API docs. */
export const YES918_ERROR = {
  SUCCESS:         0,
  ORDER_ERROR:    -1,
  SIGN_ERROR:     -2,
  SETTING_SCORE:  -3,  // score update in progress, retry later
  TOO_FREQUENT:   -4,
  SCORE_PARAM:    -5,
  SYS_EXCEPTION:  -6,
  IN_GAME:        -7,  // cannot deduct while player is in game
  INSUFFICIENT:   -8,
  NOT_FOUND:      -9,  // account does not exist
  ILLEGAL:       -99,
} as const;
