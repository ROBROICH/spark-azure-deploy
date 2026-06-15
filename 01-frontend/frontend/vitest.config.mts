import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: [resolve(rootDir, 'src/test/vitest.setup.ts')],
    testTimeout: 180000,
    hookTimeout: 180000,
    teardownTimeout: 180000,
    fileParallelism: true,
    pool: 'forks',
    maxWorkers: '90%',
    coverage: {
      reporter: ['json-summary'],
      reportsDirectory: resolve(rootDir, 'coverage'),
      thresholds: {
        global: {
          lines: 40,
          functions: 38,
          branches: 28,
          statements: 40,
        },
        perFile: false,
      },
      include: [
        'src/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.stories.{js,ts,jsx,tsx}',
        'src/**/*.test.{js,ts,jsx,tsx}',
        'src/components/ui/**/*.{ts,tsx}',
        'src/scripts/**/*.{ts,js}',
        'src/test/**/*.{ts,tsx}',
        'src/app/**/*.{ts,tsx}',
        '**/index.ts',
        '**/generated/**',
        'src/generated/**',
      ],
    },
  },
});
