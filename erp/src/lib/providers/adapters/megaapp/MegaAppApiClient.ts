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

    // ── Credential snapshot on construction (confirms DB → adapter path) ──
    console.log('[MEGA API CLIENT] constructed', JSON.stringify({
      sn:                    creds.sn,
      agent_login_id:        creds.agent_login_id,
      secret_code_len:       creds.secret_code.length,
      secret_code_masked:    this._maskSecret(creds.secret_code),
      secret_code_empty:     !creds.secret_code,
      api_base_url:          cfg.api_base_url,
    }));
  }

  // ── Member ───────────────────────────────────────────────────────────────

  /** open.mega.user.create — digest = MD5(random+sn+secretCode) */
  async createMember(nickname: string): Promise<CreateMemberResult> {
    const random = this.signer.random();
    // ── DEBUG: confirm agentLoginId comes from this.creds, not overridden ──
    console.log('[MEGA API] createMember CALL', JSON.stringify({
      method:            MEGAAPP_METHOD.CREATE_MEMBER,
      random,
      sn:                this.creds.sn,
      agentLoginId:      this.creds.agent_login_id,
      nickname,
      secret_code_len:   this.creds.secret_code.length,
      secret_code_masked: this._maskSecret(this.creds.secret_code),
    }));
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
    console.log('[MEGA API] getMember CALL', JSON.stringify({
      method:            MEGAAPP_METHOD.GET_MEMBER,
      random,
      sn:                this.creds.sn,
      loginId,
      secret_code_len:   this.creds.secret_code.length,
      secret_code_masked: this._maskSecret(this.creds.secret_code),
    }));
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
    // ── DEBUG: THIS IS WHERE agentLoginId ENTERS THE RPC ──
    // If agentLoginId is wrong here, the value in this.creds is wrong (DB or AdapterFactory).
    console.log('[MEGA API] getAppDownloadUrl CALL', JSON.stringify({
      method:            MEGAAPP_METHOD.APP_DOWNLOAD_URL,
      random,
      sn:                this.creds.sn,
      agentLoginId:      this.creds.agent_login_id,
      secret_code_len:   this.creds.secret_code.length,
      secret_code_masked: this._maskSecret(this.creds.secret_code),
    }));
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
    console.log('[MEGA API] logout CALL', JSON.stringify({
      method:            MEGAAPP_METHOD.LOGOUT,
      random,
      sn:                this.creds.sn,
      loginId,
      secret_code_len:   this.creds.secret_code.length,
      secret_code_masked: this._maskSecret(this.creds.secret_code),
    }));
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
    console.log('[MEGA API] balanceTransfer CALL', JSON.stringify({
      method:            MEGAAPP_METHOD.BALANCE_TRANSFER,
      random,
      sn:                this.creds.sn,
      loginId,
      amount_raw:        amount,
      amount_str:        amountStr,
      bizId:             bizId ?? null,
      secret_code_len:   this.creds.secret_code.length,
      secret_code_masked: this._maskSecret(this.creds.secret_code),
      note: 'digest formula: MD5(random+sn+loginId+amount+secretCode) — amount must match params exactly',
    }));
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
    console.log('[MEGA API] autoTransferOut CALL', JSON.stringify({
      method:            MEGAAPP_METHOD.AUTO_TRANSFER_OUT,
      random,
      sn:                this.creds.sn,
      loginId,
      bizId:             bizId ?? null,
      secret_code_len:   this.creds.secret_code.length,
      secret_code_masked: this._maskSecret(this.creds.secret_code),
      secret_code_empty: !this.creds.secret_code,
      note_digest:       'formula: MD5(random+sn+loginId+secretCode) — secretCode NOT sent as param per MEGA doc',
      note_secretCode:   'secretCode is only used in digest, NOT added to params (official doc does not require it)',
      has_secretCode_in_rpc_params: false,
    }));
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

  /** Mask middle of a secret string; show first 2 + last 2 chars and total length. */
  private _maskSecret(s: string): string {
    if (s.length <= 4) return `[${s.length}chars:****]`;
    return `[${s.length}chars:${s.slice(0, 2)}${'*'.repeat(s.length - 4)}${s.slice(-2)}]`;
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
      // Full RPC trace: logs every field relevant to the official Java Sample comparison.
      const rpcTrace: Record<string, unknown> = {
        method,
        url:         this.apiUrl,
        request_id:  requestId,
        creds_sn:             this.creds.sn,
        creds_agent_login_id: this.creds.agent_login_id,
        creds_secret_code_len:    this.creds.secret_code.length,
        creds_secret_code_masked: this._maskSecret(this.creds.secret_code),
        param_sn:          'sn'           in params ? params['sn']           : '(absent)',
        param_loginId:     'loginId'      in params ? params['loginId']      : '(absent)',
        param_agentLoginId:'agentLoginId' in params ? params['agentLoginId'] : '(absent)',
        param_amount:      'amount'       in params ? params['amount']       : '(absent)',
        param_random:      'random'       in params ? params['random']       : '(absent)',
        param_digest:      'digest'       in params ? params['digest']       : '(absent)',
        param_secretCode_in_params: 'secretCode' in params,
        rpc_body: body,
      };
      console.log('[MEGA API] send() RPC_TRACE', JSON.stringify(rpcTrace));
    }

    if (this.cfg.debug) {
      console.log(`[MEGAAPP API] → REQUEST method="${method}" url="${this.apiUrl}"`);
      console.log(`[MEGAAPP API] → PARAMS:`, JSON.stringify(params));
      console.log(`[MEGAAPP API] → BODY:`, body);
    } else {
      // Minimal log even without debug: method + key identifiers
      const logParams: Record<string, unknown> = {};
      if ('loginId'  in params) logParams['loginId']  = params['loginId'];
      if ('amount'   in params) logParams['amount']   = params['amount'];
      if ('bizId'    in params) logParams['bizId']    = params['bizId'];
      if ('sn'       in params) logParams['sn']       = params['sn'];
      console.log(`[MEGAAPP API] → ${method}`, JSON.stringify(logParams));
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
      console.error(`[MEGAAPP API] ✗ HTTP request FAILED to "${this.apiUrl}" after ${ms}ms: ${msg}`);
      throw new Error(`MEGAAPP HTTP request to ${this.apiUrl} failed after ${ms}ms: ${msg}`);
    }
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[MEGAAPP API] ✗ HTTP ${res.status} from "${this.apiUrl}": ${text.slice(0, 200)}`);
      throw new Error(`MEGAAPP HTTP ${res.status} from ${this.apiUrl}: ${text.slice(0, 200)}`);
    }

    const envelope = (await res.json()) as RpcResponse<T>;
    const ms = Date.now() - start;

    if (this.cfg.debug) {
      console.log(`[MEGAAPP API] ← RESPONSE method="${method}" (${ms}ms):`);
      console.log(JSON.stringify(envelope));
    } else {
      // Always log errors and compact success info
      if (envelope.error) {
        console.error(`[MEGAAPP API] ✗ ${method} ERROR (${ms}ms): code=${envelope.error.code} msg="${envelope.error.message}"${envelope.error.reason ? ` reason="${envelope.error.reason}"` : ''}`);
      } else {
        console.log(`[MEGAAPP API] ✓ ${method} OK (${ms}ms) result=${JSON.stringify(envelope.result).slice(0, 200)}`);
      }
    }

    return envelope;
  }
}
