import { defineConfig } from 'vitest/config';

// Unit tests only: pure functions, no database and no HTTP. The suffix is
// `.test.ts` because Playwright owns `.spec.ts`.
export default defineConfig({
  test: {
    include: ['{apps,packages,services}/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
});
