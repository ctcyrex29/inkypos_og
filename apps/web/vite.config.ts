import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const core = fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url));

/**
 * Content-Security-Policy for the built app: scripts only from our own files and
 * API calls only to the InkyPOS API, so injected content could neither run nor
 * send a stolen session anywhere. Styles allow inline (the UI kit positions menus
 * with style attributes). Clickjacking protection (frame-ancestors) cannot be set
 * in a meta tag: the web host sends it as a header (docs/SECURITY.md).
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'inkypos-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const apiUrl = process.env.VITE_API_URL;
      // Without VITE_API_URL the app calls port 8000 of whatever host served it (lib/api.ts).
      const api = apiUrl ? new URL(apiUrl).origin : 'http://*:8000 https://*:8000';
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src 'self' ${api}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
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
