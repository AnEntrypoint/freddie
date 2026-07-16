import { defineConfig } from 'vite'

// Browser bundle for freddie. Consumed by thebird (web OS) which provides
// node:* shims and vendored copies of xstate / anentrypoint-design.
//
// This is the ONLY active browser-build path. `npm run build:browser` runs
// this config, emits dist/browser/freddie.js(.map), which
// .github/workflows/browser-bundle.yml publishes to gh-pages AND which
// thebird's scripts/refresh-freddie.mjs vendors into docs/vendor/freddie/
// (the artifact freddie-loader.js actually imports). There used to be a
// second, older esbuild-based path (src/agent/__browser_shims/build.mjs +
// alias-plugin.mjs, hardcoded to C:/dev/freddie -> C:/dev/thebird/docs/
// freddie-runtime.js) — it was dead (unreferenced by package.json/CI, wrote
// to a path thebird never reads) and was removed. If you need a second
// build variant in the future, document why here rather than letting one
// silently rot again.
export default defineConfig({
  build: {
    target: 'esnext',
    minify: false,
    sourcemap: true,
    emptyOutDir: true,
    outDir: 'dist/browser',
    lib: {
      entry: 'src/browser/index.js',
      formats: ['es'],
      fileName: () => 'freddie.js',
    },
    rollupOptions: {
      // Host environment supplies these.
      external: (id) => {
        if (id.startsWith('node:')) return true
        if (id === 'xstate') return true
        if (id === 'anentrypoint-design' || id.startsWith('anentrypoint-design/')) return true
        if (id === 'acptoapi') return true
        return false
      },
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
