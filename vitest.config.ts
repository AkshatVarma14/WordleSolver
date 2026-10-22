import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'tests/**/*.test.{ts,tsx}',
      'packages/**/*.test.{ts,tsx}',
      'apps/**/*.test.{ts,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@wordle-solver/solver': path.resolve(__dirname, 'packages/solver/src/index.ts'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
});
