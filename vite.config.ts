import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any path (GitHub Pages, Capacitor, file hosting).
  base: './',
  build: { target: 'es2020' },
});
