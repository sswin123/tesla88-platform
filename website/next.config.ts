import type { NextConfig } from 'next';

// ERP_ORIGIN: the domain of the ERP admin panel allowed to embed the /preview route.
// Only /preview relaxes framing. All other pages keep X-Frame-Options: DENY.
// Example: https://erp.apidemo.club  (or http://localhost:3001 for dev)
const erpOrigin = process.env.ERP_ORIGIN?.trim() ?? 'https://erp.apidemo.club';

// ── All pages: deny iframe embedding entirely ──────────────────────────────────
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options',        value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self' wss:",
      "font-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

// ── /preview only: override CSP to allow ERP iframe ───────────────────────────
// Per MDN spec, when frame-ancestors is present in CSP, X-Frame-Options is
// ignored by the browser — so X-Frame-Options: DENY from the base rule above
// is overridden for this route by the CSP frame-ancestors here, without needing
// to remove it.  All other pages remain unaffected.
const PREVIEW_CSP_OVERRIDE = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self' wss:",
      "font-src 'self'",
      `frame-ancestors 'self' ${erpOrigin}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const config: NextConfig = {
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,
  },
  async headers() {
    return [
      {
        // Rule 1: strict headers applied to EVERY page (including /preview)
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
      {
        // Rule 2: /preview only — override the CSP so ERP can embed this route.
        // Next.js applies rules in order; for duplicate header keys the last match
        // wins, so this CSP replaces the one set by Rule 1 for /preview.
        source: '/preview',
        headers: PREVIEW_CSP_OVERRIDE,
      },
    ];
  },
};

export default config;
