import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const repoName = 'kothay-gelo';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  base: isGitHubPages ? `/${repoName}/` : '/',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
}));
