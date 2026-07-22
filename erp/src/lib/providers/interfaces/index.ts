/** Central re-export of all Gaming Platform interface definitions. */

export type { IGameProvider } from './IGameProvider';
export type { IProviderManager } from './IProviderManager';
export type { IMasterWalletEngine } from './IMasterWalletEngine';
export type { IProviderRepository } from './IProviderRepository';
export type { IGameRepository } from './IGameRepository';
export type { ITransactionRepository, TxQueryOptions } from './ITransactionRepository';
export type { ISessionRepository, SessionRecord, SessionInput, SessionStatus } from './ISessionRepository';
export type { IEventRepository } from './IEventRepository';
export type { IRetryRepository } from './IRetryRepository';
export type { IHealthRepository } from './IHealthRepository';
export type { IIdempotencyEngine, IdempotencyClaimResult } from './IIdempotencyEngine';
export type { IHealthMonitor } from './IHealthMonitor';
export type { ISecurityService, SecurityEvent } from './ISecurityService';
export type { IGameSyncService } from './IGameSyncService';
export type { IPromotionHook, PromotionHookType, PromotionBetContext, PromotionWinContext, PromotionSessionContext } from './IPromotionHook';

export type {
  CreatePlayerParams,
  CreatePlayerResult,
  UpdatePlayerParams,
  LoginTokenParams,
  GameListParams,
  TopUpParams,
  TopUpResult,
  WithdrawParams,
  WithdrawResult,
  PlaySessionRecord,
  PlaySessionsFeed,
  FailedTransactionRecord,
  FailedTransactionsFeed,
  CheckOrderParams,
  CheckOrderResult,
} from './IGameProvider';
