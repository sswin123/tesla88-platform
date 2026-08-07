/**
 * GamingActivityService — Gaming Provider Framework Phase 3
 *
 * SINGLE ENTRY POINT for all gaming activity events in the ERP.
 *
 * ARCHITECTURE RULES:
 *   ① Any gaming route / wallet engine / callback handler that needs to record
 *     activity MUST call GamingActivityService.record() — never ActivityLogService.log()
 *     directly for gaming events.
 *   ② ActivityLogService is a low-level primitive; GamingActivityService is the
 *     domain layer that knows about providers, event types, and trace IDs.
 *   ③ This service NEVER throws. Any error is swallowed and logged so it never
 *     blocks the caller's business operation.
 *   ④ This service is Provider-Agnostic — it accepts a provider_code string and
 *     resolves display_name via ProviderRegistryService.
 *   ⑤ Adding a new event type: add it to GamingEventType (metadata.types.ts)
 *     and add one entry to EVENT_MAP below. Zero other files need to change.
 *
 * Trace ID:
 *   GamingActivityService auto-mints a trace ID when eventType === LaunchStart.
 *   All subsequent events in the same session pass in the returned traceId.
 *   The trace_id column in member_activity_logs links the full lifecycle:
 *   GAME_LAUNCH_START → Transfer → Bet → Win → Refund → Sync
 */

import type { PoolClient } from 'pg';
import { ActivityLogService, type ActivityCategory, type ActivityLevel } from '@/lib/services/activity-log';
import { GamingEventType, type GamingEventTypeValue } from '@/lib/providers/types/metadata.types';
import { generateTraceId } from '@/lib/framework/trace-id';
import { providerRegistry } from '@/lib/services/provider-registry';


// ─── Event Specification Map ──────────────────────────────────────────────────

interface EventSpec {
  category: ActivityCategory;
  action: string;
  level: ActivityLevel;
  title: (displayName: string) => string;
  description?: (displayName: string, amount?: number | null) => string | undefined;
}

/**
 * Complete mapping of every GamingEventType to its ActivityLog fields.
 * `satisfies` enforces that every GamingEventTypeValue has an entry here —
 * adding a new event type to GamingEventType without adding it here is a
 * compile-time error.
 */
