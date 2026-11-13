import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // works at https://<user>.github.io/<repo>/
  server: { host: true, port: 5173 },
});
