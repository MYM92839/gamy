import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vite.dev/config/
export default defineConfig({
  base: '/', // CSP에서 이미 허용된 경로로 변경
  plugins: [react()],
  resolve: {
    alias: {
      threex: '/ar-threex.mjs',  // 실제 경로에 맞게 수정
    },
  },
  build: {
    rollupOptions: {
      external: ['threex'],
    },
  },
});
