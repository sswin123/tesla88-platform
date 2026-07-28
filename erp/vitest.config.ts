import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    // DES-CBC (used by 918KISS and MEGAH5 adapters) is legacy in OpenSSL 3 (Node 17+)
    env: { NODE_OPTIONS: '--openssl-legacy-provider' },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
