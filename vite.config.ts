// Must precede the reads below: without it `vite build` never sees `.env`, so
// build-time configuration would work in dev and silently fall back to defaults
// in the artifact that actually ships.
import 'dotenv/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

/**
 * Empty or unset means same-origin, which is the correct answer for both
 * targets: local dev runs through the /v1 proxy below, and a single-origin
 * deploy (Render) serves dist/ and /v1 from the same Express process. No
 * deploy host is baked into the source.
 */
const apiBaseUrl = process.env.VITE_API_BASE_URL ?? '';

/** Base path of the built client. Project Pages sites need `/kothay-gelo/`. */
function readBase(): string {
  const raw = process.env.APP_BASE_PATH?.trim().replace(/^\/+|\/+$/g, '');
  return raw ? `/${raw}/` : '/';
}

/** Origin the dev proxy forwards /v1 to. Defaults to the Express dev server. */
const devApiTarget = process.env.DEV_API_TARGET || 'http://localhost:3000';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  base: readBase(),
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl),
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
    proxy: {
      '/v1': {
        target: devApiTarget,
        changeOrigin: true,
      },
    },
  },
}));
