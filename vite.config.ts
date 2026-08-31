// `vitest/config` rather than `vite` so the `test` block is typed; it re-exports
// Vite's own defineConfig with the test options merged in.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built game works from a subpath (GitHub Pages, a
  // Capacitor bundle) without a rebuild.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
