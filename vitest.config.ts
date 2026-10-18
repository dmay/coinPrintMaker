import { defineConfig } from 'vitest/config';

// Separate from the app-root Vite config; production tests start without a DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
