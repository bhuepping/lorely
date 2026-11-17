import { defineConfig } from 'vitest/config';
import pkg from './package.json';

// Version fürs Debug-Log: Paketversion + Build-Datum
const ver = `${pkg.version} (Build ${new Date().toISOString().slice(0, 10)})`;

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
