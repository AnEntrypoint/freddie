
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild';
import alias from './alias-plugin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')

// Standalone dev tool (not part of the published npm build -- see
// vite.browser.config.js / `npm run build:browser` for the actual shipped
// browser bundle). Historically wrote its output straight into a sibling
// thebird checkout; now configurable so it never hardcodes a foreign
// developer's local path.
const outfile = process.env.FREDDIE_BROWSER_SHIM_OUT
  || path.join(REPO_ROOT, 'dist', 'freddie-runtime.js')

await esbuild.build({
  entryPoints: [path.join(REPO_ROOT, 'src', 'agent', '__browser_shims', 'entry.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  conditions: ['browser','module','import'],
  outfile,
  plugins: [alias],
  legalComments: 'none',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
  external: [],
});
console.log('bundle ok ->', outfile);
