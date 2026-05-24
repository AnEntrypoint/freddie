#!/usr/bin/env node
// Link anentrypoint-design from a local working tree into freddie's node_modules,
// so design edits propagate live without an npm publish round-trip.
//
// Default local path: C:/dev/anentrypoint-design (override with --path /custom
// or ANENTRYPOINT_DESIGN_LOCAL env var).
//
// Workflow:
//   1. Edit CSS/JS in C:/dev/anentrypoint-design
//   2. Run `npm run build` there to refresh dist/247420.{css,js}
//   3. Restart freddie — its express static handler serves the new files
//
// To revert: `npm unlink anentrypoint-design && npm install` in this repo.

import { existsSync, readFileSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const PKG = 'anentrypoint-design';

const argv = process.argv.slice(2);
const pathIdx = argv.indexOf('--path');
const localPath = resolve(
  (pathIdx !== -1 && argv[pathIdx + 1] ? argv[pathIdx + 1] : process.env.ANENTRYPOINT_DESIGN_LOCAL)
    || 'C:/dev/anentrypoint-design'
);

if (!existsSync(localPath)) {
  console.error(`! ${localPath} does not exist`);
  process.exit(1);
}
const localPkg = join(localPath, 'package.json');
if (!existsSync(localPkg)) {
  console.error(`! ${localPath} has no package.json`);
  process.exit(1);
}
const meta = JSON.parse(readFileSync(localPkg, 'utf8'));
if (meta.name !== PKG) {
  console.error(`! ${localPath} is not ${PKG} (found ${meta.name})`);
  process.exit(1);
}

console.log(`linking ${PKG}@${meta.version} from ${localPath}`);

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  if (r.status !== 0) {
    console.error(`! ${cmd} ${args.join(' ')} exited ${r.status}`);
    process.exit(r.status || 1);
  }
}

const linkTarget = join(ROOT, 'node_modules', PKG);
const alreadyLinked = existsSync(linkTarget) && lstatSync(linkTarget).isSymbolicLink();
if (!alreadyLinked) {
  sh('npm', ['link'], { cwd: localPath });
}
sh('npm', ['link', PKG], { cwd: ROOT });

console.log(`✓ freddie's node_modules/${PKG} -> ${localPath}`);
console.log('  Run `npm run build` in the design repo after edits, then restart freddie.');
