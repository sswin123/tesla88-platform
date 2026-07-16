// MockProviderClient — realistic stub for testing without real provider APIs.
// Used when provider_settings.environment = 'MOCK' or mock_enabled = true.
// Returns plausible responses with configurable delay and failure rates.

import type {
  BalanceResult, DebitRequest, CreditRequest, FreezeRequest,
  RollbackRequest, TransactionResult, LaunchRequest, LaunchResult,
  SessionValidation, TransferRequest, ProviderMember,
} from './types';
import type {
  IProviderWallet, IProviderGame, IProviderTransfer, IProviderClient,
} from './ProviderClient';
import { GameSessionService } from './GameSessionService';

// In-memory balance store per userId (resets on server restart)
const mockBalances = new Map<string, number>();

function getBalance(userId: string, currency: string): BalanceResult {
  const amount = mockBalances.get(userId) ?? 1000.00; // default mock balance
  return { userId, balance: { amount, currency } };
}

function setBalance(userId: string, amount: number): void {
  mockBalances.set(userId, Math.max(0, amount));
}

function txResult(transactionId: string, userId: string, currency: string): TransactionResult {
  return {
    transactionId,
    status:  'SUCCESS',
    balance: { amount: mockBalances.get(userId) ?? 0, currency },
  };
}

// ── Mock Wallet ────────────────────────────────────────────────────────────────

class MockWallet implements IProviderWallet {
  async getBalance(member: ProviderMember): Promise<BalanceResult> {
    return getBalance(member.userId, member.currency);
  }

  async debit(req: DebitRequest): Promise<TransactionResult> {
    const current = mockBalances.get(req.member.userId) ?? 1000.00;
    if (current < req.amount.amount) {
      return { transactionId: req.transactionId, status: 'FAILED', errorCode: 'INSUFFICIENT_BALANCE' };
    }
    setBalance(req.member.userId, current - req.amount.amount);
    return txResult(req.transactionId, req.member.userId, req.amount.currency);
  }

  async credit(req: CreditRequest): Promise<TransactionResult> {
    const current = mockBalances.get(req.member.userId) ?? 1000.00;
    setBalance(req.member.userId, current + req.amount.amount);
    return txResult(req.transactionId, req.member.userId, req.amount.currency);
  }

  async freeze(req: FreezeRequest): Promise<TransactionResult> {
    const current = mockBalances.get(req.member.userId) ?? 1000.00;
    if (current < req.amount.amount) {
      return { transactionId: req.betId, status: 'FAILED', errorCode: 'INSUFFICIENT_BALANCE' };
    }
    setBalance(req.member.userId, current - req.amount.amount);
    return { transactionId: req.betId, status: 'SUCCESS', balance: { amount: mockBalances.get(req.member.userId) ?? 0, currency: req.amount.currency } };
  }

  async unfreeze(req: FreezeRequest): Promise<TransactionResult> {
    const current = mockBalances.get(req.member.userId) ?? 0;
    setBalance(req.member.userId, current + req.amount.amount);
    return { transactionId: req.betId, status: 'SUCCESS', balance: { amount: mockBalances.get(req.member.userId) ?? 0, currency: req.amount.currency } };
  }

  async rollback(req: RollbackRequest): Promise<TransactionResult> {
    return { transactionId: req.transactionId, status: 'SUCCESS', balance: { amount: mockBalances.get(req.member.userId) ?? 0, currency: req.member.currency } };
  }
}

// ── Mock Game ──────────────────────────────────────────────────────────────────

class MockGame implements IProviderGame {
  async launch(req: LaunchRequest): Promise<LaunchResult> {
    const token   = GameSessionService.generateToken('MOCK');
    const expires = new Date(Date.now() + 4 * 3600 * 1000); // 4h
    return {
      sessionToken: token,
      launchUrl:    `https://mock.provider.local/game/${req.gameId}?token=${token}&demo=${req.demo ?? false}`,
      expiresAt:    expires,
    };
  }

