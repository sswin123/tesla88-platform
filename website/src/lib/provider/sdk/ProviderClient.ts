// ProviderClient — the top-level contract every provider adapter must implement.
// WalletService and GameSessionService consume this interface, never concrete adapters.

import type {
  ProviderEnvironment, WalletType,
  BalanceResult, DebitRequest, CreditRequest,
  FreezeRequest, RollbackRequest, TransactionResult,
  LaunchRequest, LaunchResult, SessionValidation,
  TransferRequest, ProviderMember,
} from './types';

// ── Wallet interface ───────────────────────────────────────────────────────────

export interface IProviderWallet {
  getBalance(member: ProviderMember): Promise<BalanceResult>;
  debit(req:    DebitRequest):    Promise<TransactionResult>;
  credit(req:   CreditRequest):   Promise<TransactionResult>;
  freeze(req:   FreezeRequest):   Promise<TransactionResult>;
  unfreeze(req: FreezeRequest):   Promise<TransactionResult>;
  rollback(req: RollbackRequest): Promise<TransactionResult>;
}

// ── Game interface ─────────────────────────────────────────────────────────────

export interface IProviderGame {
  launch(req:         LaunchRequest): Promise<LaunchResult>;
  validateSession(token: string):     Promise<SessionValidation>;
  endSession(token:   string):        Promise<void>;
}

// ── Transfer wallet interface (for TRANSFER-type providers) ───────────────────

export interface IProviderTransfer {
  transferIn(req:  TransferRequest): Promise<TransactionResult>;
  transferOut(req: TransferRequest): Promise<TransactionResult>;
  getBalance(member: ProviderMember): Promise<BalanceResult>;
}

// ── Top-level provider client ─────────────────────────────────────────────────

export interface IProviderClient {
  readonly provider:     string;
  readonly environment:  ProviderEnvironment;
  readonly walletType:   WalletType;

  wallet:   IProviderWallet;
  game:     IProviderGame;
  transfer: IProviderTransfer; // only meaningful for TRANSFER wallet type

  /** Health check — returns true if provider API is reachable */
  ping(): Promise<boolean>;
}

// ── Abstract base (handles boilerplate; concrete adapters extend this) ─────────

export abstract class BaseProviderClient implements IProviderClient {
  abstract readonly provider:    string;
  abstract readonly environment: ProviderEnvironment;
  abstract readonly walletType:  WalletType;
  abstract wallet:    IProviderWallet;
  abstract game:      IProviderGame;
  abstract transfer:  IProviderTransfer;

  async ping(): Promise<boolean> {
    return true; // override in concrete implementations
  }
}
