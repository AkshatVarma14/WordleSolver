import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@wordle-solver/solver': path.resolve(__dirname, 'packages/solver/src/index.ts'),
    },
  },
});
