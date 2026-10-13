import { fileURLToPath } from 'node:url';

// The wallet band's lab: a page around the module in ../web/src/landing-band, built and served on its own. (A plain
// object: this folder has no node_modules of its own; it runs apps/web's Vite, see package.json.)
const here = fileURLToPath(new URL('.', import.meta.url));
export default {
  root: here,
  base: './',
  // The module reaches the app's own code and the engine: both are under the repository's root.
  server: { fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, target: 'es2022', assetsInlineLimit: 0 },
};
