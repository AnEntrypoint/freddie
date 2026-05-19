import { defineConfig } from 'vite'

// Browser bundle for freddie. Consumed by thebird (web OS) which provides
// node:* shims and vendored copies of xstate / anentrypoint-design.
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
        return false
      },
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
