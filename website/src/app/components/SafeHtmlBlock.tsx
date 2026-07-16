'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { processHtml, SANITIZER_VERSION } from '@/lib/html-processor';
import { scopeCss }                        from '@/lib/css-scoper';

interface Props {
  html: string;
  className?: string;
  style?: React.CSSProperties;
}

type Mode = 'pending' | 'shadow' | 'namespace' | 'error';

export default function SafeHtmlBlock({ html, className, style }: Props) {
  const rawId    = useId();
  const widgetId = `website-widget-${rawId.replace(/[^a-z0-9]/gi, '')}`;

  const hostRef            = useRef<HTMLDivElement>(null);
  const [mode, setMode]    = useState<Mode>('pending');
  const [nsHtml, setNsHtml] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    try {
      const { body, css } = processHtml(html);

      // Shadow DOM — CSS is naturally isolated; no scoping needed
      if ('attachShadow' in host) {
        try {
          const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
          shadow.innerHTML = (css ? `<style>${css}</style>` : '') + body;
          setMode('shadow');
          return;
        } catch { /* attachShadow not permitted here — fall through */ }
      }

      // Namespace fallback — prefix all CSS selectors with #widgetId
      const scoped = css ? scopeCss(css, widgetId) : '';
      setNsHtml((scoped ? `<style>${scoped}</style>` : '') + body);
      setMode('namespace');
    } catch {
      setMode('error');
    }
  }, [html, widgetId]);

  const sharedProps = {
    className,
    style,
    'data-widget':    widgetId,
    'data-sanitizer': SANITIZER_VERSION,
  };

  if (mode === 'error') {
    return (
      <div {...sharedProps}>
        <p style={{ color: '#999', fontSize: 13, padding: 8, margin: 0 }}>此内容无法显示。</p>
      </div>
    );
  }

  if (mode === 'shadow') {
    return <div ref={hostRef} {...sharedProps} />;
  }

  return (
    <div
      ref={hostRef}
      id={widgetId}
      {...sharedProps}
      dangerouslySetInnerHTML={mode === 'namespace' ? { __html: nsHtml } : undefined}
    />
  );
}
