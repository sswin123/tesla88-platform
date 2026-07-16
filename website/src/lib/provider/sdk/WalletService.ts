// WalletService — unified wallet operations across all providers.
// Business logic calls WalletService; WalletService delegates to the correct
// IProviderClient based on provider name and environment.
//
// This layer is responsible for:
//   - Routing to the right provider client
//   - Recording every operation in provider_transactions
//   - Idempotency (reject duplicate transactionIds)
//   - Balance consistency (before/after snapshot)
//
// Provider-specific details (signature, field names) stay in the adapter.

import type {
  BalanceResult, DebitRequest, CreditRequest,
  FreezeRequest, RollbackRequest, TransactionResult,
  ProviderMember, Money,
} from './types';
import type { IProviderClient } from './ProviderClient';

// ── Transaction recorder (implemented by TransactionService) ──────────────────

export interface ITransactionRecorder {
  recordDebit(provider: string, req: DebitRequest, result: TransactionResult, before: Money): Promise<void>;
  recordCredit(provider: string, req: CreditRequest, result: TransactionResult, before: Money): Promise<void>;
  recordRollback(provider: string, req: RollbackRequest, result: TransactionResult): Promise<void>;
  isDuplicate(provider: string, transactionId: string): Promise<boolean>;
}

// ── WalletService ─────────────────────────────────────────────────────────────

export class WalletService {
  constructor(
    private readonly client:   IProviderClient,
    private readonly recorder: ITransactionRecorder,
  ) {}

  async getBalance(member: ProviderMember): Promise<BalanceResult> {
    return this.client.wallet.getBalance(member);
  }

  async debit(req: DebitRequest): Promise<TransactionResult> {
    if (await this.recorder.isDuplicate(this.client.provider, req.transactionId)) {
      return { transactionId: req.transactionId, status: 'DUPLICATE' };
    }
    const before = await this.client.wallet.getBalance(req.member);
    const result = await this.client.wallet.debit(req);
    await this.recorder.recordDebit(this.client.provider, req, result, before.balance);
    return result;
  }

  async credit(req: CreditRequest): Promise<TransactionResult> {
    if (await this.recorder.isDuplicate(this.client.provider, req.transactionId)) {
      return { transactionId: req.transactionId, status: 'DUPLICATE' };
    }
    const before = await this.client.wallet.getBalance(req.member);
    const result = await this.client.wallet.credit(req);
    await this.recorder.recordCredit(this.client.provider, req, result, before.balance);
    return result;
  }

  async freeze(req: FreezeRequest): Promise<TransactionResult> {
    return this.client.wallet.freeze(req);
  }

  async unfreeze(req: FreezeRequest): Promise<TransactionResult> {
    return this.client.wallet.unfreeze(req);
  }

  async rollback(req: RollbackRequest): Promise<TransactionResult> {
    const result = await this.client.wallet.rollback(req);
    await this.recorder.recordRollback(this.client.provider, req, result);
    return result;
  }
}
