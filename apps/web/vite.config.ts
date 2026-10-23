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
  build: {
    rolldownOptions: {
      output: {
        // Pages are split by React.lazy in App.tsx. Libraries that rarely change get their own
        // files, so returning visitors keep them cached when only our code changes.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)[\\/]/, priority: 30 },
            { name: 'ui', test: /node_modules[\\/](@radix-ui|@floating-ui|lucide-react|class-variance-authority|clsx|tailwind-merge|aria-hidden|react-remove-scroll[\w-]*|use-callback-ref|use-sidecar|tslib|get-nonce|detect-node-es)[\\/]/, priority: 20 },
            { name: 'core', test: /packages[\\/]core[\\/]|node_modules[\\/](zod|@noble)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
});
