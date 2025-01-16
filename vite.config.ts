import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vite.dev/config/
export default defineConfig({
  base: '/', // CSP에서 이미 허용된 경로로 변경
  build: {
    target: 'esnext', // 최신 ES 표준을 대상으로 빌드
    minify: 'esbuild', // esbuild를 사용해 eval을 피함
    sourcemap: false, // 소스 맵에서 eval 사용 방지
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
