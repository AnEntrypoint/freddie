#!/usr/bin/env node

import path from 'node:path';
import { platformDirs, readJson, root } from './repo.mjs';

const RUNNERS = {
  'linux-x64': 'ubuntu-24.04',
  'linux-arm64': 'ubuntu-24.04-arm',
};

function runnerFor(platform) {
  const runner = RUNNERS[platform];
  if (!runner) {
    throw new Error(`missing GitHub runner for platform: ${platform}`);
  }
  return runner;
}

function platformManifests() {
  return platformDirs().map((dir) => ({
    dir,
    name: path.basename(dir),
    prebuilds: readJson(path.join(root, dir, 'prebuilds.json')),
  }));
}

function ciMatrix() {
  const platforms = [...new Set(platformManifests().map(({ prebuilds }) => prebuilds.platform))].sort();
  return {
    include: platforms.map((platform) => ({ platform, runner: runnerFor(platform) })),
  };
}

function releasePrebuildMatrix() {
  return {
    include: platformManifests().map(({ dir, name, prebuilds }) => ({
      platform: prebuilds.platform,
      package: name,
      dir,
      runner: runnerFor(prebuilds.platform),
      artifact: `prebuild-${name}`,
    })),
  };
}

const target = process.argv[2];
const matrices = {
  ci: ciMatrix,
  'release-prebuild': releasePrebuildMatrix,
};

if (!target || !matrices[target]) {
  console.error(`Usage: node scripts/github-matrix.mjs <${Object.keys(matrices).join('|')}>`);
  process.exit(1);
}

process.stdout.write(JSON.stringify(matrices[target]()));
