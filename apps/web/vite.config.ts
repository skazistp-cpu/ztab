import { defineConfig } from 'vite';

// A static site: everything is bundled, nothing is loaded from another origin.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist', sourcemap: false, target: 'es2022',
    // The 3D street (src/street3d, with three) is its own chunk, named for what it is; only a scroll asks for it.
    chunkSizeWarningLimit: 700,
    // (The wallet band, src/wallet-band.ts, is a chunk of its own by name: asked for when the band comes near.)
    rollupOptions: { output: { chunkFileNames: chunk => (chunk.facadeModuleId?.includes('/src/street3d/') ? 'assets/street3d-[hash].js' : 'assets/[name]-[hash].js') } },
  },
});
