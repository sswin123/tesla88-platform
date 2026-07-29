// erp/src/lib/providers/adapters/megaapp/MegaAppApiClient.ts
import { randomUUID } from 'crypto';
import type { MegaAppCredentials, MegaAppConfig } from './types';
import { MEGAAPP_METHOD } from './constants';
import { MegaAppSigner } from './MegaAppSigner';

// ── JSON-RPC envelope types ──────────────────────────────────────────────────

interface RpcResponse<T> {
  jsonrpc: string;
  id:      string;
  result:  T | null;
  error:   { code: string | number; message: string; reason?: string } | null;
}

// ── API result types ─────────────────────────────────────────────────────────

export interface CreateMemberResult {
  success:  boolean;
  loginId:  string;
  userId:   number;
  nickname: string;
  regType:  string;
}

export interface GetMemberResult {
  loginId:     string;
  userId:      number;
  nickname:    string;
  userStatus:  number;
  sn:          string;
  regTime:     string;
  balance:     number | null;
}

export interface TransferResult {
  balance: number;  // result field = account balance after transfer
}

export interface AutoTransferOutResult {
  amount: number;   // result field = amount transferred out
}

export interface LogoutResult {
  success: boolean; // result "1" = success
}

// ── Client ───────────────────────────────────────────────────────────────────

export class MegaAppApiClient {
  private readonly signer: MegaAppSigner;
  private readonly apiUrl: string;

  constructor(
    private readonly creds: MegaAppCredentials,
    private readonly cfg:   MegaAppConfig,
  ) {
    this.signer = new MegaAppSigner(creds.secret_code);
    this.apiUrl = cfg.api_base_url.replace(/\/$/, '') + '/';
  }

  // ── Member ───────────────────────────────────────────────────────────────

  /** open.mega.user.create — digest = MD5(random+sn+secretCode) */
  async createMember(nickname: string): Promise<CreateMemberResult> {
    const random = this.signer.random();
    return this.rpc<CreateMemberResult>(MEGAAPP_METHOD.CREATE_MEMBER, {
      sn:           this.creds.sn,
      agentLoginId: this.creds.agent_login_id,
      nickname,
      random,
      digest:       this.signer.digestBasic(random, this.creds.sn),
    });
  }

  /** open.mega.user.get — digest = MD5(random+sn+loginId+secretCode) */
  async getMember(loginId: string): Promise<GetMemberResult> {
    const random = this.signer.random();
    return this.rpc<GetMemberResult>(MEGAAPP_METHOD.GET_MEMBER, {
      sn:      this.creds.sn,
      loginId,
      random,
      digest:  this.signer.digestWithLoginId(random, this.creds.sn, loginId),
    });
  }

  /**
   * open.mega.app.url.download — digest = MD5(random+sn+secretCode)
   * Returns the agent-specific APK / app download URL.
   */
  async getAppDownloadUrl(): Promise<string> {
    const random = this.signer.random();
    return this.rpcRaw<string>(MEGAAPP_METHOD.APP_DOWNLOAD_URL, {
      sn:           this.creds.sn,
      agentLoginId: this.creds.agent_login_id,
      random,
      digest:       this.signer.digestBasic(random, this.creds.sn),
    });
  }

  /** open.mega.user.logout — digest = MD5(random+sn+loginId+secretCode) */
  async logout(loginId: string): Promise<boolean> {
    const random = this.signer.random();
    const raw = await this.rpcRaw<string | number>(MEGAAPP_METHOD.LOGOUT, {
      sn:      this.creds.sn,
      loginId,
      random,
      digest:  this.signer.digestWithLoginId(random, this.creds.sn, loginId),
    });
    return String(raw) === '1';
  }

  // ── Balance Transfer ─────────────────────────────────────────────────────

  /**
   * open.mega.balance.transfer
   * amount > 0 → Transfer IN  (operator → MEGA, top-up player balance)
   * amount < 0 → Transfer OUT (MEGA → operator, withdraw player balance)
   * digest = MD5(random+sn+loginId+amount+secretCode)
   * amount format: per official Java example, whole numbers sent as integer string ("100"),
   *   fractional amounts sent with 2 decimal places ("50.50").
   *   The digest MUST use the exact same string as sent in params.
   * Returns: account balance after transfer.
   */
  async balanceTransfer(loginId: string, amount: number, bizId?: string): Promise<number> {
    const random     = this.signer.random();
    const amountStr  = this.formatAmount(amount);
    const params: Record<string, unknown> = {
      sn:           this.creds.sn,
      loginId,
      amount:       amountStr,
      random,
      digest:       this.signer.digestWithAmount(random, this.creds.sn, loginId, amountStr),
    };
    if (bizId) { params['bizId'] = bizId; params['checkBizId'] = '1'; }

    const result = await this.rpcRaw<number>(MEGAAPP_METHOD.BALANCE_TRANSFER, params);
    return Number(result);
  }

