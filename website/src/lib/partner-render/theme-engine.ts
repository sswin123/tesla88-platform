/**
 * Converts a theme's css_variables map into an inline <style> :root block.
 * Every component that uses var(--pb-*) automatically inherits the active theme
 * without any manual CSS generation per-component.
 */
export function buildThemeCss(cssVariables: Record<string, string>): string {
  const declarations = Object.entries(cssVariables)
    .filter(([k]) => k.startsWith('--'))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  return [
    ':root {',
    declarations,
    '}',
    '*, *::before, *::after { box-sizing: border-box; }',
    'body { margin: 0; padding: 0; background: var(--pb-bg, #09090b); color: var(--pb-text, #f4f4f5); }',
    '@keyframes pb-marquee {',
    '  0% { transform: translateX(0); }',
    '  100% { transform: translateX(-50%); }',
    '}',
  ].join('\n');
}

/** Safe read of a CSS variable value from the variables map */
export function v(vars: Record<string, string>, key: string, fallback = '#888'): string {
  return vars[key] ?? fallback;
}