const EVENT_MAP = {

  // ── Game Session Lifecycle ────────────────────────────────────────────────
  [GamingEventType.LaunchStart]: {
    category: 'GAME',
    action:   'Launch Start',
    level:    'INFO',
    title:    (n) => `${n} — Launch Started`,
    description: (n) => `Player initiated ${n} game session`,
  },
  [GamingEventType.LaunchSuccess]: {
    category: 'GAME',
    action:   'Launch Success',
    level:    'INFO',
    title:    (n) => `${n} — Launch Success`,
  },
  [GamingEventType.LaunchFailed]: {
    category: 'GAME',
    action:   'Launch Failed',
    level:    'WARNING',
    title:    (n) => `${n} — Launch Failed`,
  },
  [GamingEventType.Authenticate]: {
    category: 'GAME',
    action:   'Authenticate',
    level:    'INFO',
    title:    (n) => `${n} — Player Authenticated`,
  },
  [GamingEventType.SessionStart]: {
    category: 'GAME',
    action:   'Session Start',
    level:    'INFO',
    title:    (n) => `${n} — Session Started`,
  },
  [GamingEventType.SessionEnd]: {
    category: 'GAME',
    action:   'Session End',
    level:    'INFO',
    title:    (n) => `${n} — Session Ended`,
  },
  [GamingEventType.GameClose]: {
    category: 'GAME',
    action:   'Game Close',
    level:    'INFO',
    title:    (n) => `${n} — Game Closed`,
  },

  // ── Transfer Wallet Events ────────────────────────────────────────────────
  [GamingEventType.TransferIn]: {
    category:    'GAME_WALLET',
    action:      'Transfer In',
    level:       'INFO',
    title:       (n) => `${n} — Transfer In`,
    description: (n, amt) => amt != null ? `Transferred RM ${amt.toFixed(2)} to ${n}` : undefined,
  },
  [GamingEventType.TransferOut]: {
    category:    'GAME_WALLET',
    action:      'Transfer Out',
    level:       'INFO',
    title:       (n) => `${n} — Transfer Out`,
    description: (n, amt) => amt != null ? `Recovered RM ${amt.toFixed(2)} from ${n}` : undefined,
  },
  [GamingEventType.TransferRollback]: {
    category: 'GAME_WALLET',
    action:   'Transfer Rollback',
    level:    'WARNING',
    title:    (n) => `${n} — Transfer In Rollback`,
  },
  [GamingEventType.TransferFailed]: {
    category: 'GAME_WALLET',
    action:   'Transfer Failed',
    level:    'CRITICAL',
    title:    (n) => `${n} — Transfer Failed (CRITICAL)`,
  },

  // ── Seamless Wallet Events ────────────────────────────────────────────────
  [GamingEventType.Bet]: {
    category:    'GAME_WALLET',
    action:      'Bet',
    level:       'INFO',
    title:       (n) => `${n} — Bet`,
    description: (_n, amt) => amt != null ? `RM ${amt.toFixed(2)} deducted` : undefined,
  },
  [GamingEventType.Win]: {
    category:    'GAME_WALLET',
    action:      'Win',
    level:       'INFO',
    title:       (n) => `${n} — Win`,
    description: (_n, amt) => amt != null ? `RM ${amt.toFixed(2)} credited` : undefined,
  },
  [GamingEventType.Refund]: {
    category:    'GAME_WALLET',
    action:      'Refund',
    level:       'INFO',
    title:       (n) => `${n} — Bet Refund`,
    description: (_n, amt) => amt != null ? `RM ${amt.toFixed(2)} refunded` : undefined,
  },
  [GamingEventType.JackpotWin]: {
    category:    'GAME_WALLET',
    action:      'Jackpot Win',
    level:       'INFO',
    title:       (n) => `${n} — Jackpot Win`,
    description: (_n, amt) => amt != null ? `Jackpot: RM ${amt.toFixed(2)}` : undefined,
  },
  [GamingEventType.FundRequest]: {
    category:    'GAME_WALLET',
    action:      'Fund Request',
    level:       'INFO',
    title:       (n) => `${n} — Fund Request`,
    description: (_n, amt) => amt != null ? `RM ${amt.toFixed(2)} float advance deducted` : undefined,
  },
  [GamingEventType.FundReturn]: {
    category:    'GAME_WALLET',
    action:      'Fund Return',
    level:       'INFO',
    title:       (n) => `${n} — Fund Return`,
    description: (_n, amt) => amt != null ? `RM ${amt.toFixed(2)} float advance returned` : undefined,
  },

  // ── Wallet Sync Events ────────────────────────────────────────────────────
  [GamingEventType.SyncStart]: {
    category: 'GAME_WALLET',
    action:   'Sync Start',
    level:    'INFO',
    title:    (n) => `${n} — Wallet Sync Start`,
  },
  [GamingEventType.SyncSuccess]: {
    category:    'GAME_WALLET',
    action:      'Sync Success',
    level:       'INFO',
    title:       (n) => `${n} — Wallet Synced`,
    description: (n, amt) => amt != null ? `Balance: RM ${amt.toFixed(2)} from ${n}` : undefined,
  },
  [GamingEventType.SyncFailed]: {
    category: 'GAME_WALLET',
    action:   'Sync Failed',
    level:    'WARNING',
    title:    (n) => `${n} — Wallet Sync Failed`,
  },
  [GamingEventType.BalanceRefresh]: {
    category:    'GAME_WALLET',
    action:      'Balance Refresh',
    level:       'INFO',
    title:       (n) => `${n} — Balance Refreshed`,
    description: (n, amt) => amt != null ? `Current balance: RM ${amt.toFixed(2)}` : undefined,
  },

  // ── Game Account Events ───────────────────────────────────────────────────
  [GamingEventType.AccountCreate]: {
    category: 'GAME_ACCOUNT',
    action:   'Account Create',
    level:    'INFO',
    title:    (n) => `${n} — Account Created`,
  },
  [GamingEventType.AccountAutoCreate]: {
    category: 'GAME_ACCOUNT',
    action:   'Account Auto-Create',
    level:    'INFO',
    title:    (n) => `${n} — Account Auto-Created`,
    description: (n) => `${n} account auto-provisioned on first launch`,
  },
  [GamingEventType.AccountDisable]: {
    category: 'GAME_ACCOUNT',
    action:   'Account Disable',
    level:    'WARNING',
    title:    (n) => `${n} — Account Disabled`,
  },

  // ── Provider System Events ────────────────────────────────────────────────
  [GamingEventType.ProviderCallback]: {
    category: 'GAME',
    action:   'Provider Callback',
    level:    'INFO',
    title:    (n) => `${n} — Callback Received`,
  },
  [GamingEventType.ProviderHealthCheck]: {
    category: 'SYSTEM',
    action:   'Health Check',
    level:    'INFO',
    title:    (n) => `${n} — Health Check`,
  },
  [GamingEventType.ProviderConfigUpdate]: {
    category: 'SYSTEM',
    action:   'Config Update',
    level:    'INFO',
    title:    (n) => `${n} — Config Updated`,
  },

} as const satisfies Record<GamingEventTypeValue, EventSpec>;

