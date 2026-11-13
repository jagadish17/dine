import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Each build gets an id. The app compares it with dist/version.json (never cached) so browsers
// holding an old cached copy of the site reload themselves onto the latest version.
const BUILD_ID = Date.now().toString(36);
const versionFile = (): Plugin => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
});

export default defineConfig({
  plugins: [react(), versionFile()],
  base: './', // works at https://<user>.github.io/<repo>/
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { host: true, port: 5173 },
});
