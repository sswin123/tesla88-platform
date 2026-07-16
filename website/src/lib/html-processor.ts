import { isBrowser } from '@/lib/is-browser';

export const SANITIZER_VERSION = 2;

const MAX_HTML_BYTES = 100 * 1024;
const MAX_CSS_BYTES  =  50 * 1024;
const CACHE_MAX      = 200;

// ── Tag blocklists ────────────────────────────────────────────────────────────

const REMOVE_TAGS = [
  'script', 'iframe', 'object', 'embed', 'link', 'meta', 'base',
  'frame', 'frameset', 'noscript', 'form', 'handler',
];

// SVG-specific dangerous elements (checked with tagName.toLowerCase())
const SVG_UNSAFE_LOWER = new Set([
  'script', 'foreignobject', 'handler',
  'animate', 'animatemotion', 'animatetransform', 'set', 'discard',
]);

// ── HTML element allowlist ────────────────────────────────────────────────────

const ALLOWED_ELEMENTS = new Set([
  'div', 'span', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav',
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'code', 'kbd', 'samp', 'var',
  'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark',
  'small', 'sub', 'sup', 'abbr', 'cite', 'q', 'time', 'address',
  'hr', 'br', 'wbr',
  'a', 'button',
  'img', 'video', 'audio', 'picture', 'source', 'track',
  'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'svg',
  'details', 'summary',
  'canvas', 'ruby', 'rt', 'rp',
]);

// URL-bearing attributes whose values must pass the URL allowlist
const URL_ATTRS = new Set(['href', 'src', 'action', 'data', 'poster']);

// ── URL allowlist ─────────────────────────────────────────────────────────────

function isSafeUrl(raw: string): boolean {
  const u = raw.trim();
  if (!u || u === '#') return true;
  if (/^(https?:|mailto:|tel:)/i.test(u)) return true;
  if (/^\.{0,2}\//.test(u)) return true;   // relative paths
  return false;
}

// ── Inline style sanitizer ────────────────────────────────────────────────────

function sanitizeStyle(style: string): string {
  return style
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/\burl\s*\(\s*["']?\s*(?:javascript|vbscript|data\s*:)[^)]*\)/gi, 'none')
    .replace(/\bbehavior\s*:[^;]*/gi, '');
}

// ── Module-level FIFO cache ───────────────────────────────────────────────────

const _cache = new Map<string, ProcessedHtml>();

export interface ProcessedHtml {
  body: string;
  css: string;
}

export function processHtml(rawHtml: string): ProcessedHtml {
  const key = `v${SANITIZER_VERSION}:${rawHtml}`;
  const hit = _cache.get(key);
  if (hit) return hit;

  const result = _process(rawHtml);

  if (_cache.size >= CACHE_MAX) _cache.delete(_cache.keys().next().value!);
  _cache.set(key, result);
  return result;
}

// ── Core sanitizer ────────────────────────────────────────────────────────────

function _process(rawHtml: string): ProcessedHtml {
  // Guard: DOMParser is browser-only; if called on the server return raw html safely
  if (!isBrowser) {
    return { body: '', css: '' };
  }

  // HTML size guard
  if (new TextEncoder().encode(rawHtml).length > MAX_HTML_BYTES) {
    return {
      body: '<p style="color:#c00;font-size:13px;padding:8px">HTML 内容超过 100 KB 限制，已拒绝渲染。</p>',
      css: '',
    };
  }

  const parser = new DOMParser();
  const doc    = parser.parseFromString(rawHtml, 'text/html');

  // 1. Extract <style> content → will be scoped externally by css-scoper
  const cssChunks: string[] = [];
  doc.querySelectorAll('style').forEach(el => {
    const text = el.textContent ?? '';
    if (text.trim()) cssChunks.push(text);
    el.remove();
  });

  const rawCss      = cssChunks.join('\n');
  const cssTooLarge = new TextEncoder().encode(rawCss).length > MAX_CSS_BYTES;
  const finalCss    = cssTooLarge ? '' : rawCss;

  // 2. Remove explicitly dangerous HTML tags (entire subtrees)
  REMOVE_TAGS.forEach(tag => doc.querySelectorAll(tag).forEach(el => el.remove()));

  // 3. SVG safety pass — remove dangerous SVG-specific elements
  doc.body.querySelectorAll('svg *').forEach(el => {
    if (SVG_UNSAFE_LOWER.has(el.tagName.toLowerCase())) el.remove();
  });

  // 4. Restrict SVG <use> to local fragment references only (#id)
  //    External <use href="https://...#symbol"> can load remote SVGs
  doc.body.querySelectorAll('use').forEach(use => {
    const href = use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? '';
    if (href && !href.startsWith('#')) use.remove();
  });

  // 5. Enforce HTML element allowlist (SVG children pass through, except foreignObject)
  doc.body.querySelectorAll('*').forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (el.closest('svg') && tag !== 'foreignobject') return;
    if (!ALLOWED_ELEMENTS.has(tag)) el.remove();
  });

  // 6. Sanitize attributes on all surviving elements
  doc.body.querySelectorAll('*').forEach(el => sanitizeElement(el));

  // 7. Auto-enhance: images
  doc.body.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('loading'))        img.setAttribute('loading',        'lazy');
    if (!img.hasAttribute('decoding'))       img.setAttribute('decoding',       'async');
    if (!img.hasAttribute('referrerpolicy')) img.setAttribute('referrerpolicy', 'no-referrer');
  });

  // 8. Auto-enhance: video + audio — bandwidth-safe default
  doc.body.querySelectorAll('video, audio').forEach(el => {
    if (!el.hasAttribute('preload')) el.setAttribute('preload', 'metadata');
  });

  // 9. Auto-enhance: outbound links
  doc.body.querySelectorAll('a[target="_blank"]').forEach(a => {
    const parts = (a.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean);
    if (!parts.includes('noopener'))   parts.push('noopener');
    if (!parts.includes('noreferrer')) parts.push('noreferrer');
    a.setAttribute('rel', parts.join(' '));
    if (!a.hasAttribute('referrerpolicy')) a.setAttribute('referrerpolicy', 'strict-origin');
  });

  const notice = cssTooLarge
    ? '<p style="color:#c00;font-size:13px;padding:8px">CSS 内容超过 50 KB 限制，样式已被移除。</p>'
    : '';

  return { body: doc.body.innerHTML + notice, css: finalCss };
}

// ── Attribute sanitizer ───────────────────────────────────────────────────────

function sanitizeSrcset(raw: string): string {
  // srcset format: "url1 1x, url2 2x" or "url1 100w, url2 200w"
  return raw.split(',').map(part => {
    const [url, ...desc] = part.trim().split(/\s+/);
    return isSafeUrl(url ?? '') ? [url, ...desc].join(' ') : ['', ...desc].join(' ');
  }).join(', ');
}

function sanitizeElement(el: Element): void {
  const toRemove: string[] = [];

  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();

    if (name.startsWith('on')) { toRemove.push(attr.name); continue; }
    if (name === 'srcdoc')     { toRemove.push(attr.name); continue; }

    if (URL_ATTRS.has(name)) {
      if (!isSafeUrl(attr.value)) el.setAttribute(attr.name, '#');
    }

    // srcset has comma-separated "url descriptor" entries, handle separately
    if (name === 'srcset') {
      el.setAttribute('srcset', sanitizeSrcset(attr.value));
    }

    if (name === 'style') {
      const cleaned = sanitizeStyle(attr.value);
      if (cleaned !== attr.value) el.setAttribute('style', cleaned);
    }
  }

  toRemove.forEach(name => el.removeAttribute(name));
}
