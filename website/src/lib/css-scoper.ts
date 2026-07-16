/**
 * CSS Scoper — prefix all CSS selectors with a unique widget scope ID.
 *
 * Rules:
 *  - @import is removed entirely (prevents external resource loading)
 *  - @keyframes / @font-face  kept verbatim (already isolated by name)
 *  - @media / @supports / @layer / @container  inner rules are recursively scoped
 *  - Unknown @-rules are dropped for safety
 *  - `html`, `body`, `:root` selectors are stripped (cannot be meaningfully scoped)
 *  - All other selectors are prefixed: `.hero` → `#widget-xxx .hero`
 */

const UNSCOPEABLE = new Set(['html', 'body', ':root']);

export function scopeCss(css: string, scopeId: string): string {
  // Strip @import — no external stylesheet loading
  const stripped = css.replace(/@import\b[^;]+;/gi, '');
  return processBlock(stripped, `#${scopeId}`);
}

// ── Brace matching ─────────────────────────────────────────────────────────────

function findClose(css: string, openPos: number): number {
  let depth = 0;
  for (let i = openPos; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return css.length;
}

// ── Rule block processor (recursive for @media etc.) ─────────────────────────

function processBlock(css: string, scope: string): string {
  const out: string[] = [];
  let i = 0;

  while (i < css.length) {
    // Skip whitespace
    const wsM = /^\s+/.exec(css.slice(i));
    if (wsM) { i += wsM[0].length; continue; }
    if (i >= css.length) break;

    if (css[i] === '@') {
      // At-rule
      const headEnd = css.indexOf('{', i);
      if (headEnd === -1) break;

      const head    = css.slice(i, headEnd).trim();
      const closeAt = findClose(css, headEnd);
      const inner   = css.slice(headEnd + 1, closeAt);
      const atMatch = /^@([\w-]+)/.exec(head);
      const atName  = atMatch?.[1]?.toLowerCase() ?? '';

      switch (atName) {
        case 'keyframes':
        case '-webkit-keyframes':
        case 'font-face':
          // Keep verbatim — already isolated
          out.push(css.slice(i, closeAt + 1));
          break;

        case 'media':
        case 'supports':
        case 'layer':
        case 'container':
          // Recurse — scope inner selectors
          out.push(`${head} {${processBlock(inner, scope)}}`);
          break;

        default:
          // Unknown @-rule — drop for safety
          break;
      }

      i = closeAt + 1;
      continue;
    }

    // Regular rule: selector { body }
    const bracePos = css.indexOf('{', i);
    if (bracePos === -1) break;

    const selectorStr = css.slice(i, bracePos).trim();
    const closePos    = findClose(css, bracePos);
    const body        = css.slice(bracePos + 1, closePos);

    const scoped = scopeSelectors(selectorStr, scope);
    if (scoped) out.push(`${scoped} {${body}}`);

    i = closePos + 1;
  }

  return out.join('\n');
}

// ── Selector scoping ──────────────────────────────────────────────────────────

function scopeSelectors(list: string, scope: string): string {
  const scoped = list
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => scopeOne(s, scope))
    .filter((s): s is string => s !== null);

  return scoped.join(', ');
}

function scopeOne(selector: string, scope: string): string | null {
  const lower = selector.toLowerCase().trim();

  // Strip selectors that escape scoping
  if (UNSCOPEABLE.has(lower)) return null;

  // Already has the scope prefix (re-processing guard)
  if (selector.startsWith(scope)) return selector;

  return `${scope} ${selector}`;
}
