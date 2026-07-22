/**
 * Enterprise Gaming Platform — Public Framework API
 *
 * This is the single import point for all consumers of the gaming framework.
 * Application code should ONLY import from this file — never from sub-modules
 * directly.  This gives us the freedom to reorganize internals without
 * breaking callers.
 *
 * Usage (application startup):
 *
 *   import { createGamingPlatform } from '@/lib/providers';
 *
 *   const platform = createGamingPlatform();
 *   platform.manager.register(new Kiss918Adapter(credentials, config));
 *   await platform.manager.boot();
 *
 * Usage (wallet callback route):
 *
 *   import { getPlatform } from '@/lib/providers';
 *
 *   const { wallet, security } = getPlatform();
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  ProviderRecord,
  ProviderInput,
  ProviderStatus,
  ProviderEnvironment,
  ProviderWalletType,
  ProviderHealthStatus,
  CredentialRecord,
  ProviderCredentials,
  ConfigRecord,
  ProviderConfig,
  ResolvedProvider,
  ProviderPlayerRecord,
  ProviderPlayerInput,
} from './types/provider.types';

export { PROVIDER_CAPABILITY, isProviderCapability } from './types/capability.types';
export type { ProviderCapability } from './types/capability.types';

export { CONFIG_KEY, CREDENTIAL_KEY } from './types/config.types';
export type { ConfigKey, CredentialKey } from './types/config.types';

export { GAME_TYPE } from './types/game.types';
export type {
  GameType,
  GameRecord,
  GameListItem,
  GameListResult,
  GameSyncResult,
  LaunchParams,
  LaunchResult,
  TimepointRecord,
} from './types/game.types';

export type {
  WalletCallbackBase,
  AuthenticateRequest,
  AuthenticateResponse,
  BetRequest,
  BetResponse,
  BetResultRequest,
  BetResultResponse,
  RefundRequest,
  RefundResponse,
  JackpotWinRequest,
  JackpotWinResponse,
  FundRequestRequest,
  FundRequestResponse,
  FundReturnRequest,
  FundReturnResponse,
  FundBetResultRequest,
  FundBetResultResponse,
  GetBalanceRequest,
  GetBalanceResponse,
} from './types/wallet.types';

export { TRANSACTION_TYPE, TRANSACTION_STATUS } from './types/transaction.types';
export type {
  TransactionType,
  TransactionStatus,
  TransactionRecord,
  TransactionInput,
  WalletOperationParams,
  WalletOperationResult,
} from './types/transaction.types';

export type { HealthCheckResult, HealthCheckStatus, PlatformHealthReport } from './types/health.types';
export type { EventLogInput, EventLogRecord } from './types/event.types';
export type { RetryInput, RetryRecord, RetryStatus, RetryTickResult } from './types/retry.types';

// ── Interfaces ────────────────────────────────────────────────────────────────

export type { IGameProvider } from './interfaces/IGameProvider';
export type { IProviderManager } from './interfaces/IProviderManager';
export type { IMasterWalletEngine } from './interfaces/IMasterWalletEngine';
export type { IProviderRepository } from './interfaces/IProviderRepository';
export type { IGameRepository } from './interfaces/IGameRepository';
export type { ITransactionRepository } from './interfaces/ITransactionRepository';
export type { ISessionRepository, SessionRecord, SessionInput, SessionStatus } from './interfaces/ISessionRepository';
export type { IEventRepository } from './interfaces/IEventRepository';
export type { IRetryRepository } from './interfaces/IRetryRepository';
export type { IHealthRepository } from './interfaces/IHealthRepository';
export type { IIdempotencyEngine } from './interfaces/IIdempotencyEngine';
export type { IHealthMonitor } from './interfaces/IHealthMonitor';
export type { ISecurityService, SecurityEvent } from './interfaces/ISecurityService';
export type { IGameSyncService } from './interfaces/IGameSyncService';
export type { IPromotionHook, PromotionHookType } from './interfaces/IPromotionHook';

// ── Adapter Base ──────────────────────────────────────────────────────────────

export { BaseProviderAdapter, NotSupportedError, ProviderApiError, ProviderError } from './adapters/base/BaseProviderAdapter';

// ── Core Services ─────────────────────────────────────────────────────────────

export { ProviderRegistry } from './core/ProviderRegistry';
export { ProviderManager } from './core/ProviderManager';
export { MasterWalletEngine } from './core/MasterWalletEngine';
export { TransactionEngine } from './core/TransactionEngine';
export { IdempotencyEngine } from './core/IdempotencyEngine';
export { RetryQueue } from './core/RetryQueue';
export { EventLogger } from './core/EventLogger';
export { HealthMonitor } from './core/HealthMonitor';
export { GameSyncService } from './core/GameSyncService';
export { SecurityService, SecurityError } from './core/SecurityService';
export { PromotionHookManager } from './core/PromotionHookManager';

// ── Repositories ──────────────────────────────────────────────────────────────

export { ProviderRepository } from './repositories/ProviderRepository';
export { GameRepository } from './repositories/GameRepository';
export { TransactionRepository } from './repositories/TransactionRepository';
export { SessionRepository } from './repositories/SessionRepository';
export { EventRepository } from './repositories/EventRepository';
export { RetryRepository } from './repositories/RetryRepository';
export { HealthRepository } from './repositories/HealthRepository';

// ── Platform Factory ──────────────────────────────────────────────────────────

import { ProviderManager } from './core/ProviderManager';
import { MasterWalletEngine } from './core/MasterWalletEngine';
import { TransactionEngine } from './core/TransactionEngine';
import { IdempotencyEngine } from './core/IdempotencyEngine';
import { RetryQueue } from './core/RetryQueue';
import { EventLogger } from './core/EventLogger';
import { SecurityService } from './core/SecurityService';
import { PromotionHookManager } from './core/PromotionHookManager';
import { ProviderRepository } from './repositories/ProviderRepository';
import { GameRepository } from './repositories/GameRepository';
import { TransactionRepository } from './repositories/TransactionRepository';
import { SessionRepository } from './repositories/SessionRepository';
import { EventRepository } from './repositories/EventRepository';
import { RetryRepository } from './repositories/RetryRepository';
import { HealthRepository } from './repositories/HealthRepository';
import { ProviderRegistry } from './core/ProviderRegistry';

/** The fully-wired gaming platform singleton. */
export interface GamingPlatform {
  /** Main entry point for all game operations. */
  manager: ProviderManager;
  /** Process all Seamless Wallet callbacks. */
  wallet: MasterWalletEngine;
  /** Token validation, IP filtering, credential encryption. */
  security: SecurityService;
  /** Retry failed callbacks. */
  retryQueue: RetryQueue;
  /** Promotion extension points. */
  promotionHooks: PromotionHookManager;
  /** Raw event logger (for advanced use cases). */
  eventLogger: EventLogger;
}

