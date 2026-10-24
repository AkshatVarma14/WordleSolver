import { defineConfig, build, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Dedicated plugin to build the content script as a self-contained IIFE bundle.
 * Manifest V3 content scripts cannot use ES module imports/exports.
 */
function buildContentScriptPlugin(): Plugin {
  return {
    name: 'build-content-script-iife',
    async closeBundle() {
      await build({
        configFile: false,
        publicDir: false,
        resolve: {
          alias: {
            '@wordle-solver/solver': path.resolve(__dirname, '../../packages/solver/src/index.ts'),
          },
        },
        build: {
          emptyOutDir: false,
          outDir: path.resolve(__dirname, 'dist'),
          lib: {
            entry: path.resolve(__dirname, 'src/content/index.ts'),
            name: 'WordleContentScript',
            formats: ['iife'],
            fileName: () => 'content/content.js',
          },
        },
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), buildContentScriptPlugin()],
  publicDir: 'public',
  resolve: {
    alias: {
      '@wordle-solver/solver': path.resolve(__dirname, '../../packages/solver/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'popup/index.html'),
        'service-worker': path.resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'service-worker') {
            return 'background/service-worker.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
