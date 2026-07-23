/**
 * Canonical 43-variable CSS system for Partner Builder pages.
 * These are the default values — every theme in partner_themes overrides
 * the subset it cares about; missing keys fall back to these values.
 *
 * Variable naming is authoritative. All components use --pb-* names
 * defined here. Never reference variables not listed in this file.
 */
export const THEME_DEFAULTS: Record<string, string> = {
  // ── Brand ────────────────────────────────────────────────────
  '--pb-primary':                '#7c3aed',
  '--pb-secondary':              '#6d28d9',
  '--pb-accent':                 '#f59e0b',

  // ── Backgrounds ──────────────────────────────────────────────
  '--pb-bg-page':                '#09090b',
  '--pb-bg-section':             '#18181b',
  '--pb-bg-section-alt':         '#111113',
  '--pb-bg-card':                '#27272a',
  '--pb-bg-card-hover':          '#3f3f46',
  '--pb-bg-header':              '#09090b',
  '--pb-bg-footer':              '#18181b',

  // ── Text ─────────────────────────────────────────────────────
  '--pb-text-primary':           '#f4f4f5',
  '--pb-text-secondary':         '#a1a1aa',
  '--pb-text-muted':             '#71717a',

  // ── Borders ──────────────────────────────────────────────────
  '--pb-border':                 'rgba(255,255,255,0.08)',
  '--pb-border-card':            'rgba(255,255,255,0.06)',

  // ── Buttons ──────────────────────────────────────────────────
  '--pb-btn-bg':                 '#7c3aed',
  '--pb-btn-text':               '#ffffff',
  '--pb-btn-hover':              '#6d28d9',
  '--pb-btn-outline-color':      '#7c3aed',

  // ── Shadows ──────────────────────────────────────────────────
  '--pb-shadow':                 '0 4px 24px rgba(0,0,0,0.4)',
  '--pb-shadow-card':            '0 2px 12px rgba(0,0,0,0.3)',
  '--pb-shadow-glow':            '0 0 24px rgba(124,58,237,0.2)',

  // ── Shape ────────────────────────────────────────────────────
  '--pb-radius':                 '8px',
  '--pb-radius-card':            '12px',
  '--pb-radius-btn':             '6px',
  '--pb-radius-lg':              '16px',

  // ── Typography ───────────────────────────────────────────────
  '--pb-font-display':           "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  '--pb-font-body':              "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  '--pb-font-size-base':         '16px',
  '--pb-font-weight-heading':    '700',
  '--pb-font-weight-body':       '400',
  '--pb-line-height':            '1.6',
  '--pb-letter-spacing-heading': '-0.02em',

  // ── Spacing ──────────────────────────────────────────────────
  '--pb-section-py':             '64px',
  '--pb-section-px':             '20px',
  '--pb-card-gap':               '16px',
  '--pb-card-padding':           '20px',
  '--pb-container-width':        '1200px',

  // ── Animation ────────────────────────────────────────────────
  '--pb-duration-fast':          '0.15s',
  '--pb-duration-base':          '0.2s',
  '--pb-duration-slow':          '0.4s',
  '--pb-easing':                 'cubic-bezier(0.4, 0, 0.2, 1)',
  '--pb-hero-min-height':        '480px',
};

/**
 * Merges a theme's partial css_variables over the canonical defaults.
 * The theme only needs to specify what differs — all 43 vars are always
 * present in the output.
 */
export function mergeTheme(
  userVars: Record<string, string>,
  defaults: Record<string, string> = THEME_DEFAULTS,
): Record<string, string> {
  return { ...defaults, ...userVars };
}