let _platform: GamingPlatform | null = null;

/**
 * Create (or return the cached) gaming platform instance.
 *
 * Call once at application startup.  Re-using this singleton across
 * requests avoids the overhead of re-wiring all dependencies on each
 * Next.js request.
 */
export function createGamingPlatform(): GamingPlatform {
  if (_platform) return _platform;

  const providerRepo = new ProviderRepository();
  const gameRepo = new GameRepository();
  const txRepo = new TransactionRepository();
  const sessionRepo = new SessionRepository();
  const eventRepo = new EventRepository();
  const retryRepo = new RetryRepository();
  const healthRepo = new HealthRepository();

  const idempotency = new IdempotencyEngine();
  const txEngine = new TransactionEngine(txRepo, idempotency);
  const wallet = new MasterWalletEngine(txEngine, providerRepo);
  const eventLogger = new EventLogger(eventRepo);
  const security = new SecurityService(eventRepo);
  const promotionHooks = new PromotionHookManager();

  const manager = new ProviderManager(providerRepo, gameRepo, healthRepo, sessionRepo);
  const registry = (manager as unknown as { registry: ProviderRegistry }).registry;
  const retryQueue = new RetryQueue(retryRepo, registry);

  _platform = { manager, wallet, security, retryQueue, promotionHooks, eventLogger };
  return _platform;
}

/** Return the existing platform instance.  Throws if not yet created. */
export function getPlatform(): GamingPlatform {
  if (!_platform) {
    throw new Error(
      'Gaming platform has not been initialized. Call createGamingPlatform() at startup first.',
    );
  }
  return _platform;
}

/** Reset the singleton (use in tests only). */
export function _resetPlatform(): void {
  _platform = null;
}
