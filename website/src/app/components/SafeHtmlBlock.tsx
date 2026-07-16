'use client';

/**
 * SafeHtmlBlock — renders admin-entered HTML in complete CSS isolation.
 *
 * Strategy (in priority order):
 *
 * 1. Shadow DOM  (preferred)
 *    - Attaches a shadow root to the host element.
 *    - CSS inside the shadow is naturally isolated from the page.
 *    - No selector scoping needed.
 *
 * 2. Namespace fallback  (when Shadow DOM unavailable)
 *    - Wraps content in `<div id="website-widget-{id}">`.
 *    - All CSS selectors are auto-prefixed: `.hero` → `#website-widget-{id} .hero`.
 *    - body / html / :root selectors are stripped entirely.
 *
 * Both paths run the HTML sanitizer (removes script, iframe, on* attrs, etc.)
 * before rendering.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { processHtml }  from '@/lib/html-processor';
import { scopeCss }     from '@/lib/css-scoper';

interface Props {
  html: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function SafeHtmlBlock({ html, className, style }: Props) {
  // useId() is SSR-safe and produces consistent server/client IDs
  const rawId   = useId();
  const widgetId = `website-widget-${rawId.replace(/[^a-z0-9]/gi, '')}`;

  const hostRef = useRef<HTMLDivElement>(null);

  // 'pending'   → initial render, no content yet
  // 'shadow'    → Shadow DOM injected imperatively
  // 'namespace' → namespaced innerHTML via React state
  const [mode, setMode] = useState<'pending' | 'shadow' | 'namespace'>('pending');
  const [nsHtml, setNsHtml] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Parse + sanitize on client (DOMParser available here)
    const { body, css } = processHtml(html);

    // ── Try Shadow DOM ────────────────────────────────────────────────────────
    if ('attachShadow' in host) {
      try {
        // Reuse existing shadow root (e.g., when html prop changes)
        const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
        // In Shadow DOM, CSS is naturally isolated — no scoping required
        shadow.innerHTML = (css ? `<style>${css}</style>` : '') + body;
        setMode('shadow');
        return;
      } catch {
        // attachShadow not permitted on this element (e.g., inside another shadow)
        // Fall through to namespace mode
      }
    }

    // ── Namespace fallback ────────────────────────────────────────────────────
    const scoped = css ? scopeCss(css, widgetId) : '';
    setNsHtml((scoped ? `<style>${scoped}</style>` : '') + body);
    setMode('namespace');
  }, [html, widgetId]);

  // Shadow mode: React renders an empty div; content is in the shadow root.
  // React never touches shadow DOM internals — no reconciliation conflict.
  if (mode === 'shadow') {
    return (
      <div
        ref={hostRef}
        className={className}
        style={style}
        data-widget={widgetId}
      />
    );
  }

  // Namespace mode (or pending): render scoped HTML via dangerouslySetInnerHTML.
  // id is used by the scoped CSS selectors (#website-widget-xxx .hero).
  return (
    <div
      ref={hostRef}
      id={widgetId}
      className={className}
      style={style}
      data-widget={widgetId}
      dangerouslySetInnerHTML={mode === 'namespace' ? { __html: nsHtml } : undefined}
    />
  );
}
