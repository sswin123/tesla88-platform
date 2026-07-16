import type { NextConfig } from 'next';

// ERP_ORIGIN: the domain of the ERP admin panel that is allowed to embed
// this website in an iframe for the Website Builder Preview feature.
// Example: https://erp.apidemo.club  (or http://localhost:3001 for dev)
// If unset, frame-ancestors falls back to 'self' only (no external embedding).
const erpOrigin = process.env.ERP_ORIGIN?.trim() ?? '';
const frameAncestors = erpOrigin ? `'self' ${erpOrigin}` : "'self'";

const SECURITY_HEADERS = [
  // X-Frame-Options is superseded by CSP frame-ancestors in modern browsers.
  // We omit it to avoid conflicting signals; frame-ancestors is the authoritative rule.
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
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
      `frame-ancestors ${frameAncestors}`,
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
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default config;
