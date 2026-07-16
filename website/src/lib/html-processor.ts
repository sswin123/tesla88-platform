/**
 * HTML Processor — sanitizes admin-entered HTML and extracts inline <style> blocks.
 *
 * Uses DOMParser for robust parsing (always runs client-side inside useEffect).
 *
 * Removes:
 *   - <script>  <iframe>  <object>  <embed>  <link>  <meta>  <base>
 *   - <html>  <head>  <body>  <frame>  <frameset>  <noscript>  <form>
 *   - Event handler attributes (on*)
 *   - javascript: / vbscript: URL schemes
 *   - srcdoc attribute
 *
 * Extracts:
 *   - All <style> tag contents (returned separately for CSS scoping)
 *
 * Allows:
 *   - div, span, section, article, aside, header, footer, main, nav
 *   - p, h1–h6, ul, ol, li, table, tr, td, th
 *   - img (src sanitized), video, audio, canvas, svg
 *   - a (href sanitized), strong, em, code, pre, blockquote, hr, br
 *   - figure, figcaption, details, summary
 */

const REMOVE_TAGS = [
  'script', 'iframe', 'object', 'embed', 'link', 'meta', 'base',
  'frame', 'frameset', 'noscript', 'form',
];

const UNSAFE_URL_RE = /^\s*(javascript|vbscript|data:text\/html)/i;

export interface ProcessedHtml {
  /** Sanitized HTML body (no <style> tags, no dangerous elements) */
  body: string;
  /** Raw CSS extracted from <style> tags (not yet scoped) */
  css: string;
}

/**
 * Parse and sanitize raw HTML.
 * Must be called on the client (uses DOMParser).
 */
export function processHtml(rawHtml: string): ProcessedHtml {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(rawHtml, 'text/html');

  // 1. Extract <style> tags → collect CSS, then remove from DOM
  const cssChunks: string[] = [];
  doc.querySelectorAll('style').forEach(el => {
    const text = el.textContent ?? '';
    if (text.trim()) cssChunks.push(text);
    el.remove();
  });

  // 2. Remove dangerous tags entirely (including their subtrees)
  REMOVE_TAGS.forEach(tag => {
    doc.querySelectorAll(tag).forEach(el => el.remove());
  });

  // 3. Walk all remaining elements and sanitize attributes
  doc.body.querySelectorAll('*').forEach(el => {
    sanitizeElement(el);
  });

  return {
    body: doc.body.innerHTML,
    css:  cssChunks.join('\n'),
  };
}

function sanitizeElement(el: Element): void {
  const toRemove: string[] = [];

  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();

    // Block all event handlers
    if (name.startsWith('on')) {
      toRemove.push(attr.name);
      continue;
    }

    // Block srcdoc (iframe injection even without <iframe>)
    if (name === 'srcdoc') {
      toRemove.push(attr.name);
      continue;
    }

    // Sanitize URL-bearing attributes
    if (name === 'href' || name === 'src' || name === 'action' || name === 'data') {
      const val = attr.value.trim();
      if (UNSAFE_URL_RE.test(val)) {
        el.setAttribute(attr.name, '#');
      }
    }
  }

  toRemove.forEach(name => el.removeAttribute(name));
}
