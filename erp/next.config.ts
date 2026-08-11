import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Dev: React Refresh / webpack HMR requires eval(); strip in production
      isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "font-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      // MEGAH5: MEGA calls /api/megah5/callback/api/<action> (base-URL + MEGA's fixed /api/<action> suffix).
      // Rewrite to the canonical handler path so route.ts receives the correct [action] segment.
      {
        source: '/api/megah5/callback/api/:action',
        destination: '/api/games/megah5/callback/:action',
      },
    ];
  },
  // Allow up to 50MB file uploads from browser (default Next.js limit is 10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
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

export default nextConfig;
