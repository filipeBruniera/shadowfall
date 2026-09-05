import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/vitest.*.test.mjs'],
    exclude: ['tests/browser.mjs', 'tests/multipeer.mjs', 'tests/mobile-helpers.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['tests/', 'js/main.js', 'js/render.js', 'js/ui.js', 'js/rng.js', 'js/world.js'],
      // Thresholds disabled for demo - will enable when full migration happens
    },
    globals: true,
    testTimeout: 30000,
    hookTimeout: 10000,
  },
});
