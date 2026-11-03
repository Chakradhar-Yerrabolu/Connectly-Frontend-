import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['app/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
  },
});
