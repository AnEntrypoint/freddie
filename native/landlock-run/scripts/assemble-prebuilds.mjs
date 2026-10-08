#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { platformDirs, root, verifyPlatformBinaries } from './repo.mjs';

const artifactRoot = path.resolve(process.argv[2] || '.release/prebuild-artifacts');

if (!fs.existsSync(artifactRoot)) {
  throw new Error(`prebuild artifact directory does not exist: ${artifactRoot}`);
}

const platforms = platformDirs().map((dir) => path.basename(dir));

for (const name of platforms) {
  const binDir = path.join(root, 'packages', name, 'bin');
  fs.rmSync(binDir, { recursive: true, force: true });
  fs.mkdirSync(binDir, { recursive: true });
}

for (const artifactName of fs.readdirSync(artifactRoot)) {
  const artifactDir = path.join(artifactRoot, artifactName);
  if (!fs.statSync(artifactDir).isDirectory()) continue;

  const name = platforms.find((candidate) => artifactName === `prebuild-${candidate}`);
  if (!name) {
    throw new Error(`cannot map artifact to a platform package: ${artifactName}`);
  }

  for (const file of fs.readdirSync(artifactDir)) {
    const source = path.join(artifactDir, file);
    const destination = path.join(root, 'packages', name, 'bin', file);
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, 0o755);
    console.log(`Copied ${path.relative(root, source)} -> ${path.relative(root, destination)}`);
  }
}

for (const dir of platformDirs()) {
  const { name, count } = verifyPlatformBinaries(path.join(root, dir));
  console.log(`Verified ${name}: ${count} binaries`);
}
