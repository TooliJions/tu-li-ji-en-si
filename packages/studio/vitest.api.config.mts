import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/api/**/*.test.ts'],
    environment: 'node',
    globals: true,
    passWithNoTests: true,
  },
});