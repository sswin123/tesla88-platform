/**
 * Provider Runtime types — the single source of truth for a brand-provider
 * pair's lifecycle state, config completeness, and last-known health.
 *
 * These types flow from BrandProviderManager → snapshot API → Overview/Health UI.
 * No type should be re-derived in the UI layer.
 */

// ── Provider State Machine ────────────────────────────────────────────────────

/**
 * Computed readiness state for a brand-provider pair.
 *
 * The state advances automatically as config/credentials are added and
 * Connection Tests pass. It is INDEPENDENT of the admin-set `status`
 * (ACTIVE/DISABLED), which is stored separately in `brand_providers.status`.
 *
 * Transition conditions:
 *   CREATED          → brand_provider row exists, no config and no credentials
 *   CONFIGURED       → config entries saved, but no credentials yet
 *   CREDENTIAL_READY → credentials saved, adapter can be built
 *   CONNECTED        → last Connection Test showed server reachable (DEGRADED health)
 *   HEALTHY          → last Connection Test returned HEALTHY
 *   LAUNCH_READY     → HEALTHY and games have been synced (game catalog available)
 */
export type ProviderState =
  | 'CREATED'
  | 'CONFIGURED'
  | 'CREDENTIAL_READY'
  | 'CONNECTED'
  | 'HEALTHY'
  | 'LAUNCH_READY';

// ── Per-check health result ────────────────────────────────────────────────────

/** Status for a single dimension of a provider health report. */
export type RuntimeCheckStatus = 'ok' | 'warning' | 'error' | 'unknown';

export interface RuntimeCheck {
  status: RuntimeCheckStatus;
  /** Human-readable message shown in the UI. */
  message: string;
  /** Optional detail (counts, missing keys, error text). */
  detail?: string;
}

// ── Detailed Health Report ────────────────────────────────────────────────────

/**
 * Multi-dimensional health breakdown for a single brand-provider pair.
 *
 * The `configuration`, `credentials`, `adapter`, and `game_sync` checks
 * are always available (computed from DB without network).
 *
 * The `network`, `authentication`, and `provider_api` checks are only
 * populated after the user runs a Connection Test — before that they are
 * 'unknown'.
 *
 * The `launch` check is derived from the combination of all others.
 */
export interface RuntimeHealthReport {
  overall: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  /** DB config entries present / required keys missing. */
  configuration: RuntimeCheck;
  /** DB credential entries present / required keys missing. */
  credentials: RuntimeCheck;
  /** Whether createAdapter() succeeds. */
  adapter: RuntimeCheck;
  /** URL reachability (from last Connection Test). */
  network: RuntimeCheck;
  /** API authentication (from last Connection Test healthCheck()). */
  authentication: RuntimeCheck;
  /** Provider API response health (from last Connection Test). */
  provider_api: RuntimeCheck;
  /** Game catalog sync state (gp_games count). */
  game_sync: RuntimeCheck;
  /** Derived: overall launch readiness. */
  launch: RuntimeCheck;
  /** ISO timestamp of last Connection Test, null if never tested. */
  tested_at: string | null;
}

// ── Diagnostic step ──────────────────────────────────────────────────────────

/** A single step in the adapter build / snapshot build diagnostic trace. */
export interface DiagnosticStep {
  step:       string;                           // e.g. 'read_brand_provider', 'build_adapter'
  status:     'ok' | 'failed' | 'skipped';
  duration_ms: number;
  detail:     string | null;
}

// ── Runtime Snapshot ─────────────────────────────────────────────────────────

/**
 * A complete point-in-time view of a brand-provider pair's runtime state.
 *
 * Built by BrandProviderManager._buildSnapshot() and cached in memory.
 * Invalidated by invalidate() / invalidateAll() — automatically rebuilt
 * in the background after config/credential saves.
 *
 * Does NOT require network calls — health data is read from
 * brand_providers.health_status (written by the Connection Test endpoint).
 */
export interface RuntimeSnapshot {
  /** Brand code, uppercase. */
  brandCode: string;
  /** Provider code, uppercase. */
  providerCode: string;
  /** brand_providers.id. */
  bpId: number;

  // ── Admin-controlled fields ──────────────────────────────────────────────
  /** Admin-set operational status: ACTIVE | DISABLED | MAINTENANCE | TESTING. */
  status: string;
  environment: string;
  wallet_type: string;
  currency: string;

  // ── Computed readiness state ─────────────────────────────────────────────
  state: ProviderState;

  // ── Config / credential counts ───────────────────────────────────────────
  config_count: number;
  credential_count: number;
  /** Config keys defined in the provider template that are absent. */
  missing_config_keys: string[];
  /** Credential keys defined in the provider template that are absent. */
  missing_credential_keys: string[];

  // ── Adapter status ───────────────────────────────────────────────────────
  adapter_built: boolean;
  adapter_error: string | null;

  // ── Health (from DB, written by Connection Test) ──────────────────────────
  health: RuntimeHealthReport;
  /** Mirrors brand_providers.health_status. */
  health_status: string;
  health_checked_at: string | null;
  last_success_at: string | null;
  last_failed_at: string | null;

  // ── Stats ────────────────────────────────────────────────────────────────
  /** Count of gp_games rows for this provider. */
  games_synced: number;

  // ── Adapter version ──────────────────────────────────────────────────────
  /** Adapter version declared in AdapterRegistry.register() — e.g. "1.2.0". */
  adapter_version: string;

  // ── Diagnostics ──────────────────────────────────────────────────────────
  /** Step-by-step trace of the last snapshot build. */
  diagnostics: DiagnosticStep[];

  // ── Meta ─────────────────────────────────────────────────────────────────
  /** ISO timestamp of when this snapshot was built. */
  loaded_at: string;
  /** Non-null only when the snapshot itself could not be fully built. */
  build_error: string | null;
}
