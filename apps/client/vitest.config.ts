import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright owns e2e/**; keep vitest from collecting those specs
    // (they import @playwright/test and cannot run under vitest).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
