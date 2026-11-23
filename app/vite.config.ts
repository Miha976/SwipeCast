import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : indispensable pour Electron (file://) et Capacitor.
export default defineConfig({
  base: './',
  plugins: [react()],
  css: {
    // SCSS est compilé par Sass, puis PostCSS (postcss.config.js) applique Tailwind + autoprefixer.
    preprocessorOptions: { scss: { api: 'modern-compiler' } },
  },
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', target: 'es2020', sourcemap: false },
});
