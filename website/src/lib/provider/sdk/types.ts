// Shared types for the Provider SDK.
// All provider integrations (JILI, PG, Pragmatic, Evolution…) use these types.
// No provider-specific fields here — those belong in each adapter.

// ── Environment ────────────────────────────────────────────────────────────────

export type ProviderEnvironment = 'PRODUCTION' | 'SANDBOX' | 'MOCK';

export type WalletType = 'SEAMLESS' | 'TRANSFER';

// ── Currency & Money ───────────────────────────────────────────────────────────

export interface Money {
  amount:   number; // always in provider's smallest accountable unit (e.g. 2 decimal for MYR)
  currency: string; // ISO 4217 (MYR, SGD, USD, …)
}

// ── Member identity (what providers know about our users) ──────────────────────

export interface ProviderMember {
  userId:     string; // our public_id (e.g. SS1000001)
  username:   string; // optional display name
  currency:   string;
  language?:  string;
  country?:   string;
}

// ── Transaction types ──────────────────────────────────────────────────────────

export type TransactionType =
  | 'BALANCE_QUERY'
  | 'DEBIT'        // provider debits our player's balance (player bet)
  | 'CREDIT'       // provider credits our player's balance (player win)
  | 'FREEZE'       // reserve funds for a bet (pre-debit)
  | 'UNFREEZE'     // release reserved funds (bet cancelled)
  | 'ROLLBACK'     // undo a previous debit/credit
  | 'SETTLEMENT';  // end-of-round final settlement

export type TransactionStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'DUPLICATE';

export interface TransactionContext {
  provider:      string;
  transactionId: string;
  referenceId?:  string;
  type:          TransactionType;
  member:        ProviderMember;
  amount?:       Money;
  gameId?:       string;
  roundId?:      string;
  sessionId?:    string;
  environment:   ProviderEnvironment;
  metadata?:     Record<string, unknown>;
}

export interface TransactionResult {
  transactionId: string;
  status:        TransactionStatus;
  balance?:      Money;
  errorCode?:    string;
  errorMessage?: string;
}

// ── Wallet ─────────────────────────────────────────────────────────────────────

export interface BalanceResult {
  userId:   string;
  balance:  Money;
  frozen?:  Money;
}

export interface DebitRequest {
  member:        ProviderMember;
  amount:        Money;
  transactionId: string;
  referenceId?:  string;
  gameId?:       string;
  roundId?:      string;
}

export interface CreditRequest {
  member:        ProviderMember;
  amount:        Money;
  transactionId: string;
  referenceId?:  string;
  gameId?:       string;
  roundId?:      string;
}

export interface FreezeRequest {
  member:        ProviderMember;
  amount:        Money;
  betId:         string;
  gameId?:       string;
}

export interface RollbackRequest {
  member:        ProviderMember;
  originalTransactionId: string;
  transactionId: string;
  reason?:       string;
}

// ── Game Session ───────────────────────────────────────────────────────────────

export interface LaunchRequest {
  member:      ProviderMember;
  gameId:      string;
  gameCode?:   string;
  returnUrl?:  string;
  language?:   string;
  platform?:   'DESKTOP' | 'MOBILE' | 'APP';
  demo?:       boolean;
  environment: ProviderEnvironment;
}

export interface LaunchResult {
  sessionToken: string;
  launchUrl:    string;
  expiresAt?:   Date;
}

export interface SessionValidation {
  valid:       boolean;
  member?:     ProviderMember;
  expiresAt?:  Date;
  errorCode?:  string;
}

// ── Transfer Wallet (for TRANSFER wallet type providers) ──────────────────────

export interface TransferRequest {
  member:        ProviderMember;
  amount:        Money;
  transactionId: string;
  direction:     'IN' | 'OUT';
}
