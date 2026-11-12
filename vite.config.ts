import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from phones on the same Wi-Fi
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8791', changeOrigin: false } },
  },
});
