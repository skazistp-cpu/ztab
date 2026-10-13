import { fileURLToPath } from 'node:url';

// The street's lab: a page around the module in ../web/src/street3d, built and served on its own. (A plain object:
// this folder has no node_modules of its own; it runs apps/web's Vite, see package.json.)
const here = fileURLToPath(new URL('.', import.meta.url));
export default {
  root: here,
  base: './',
  // One copy of three for the module and the examples it uses (apps/web's), in dev and in the build.
  resolve: { alias: { three: fileURLToPath(new URL('../web/node_modules/three', import.meta.url)) } },
  optimizeDeps: { include: ['three', 'three/examples/jsm/postprocessing/SMAAPass.js', 'three/examples/jsm/geometries/RoundedBoxGeometry.js'] },
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, target: 'es2022', assetsInlineLimit: 0 },
};
