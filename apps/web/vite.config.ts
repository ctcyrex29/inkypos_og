import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const core = fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Shared contracts and API client, without npm workspaces (symlinks are blocked on the build machine).
      '@inkypos/core': core,
    },
  },
  server: { fs: { allow: ['..', '../../packages'] } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
});
