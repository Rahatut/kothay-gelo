import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const repoName = 'kothay-gelo';
const apiBaseUrl = process.env.VITE_API_BASE_URL ?? (isGitHubPages ? 'https://kothay-gelo-api.onrender.com' : '');

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  base: isGitHubPages ? `/${repoName}/` : '/',
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
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}));