const MAX_HTML_BYTES = 100 * 1024;

const REMOVE_TAGS = [
  'script', 'iframe', 'object', 'embed', 'link', 'meta', 'base',
  'frame', 'frameset', 'noscript', 'form',
];

// Explicit allowlist — anything not in this set is stripped (subtree removed)
const ALLOWED_ELEMENTS = new Set([
  // Layout
  'div', 'span', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav',
  // Text
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'code', 'kbd', 'samp', 'var',
  'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark',
  'small', 'sub', 'sup', 'abbr', 'cite', 'q', 'time', 'address',
  'hr', 'br', 'wbr',
  // Interactive
  'a', 'button',
  // Media
  'img', 'video', 'audio', 'picture', 'source', 'track',
  'figure', 'figcaption',
  // Table
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  // SVG (top-level only; children handled separately via closest('svg'))
  'svg',
  // Misc
  'details', 'summary',
  'canvas', 'ruby', 'rt', 'rp',
]);

const UNSAFE_URL_RE = /^\s*(javascript|vbscript|data:text\/html)/i;

export interface ProcessedHtml {
  body: string;
  css: string;
}

export function processHtml(rawHtml: string): ProcessedHtml {
  // Size guard — reject oversized widgets before parsing
  if (new TextEncoder().encode(rawHtml).length > MAX_HTML_BYTES) {
    return {
      body: '<p style="color:#c00;font-size:13px;padding:8px">HTML 内容超过 100 KB 限制，已拒绝渲染。</p>',
      css: '',
    };
  }

  const parser = new DOMParser();
  const doc    = parser.parseFromString(rawHtml, 'text/html');

  // 1. Extract <style> tags → collect CSS, remove from DOM
  const cssChunks: string[] = [];
  doc.querySelectorAll('style').forEach(el => {
    const text = el.textContent ?? '';
    if (text.trim()) cssChunks.push(text);
    el.remove();
  });

  // 2. Remove explicitly dangerous tags and their subtrees
  REMOVE_TAGS.forEach(tag => {
    doc.querySelectorAll(tag).forEach(el => el.remove());
  });

  // 3. Enforce element whitelist — strip anything not explicitly allowed
  //    Elements inside <svg> are passed through (except foreignObject which embeds HTML)
  doc.body.querySelectorAll('*').forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (el.closest('svg') && tag !== 'foreignobject') return;
    if (!ALLOWED_ELEMENTS.has(tag)) el.remove();
  });

  // 4. Sanitize attributes on surviving elements
  doc.body.querySelectorAll('*').forEach(el => sanitizeElement(el));

  // 5. Auto-enhance: lazy-load images
  doc.body.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('loading'))  img.setAttribute('loading',  'lazy');
    if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
  });

  // 6. Auto-enhance: secure outbound links
  doc.body.querySelectorAll('a[target="_blank"]').forEach(a => {
    const parts = (a.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean);
    if (!parts.includes('noopener'))   parts.push('noopener');
    if (!parts.includes('noreferrer')) parts.push('noreferrer');
    a.setAttribute('rel', parts.join(' '));
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

    // Block srcdoc (HTML injection vector)
    if (name === 'srcdoc') {
      toRemove.push(attr.name);
      continue;
    }

    // Sanitize URL-bearing attributes
    if (name === 'href' || name === 'src' || name === 'action' || name === 'data') {
      if (UNSAFE_URL_RE.test(attr.value.trim())) {
        el.setAttribute(attr.name, '#');
      }
    }
  }

  toRemove.forEach(name => el.removeAttribute(name));
}
