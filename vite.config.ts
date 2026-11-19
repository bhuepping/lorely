import { defineConfig } from 'vitest/config';
import { execSync } from 'node:child_process';
import pkg from './package.json';

// Version fürs Debug-Log: Paketversion + Datum des Quellstands (SOURCE_DATE_EPOCH, sonst Commit-Datum), nie die Build-Zeit:
// gleicher Quellstand = gleiche Ausgabe.
function sourceDate(): string {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch) return new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
  try {
    return execSync('git log -1 --format=%cd --date=format-local:%Y-%m-%d', { env: { ...process.env, TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}
const date = sourceDate();
const ver = date ? `${pkg.version} (Stand ${date})` : pkg.version;

// Feste Dateinamen ohne Hash: derselbe dist/ passt in piGallery (Cache-Busting per ?v=…) und später in Capacitor.
export default defineConfig({
  base: './',
  define: { __VER__: JSON.stringify(ver) },
  // Zeitlimit großzügig: parallele Läufe (Browser-Smoke, Build) bremsen die Bot-Fahrten; ein hängender Test fällt trotzdem auf
  test: { testTimeout: 120000, include: ['tests/**/*.test.ts', 'tools/**/*.test.ts'] },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        entryFileNames: 'rennspiel.js',
        chunkFileNames: 'rennspiel-[name].js',
        assetFileNames: (a) => (a.names?.[0]?.endsWith('.css') ? 'rennspiel.css' : '[name][extname]'),
        codeSplitting: false,
      },
    },
  },
});
