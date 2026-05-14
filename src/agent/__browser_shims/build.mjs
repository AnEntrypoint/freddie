
import * as esbuild from 'esbuild';
import alias from './alias-plugin.mjs';
await esbuild.build({
  entryPoints: ['C:/dev/freddie/src/agent/__browser_shims/entry.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  conditions: ['browser','module','import'],
  outfile: 'C:/dev/thebird/docs/freddie-runtime.js',
  plugins: [alias],
  legalComments: 'none',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
  external: [],
});
console.log('bundle ok');
