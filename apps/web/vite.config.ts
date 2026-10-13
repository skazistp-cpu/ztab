import { defineConfig } from 'vite';

// A static site: everything is bundled, nothing is loaded from another origin.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
});