  /**
   * open.mega.balance.auto.transfer.out
   * Automatically withdraws ALL balance from player's MEGA account.
   * digest = MD5(random+sn+loginId+secretCode)
   * Returns: amount transferred out.
   */
  async autoTransferOut(loginId: string, bizId?: string): Promise<number> {
    const random = this.signer.random();
    const params: Record<string, unknown> = {
      sn:      this.creds.sn,
      loginId,
      random,
      digest:  this.signer.digestWithLoginId(random, this.creds.sn, loginId),
    };
    if (bizId) { params['bizId'] = bizId; params['checkBizId'] = '1'; }

    const result = await this.rpcRaw<number>(MEGAAPP_METHOD.AUTO_TRANSFER_OUT, params);
    return Number(result);
  }

  /**
   * open.mega.balance.transfer.query
   * digest = MD5(random+sn+secretCode)
   * Returns paginated transfer records.
   */
  async transferQuery(params: {
    loginId:      string;
    agentLoginId: string;
    startTime:    string;   // yyyy-MM-dd HH:mm:ss
    endTime:      string;
    pageIndex?:   number;
    pageSize?:    number;
    bizId?:       string;
  }): Promise<Record<string, unknown>> {
    const random = this.signer.random();
    return this.rpc<Record<string, unknown>>(MEGAAPP_METHOD.TRANSFER_QUERY, {
      sn:           this.creds.sn,
      loginId:      params.loginId,
      agentLoginId: params.agentLoginId,
      startTime:    params.startTime,
      endTime:      params.endTime,
      pageIndex:    params.pageIndex ?? 1,
      pageSize:     params.pageSize  ?? 15,
      ...(params.bizId ? { bizId: params.bizId } : {}),
      random,
      digest:       this.signer.digestBasic(random, this.creds.sn),
    });
  }

  // ── RPC core ─────────────────────────────────────────────────────────────

  private async rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const envelope = await this.send<T>(method, params);
    if (envelope.error) {
      throw new Error(
        `MEGAAPP RPC ${method} error ${envelope.error.code}: ${envelope.error.message}` +
        (envelope.error.reason ? ` — ${envelope.error.reason}` : ''),
      );
    }
    if (envelope.result === null || envelope.result === undefined) {
      throw new Error(`MEGAAPP RPC ${method}: null result`);
    }
    return envelope.result;
  }

  /** rpcRaw — for methods that return a primitive result (number, string) instead of an object. */
  private async rpcRaw<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const envelope = await this.send<T>(method, params);
    if (envelope.error) {
      throw new Error(
        `MEGAAPP RPC ${method} error ${envelope.error.code}: ${envelope.error.message}` +
        (envelope.error.reason ? ` — ${envelope.error.reason}` : ''),
      );
    }
    return envelope.result as T;
  }

  /**
   * Format amount for MEGA API params + digest.
   * Per official Java example: whole numbers → integer string ("100"),
   * fractional amounts → 2 decimal places ("50.50").
   * The digest MUST use the exact same string that's sent in params.
   */
  private formatAmount(amount: number): string {
    const isWholeNumber = Number.isInteger(amount) || Math.abs(amount % 1) < 1e-10;
    return isWholeNumber ? String(Math.round(amount)) : amount.toFixed(2);
  }

  private async send<T>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<RpcResponse<T>> {
    const requestId = randomUUID().replace(/-/g, '');
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method,
      id:      requestId,
      params,
    });

    if (this.cfg.debug) {
      console.log(`[MEGAAPP] → ${method}`, JSON.stringify(params));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeout_ms);
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(this.apiUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal:  controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const ms  = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`MEGAAPP HTTP request to ${this.apiUrl} failed after ${ms}ms: ${msg}`);
    }
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MEGAAPP HTTP ${res.status} from ${this.apiUrl}: ${text.slice(0, 200)}`);
    }

    const envelope = (await res.json()) as RpcResponse<T>;

    if (this.cfg.debug) {
      const ms = Date.now() - start;
      console.log(`[MEGAAPP] ← ${method} (${ms}ms)`, JSON.stringify(envelope).slice(0, 500));
    }

    return envelope;
  }
}
