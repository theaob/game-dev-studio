import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any path (GitHub Pages, Capacitor, file hosting).
  base: './',
  build: {
    target: 'es2020',
    // three.js (the 3D office) is a ~570 kB chunk, loaded lazily after the game starts.
    chunkSizeWarningLimit: 700,
  },
});
