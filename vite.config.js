import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` → dist/ for Vercel (code + public/ assets).
// `npm run build:single` → dist-single/index.html, one self-contained file for the Claude artifact:
// no external models, scanned maps or sky (the procedural fallbacks are used), fonts still come from Google Fonts.
export default defineConfig(({ mode }) => mode === 'single'
  ? { plugins: [viteSingleFile()], publicDir: false, define: { 'import.meta.env.VITE_NO_ASSETS': '"1"' }, build: { outDir: 'dist-single', chunkSizeWarningLimit: 4000 } }
  : { build: { chunkSizeWarningLimit: 1200 } });
