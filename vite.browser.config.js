import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

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
  resolve: {
    alias: {
      // dotenv is a Node-only `.env`-file reader; a browser tab has no `.env`
      // file and no real filesystem to read one from. Left un-aliased, vite
      // bundles dotenv's real CJS source, whose Node-builtin requires
      // (path/fs/os/crypto — bare specifiers, not `node:*`, so the `external`
      // function below never sees them) get replaced by vite's browser-external
      // placeholder (an empty object), and dotenv's own code then throws
      // `TypeError: path.resolve is not a function` the moment
      // src/host/index.js's loadDotenvOnce() actually calls `dotenv.config()`.
      // This alias is scoped to THIS config (the browser build only) — the
      // Node CLI/server entry points build via a separate path and are
      // untouched, so they keep using real dotenv with real .env parsing.
      dotenv: fileURLToPath(new URL('./src/browser/dotenv-browser-stub.js', import.meta.url)),
    },
  },
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
