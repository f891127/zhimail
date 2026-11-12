import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    target: 'chrome122',
    chunkSizeWarningLimit: 2048,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
