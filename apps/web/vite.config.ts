import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  resolve: {
    alias: {
      '@wordle-solver/solver': path.resolve(__dirname, '../../packages/solver/src/index.ts'),
    },
  },
  worker: {
    format: 'es',
  },
});
