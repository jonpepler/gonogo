import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@gonogo/core': path.resolve(import.meta.dirname, '../core/src/index.ts'),
      '@gonogo/components': path.resolve(import.meta.dirname, '../components/src/index.ts'),
    },
  },
  test: {
    name: 'app',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});
