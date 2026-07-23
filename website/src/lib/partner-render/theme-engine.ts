import { THEME_DEFAULTS, mergeTheme } from './theme-defaults';

/**
 * Converts a theme's css_variables map into a complete inline <style> block.
 *
 * - Merges userVars with THEME_DEFAULTS so all 43 canonical vars are always present.
 * - Emits :root { } + global resets + @keyframes for marquee and entrance animations.
 * - Every component uses var(--pb-*) — this single call is the entire styling contract.
 */
export function buildThemeCss(cssVariables: Record<string, string>): string {
  const merged = mergeTheme(cssVariables, THEME_DEFAULTS);

  const declarations = Object.entries(merged)
    .filter(([k]) => k.startsWith('--'))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  return [
    ':root {',
    declarations,
    '}',

    '*, *::before, *::after { box-sizing: border-box; }',
    'body {',
    '  margin: 0;',
    '  padding: 0;',
    '  background: var(--pb-bg-page, #09090b);',
    '  color: var(--pb-text-primary, #f4f4f5);',
    '  font-family: var(--pb-font-body);',
    '  font-size: var(--pb-font-size-base, 16px);',
    '  font-weight: var(--pb-font-weight-body, 400);',
    '  line-height: var(--pb-line-height, 1.6);',
    '}',

    /* Marquee */
    '@keyframes pb-marquee {',
    '  0%   { transform: translateX(0); }',
    '  100% { transform: translateX(-50%); }',
    '}',

    /* Entrance animations — used by section-engine for scroll reveals */
    '@keyframes pb-fade-in {',
    '  from { opacity: 0; }',
    '  to   { opacity: 1; }',
    '}',
    '@keyframes pb-slide-up {',
    '  from { opacity: 0; transform: translateY(16px); }',
    '  to   { opacity: 1; transform: translateY(0); }',
    '}',
  ].join('\n');
}

/** Safe read of a CSS variable value from a merged variables map */
export function v(vars: Record<string, string>, key: string, fallback = '#888'): string {
  return vars[key] ?? fallback;
}
