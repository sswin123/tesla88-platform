/**
 * isBrowser — evaluated once at module load time.
 * Server (Node.js): false  |  Browser: true
 *
 * Usage:
 *   import { isBrowser } from '@/lib/is-browser';
 *   if (!isBrowser) return;
 *   // safe to use window, document, localStorage, etc.
 */
export const isBrowser = typeof window !== 'undefined';