// Widened reference — gives `spec.description?.(...)` the correct optional type
const EVENTS: Record<GamingEventTypeValue, EventSpec> = EVENT_MAP;


// ─── Public Interface ─────────────────────────────────────────────────────────

export interface GamingActivityInput {
  /** Internal member ID (users.id). */
  memberId:      number;
  /** Provider code exactly as stored in gp_providers.code (e.g. 'MEGAAPP'). */
  providerCode:  string;
  /** The event being recorded. Use GamingEventType constants. */
  eventType:     GamingEventTypeValue;
  /**
   * Session trace ID to link this event to others in the same gaming session.
   * For LaunchStart: omit or pass null — a new ID is auto-generated and returned.
   * For all subsequent events: pass the traceId returned by the LaunchStart call.
   */
  traceId?:       string | null;
  /** Monetary amount involved (bet stake, win payout, transfer amount, etc.). */
  amount?:        number | null;
  balanceBefore?: number | null;
  balanceAfter?:  number | null;
  referenceType?: string | null;
  referenceId?:   number | null;
  /** Additional structured data stored in member_activity_logs.metadata. */
  metadata?:      Record<string, unknown> | null;
  operatorType?:  'MEMBER' | 'STAFF' | 'SYSTEM';
  operatorId?:    number | null;
  operatorName?:  string | null;
  /** Pass an active PoolClient to participate in a DB transaction. */
  client?:        PoolClient;
}

export interface GamingActivityResult {
  /** The generated activity_id (ACT00000001 format), or null if logging failed. */
  activityId: string | null;
  /**
   * The trace_id used for this event (either the input traceId or the
   * auto-generated one for LaunchStart). Pass this to all subsequent events
   * in the same gaming session.
   */
  traceId: string | null;
}


// ─── GamingActivityService ────────────────────────────────────────────────────

export class GamingActivityService {
  /**
   * Record a gaming activity event.
   *
   * Never throws — errors are swallowed so they never block wallet operations,
   * game launches, or callback handling.
   *
   * @returns GamingActivityResult with activityId and traceId.
   *          On failure: { activityId: null, traceId: <the trace_id that was used> }
   *
   * @example — Game launch sequence:
   *   // On GAME_LAUNCH_START, omit traceId → auto-generated
   *   const { traceId } = await GamingActivityService.record({
   *     memberId: 123, providerCode: 'MEGAAPP',
   *     eventType: GamingEventType.LaunchStart,
   *   });
   *
   *   // Pass traceId to every subsequent event in this session
   *   await GamingActivityService.record({
   *     memberId: 123, providerCode: 'MEGAAPP',
   *     eventType: GamingEventType.TransferIn,
   *     traceId, amount: 100.00, balanceBefore: 500, balanceAfter: 400,
   *   });
   */
  static async record(input: GamingActivityInput): Promise<GamingActivityResult> {
    const {
      memberId, providerCode, eventType,
      traceId: inputTraceId,
      amount, balanceBefore, balanceAfter,
      referenceType, referenceId,
      metadata, operatorType, operatorId, operatorName,
      client,
    } = input;

    // Resolve trace ID before any async work so it's always returned
    const traceId: string | null =
      inputTraceId ??
      (eventType === GamingEventType.LaunchStart ? generateTraceId('GS') : null);

    // Resolve display name — never throw, fallback to code
    let displayName: string;
    try {
      displayName = await providerRegistry.getDisplayName(providerCode);
    } catch {
      displayName = providerCode;
    }

    const spec = EVENTS[eventType];

    // Merge caller metadata with provider_code tag (always present for queryability)
    const enrichedMetadata: Record<string, unknown> = {
      provider_code: providerCode,
      ...(metadata ?? {}),
    };

    const activityId = await ActivityLogService.log({
      member_id:     memberId,
      category:      spec.category,
      action:        spec.action,
      title:         spec.title(displayName),
      description:   spec.description?.(displayName, amount) ?? null,
      amount:        amount         ?? null,
      balance_before: balanceBefore ?? null,
      balance_after:  balanceAfter  ?? null,
      reference_type: referenceType ?? null,
      reference_id:   referenceId   ?? null,
      operator_type:  operatorType  ?? 'SYSTEM',
      operator_id:    operatorId    ?? null,
      operator_name:  operatorName  ?? null,
      source:        'SYSTEM',
      level:          spec.level,
      metadata:       enrichedMetadata,
      trace_id:       traceId,
      client,
    });

    return { activityId, traceId };
  }
}
