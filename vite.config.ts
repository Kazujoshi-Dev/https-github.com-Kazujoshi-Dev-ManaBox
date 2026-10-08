import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/**
 * Identyfikator wersji: wbudowany w kod klienta (__BUILD_ID__) i zapisany w dist/version.json,
 * skąd odczytuje go serwer. Po każdym `docker compose up -d --build` jest inny, dzięki czemu
 * otwarte karty przeglądarki wiedzą, że czeka nowa wersja (src/utils/appVersion.ts).
 */
function appVersion(buildId: string): Plugin {
  return {
    name: 'app-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: buildId, builtAt: new Date().toISOString() }),
      });
    },
  };
}

export default defineConfig(({command}) => {
  const buildId = command === 'build' ? Date.now().toString(36) : 'dev';
  return {
    plugins: [react(), tailwindcss(), appVersion(buildId)],
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
