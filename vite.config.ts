// `vitest/config` rather than `vite` so the `test` block is typed; it re-exports
// Vite's own defineConfig with the test options merged in.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built game works from a subpath (GitHub Pages, a
  // Capacitor bundle) without a rebuild.
  base: './',
  define: {
    // Set by `npm run build:standalone`, which inlines everything into one
    // HTML file. Such a build has no sibling files, so the features that go
    // looking for them are compiled out rather than left to 404.
    __STANDALONE__: JSON.stringify(process.env.COLOR_BLEND_STANDALONE === '1'),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
