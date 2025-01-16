import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vite.dev/config/
export default defineConfig({
  base: '/', // CSP에서 이미 허용된 경로로 변경
  build: {
    minify: 'esbuild',
    sourcemap: false, // eval 제거
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },

  server: {
    proxy: {
      '/blob': {
        target: 'http://211.181.88.70',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/blob/, '/'),
      },
    },
  },
  plugins: [react()],
});