  async validateSession(token: string): Promise<SessionValidation> {
    const isValid = token.startsWith('mock_');
    return {
      valid:     isValid,
      errorCode: isValid ? undefined : 'INVALID_TOKEN',
    };
  }

  async endSession(_token: string): Promise<void> {
    // no-op for mock
  }
}

// ── Mock Transfer ─────────────────────────────────────────────────────────────

class MockTransfer implements IProviderTransfer {
  async transferIn(req: TransferRequest): Promise<TransactionResult> {
    const current = mockBalances.get(req.member.userId) ?? 0;
    setBalance(req.member.userId, current + req.amount.amount);
    return { transactionId: req.transactionId, status: 'SUCCESS', balance: { amount: mockBalances.get(req.member.userId) ?? 0, currency: req.amount.currency } };
  }

  async transferOut(req: TransferRequest): Promise<TransactionResult> {
    const current = mockBalances.get(req.member.userId) ?? 0;
    if (current < req.amount.amount) {
      return { transactionId: req.transactionId, status: 'FAILED', errorCode: 'INSUFFICIENT_BALANCE' };
    }
    setBalance(req.member.userId, current - req.amount.amount);
    return { transactionId: req.transactionId, status: 'SUCCESS', balance: { amount: mockBalances.get(req.member.userId) ?? 0, currency: req.amount.currency } };
  }

  async getBalance(member: ProviderMember): Promise<BalanceResult> {
    return getBalance(member.userId, member.currency);
  }
}

// ── MockProviderClient ─────────────────────────────────────────────────────────

export class MockProviderClient implements IProviderClient {
  readonly provider    = 'MOCK';
  readonly environment = 'MOCK' as const;
  readonly walletType  = 'SEAMLESS' as const;
  readonly wallet      = new MockWallet();
  readonly game        = new MockGame();
  readonly transfer    = new MockTransfer();

  async ping(): Promise<boolean> { return true; }
}

// Singleton for use in tests and playground
export const mockProviderClient = new MockProviderClient();

// ── Mock callback payloads (for ERP Playground) ────────────────────────────────

import crypto from 'crypto';

export const MOCK_PAYLOADS: Record<string, Record<string, unknown>> = {
  BALANCE_QUERY: {
    action:    'getbalance',
    userId:    'SS1000001',
    currency:  'MYR',
    timestamp: () => Math.floor(Date.now() / 1000),
  },
  DEBIT: {
    action:        'debit',
    userId:        'SS1000001',
    amount:        10.00,
    currency:      'MYR',
    transactionId: () => `TX${Date.now()}`,
    roundId:       () => `RD${Date.now()}`,
    gameId:        'JILI001',
    timestamp:     () => Math.floor(Date.now() / 1000),
  },
  CREDIT: {
    action:        'credit',
    userId:        'SS1000001',
    amount:        15.50,
    currency:      'MYR',
    transactionId: () => `TX${Date.now()}`,
    roundId:       () => `RD${Date.now()}`,
    gameId:        'JILI001',
    timestamp:     () => Math.floor(Date.now() / 1000),
  },
  ROLLBACK: {
    action:                'rollback',
    userId:                'SS1000001',
    transactionId:         () => `TX${Date.now()}`,
    originalTransactionId: `TX${Date.now() - 5000}`,
    currency:              'MYR',
    timestamp:             () => Math.floor(Date.now() / 1000),
  },
  SETTLEMENT: {
    action:        'settle',
    userId:        'SS1000001',
    amount:        25.00,
    currency:      'MYR',
    transactionId: () => `TX${Date.now()}`,
    roundId:       () => `RD${Date.now()}`,
    gameId:        'JILI001',
    betAmount:     10.00,
    winAmount:     25.00,
    timestamp:     () => Math.floor(Date.now() / 1000),
  },
};

export function buildMockPayload(action: string): Record<string, unknown> {
  const template = MOCK_PAYLOADS[action] ?? MOCK_PAYLOADS.BALANCE_QUERY;
  return Object.fromEntries(
    Object.entries(template).map(([k, v]) => [k, typeof v === 'function' ? (v as () => unknown)() : v])
  );
}
