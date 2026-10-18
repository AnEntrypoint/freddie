#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { root } from './repo.mjs';

const TRANSIENT_PUBLISH_CODES = ['E409', 'E429', 'E500', 'E502', 'E503', 'E504', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'];

const PUBLISH_ATTEMPTS = 4;

const PUBLISH_SPACING_MS = 2_000;

const destination = path.resolve(process.argv.slice(2).find((arg) => !arg.startsWith('--')) || path.join(root, 'dist', 'npm'));

function isTransientFailure(output) {
  return TRANSIENT_PUBLISH_CODES.some((code) => output.includes(`code ${code}`));
}

function integrityOf(tarball) {
  return `sha512-${crypto.createHash('sha512').update(fs.readFileSync(tarball)).digest('base64')}`;
}

function packedIdentity(tarball) {
  const result = spawnSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`cannot read the manifest inside ${tarball}:\n${result.stderr}`);
  const manifest = JSON.parse(result.stdout);
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
    throw new Error(`${tarball} manifest lacks name/version`);
  }
  return { name: manifest.name, version: manifest.version };
}

function registryState(name, version) {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'dist.integrity', '--json'], { encoding: 'utf8' });
  if (result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`;
    if (output.includes('E404') || output.includes('404 Not Found')) return { kind: 'absent' };
    throw new Error(`npm view ${name}@${version} failed:\n${output}`);
  }
  const parsed = JSON.parse(result.stdout);
  if (typeof parsed !== 'string' || parsed === '') {
    throw new Error(`registry reported no dist.integrity for ${name}@${version}`);
  }
  return { kind: 'present', integrity: parsed };
}

async function publishTarball(tarball, name, version) {
  const tagArgs = version.includes('-') ? ['--tag', 'next'] : [];
  for (let tries = 1; tries <= PUBLISH_ATTEMPTS; tries += 1) {
    const result = spawnSync('npm', ['publish', tarball, ...tagArgs], { encoding: 'utf8' });
    const output = `${result.stdout}${result.stderr}`;
    if (result.status === 0) return;

    const settled = registryState(name, version);
    if (settled.kind === 'present' && settled.integrity === integrityOf(tarball)) {
      console.log(`landlock publish: ${name}@${version} landed despite a reported failure, continuing`);
      return;
    }
    if (tries === PUBLISH_ATTEMPTS || !isTransientFailure(output)) {
      throw new Error(`npm publish ${name}@${version} failed:\n${output}`);
    }
    const backoff = PUBLISH_SPACING_MS * 2 ** (tries - 1);
    console.log(
      `landlock publish: ${name}@${version} hit a transient registry failure`
      + ` (attempt ${tries} of ${PUBLISH_ATTEMPTS}), retrying in ${backoff}ms`,
    );
    await sleep(backoff);
  }
}

const order = fs
  .readFileSync(path.join(destination, 'publish-order.txt'), 'utf8')
  .split('\n')
  .filter((line) => line !== '');

let published = 0;
let skipped = 0;
for (const filename of order) {
  const tarball = path.join(destination, filename);
  const { name, version } = packedIdentity(tarball);
  const state = registryState(name, version);
  if (state.kind === 'present') {
    const local = integrityOf(tarball);
    if (state.integrity !== local) {
      throw new Error(
        `${name}@${version} is already published with different content`
        + `\n  registry: ${state.integrity}\n  packed:   ${local}`
        + '\nBump the version, or investigate why the build is not reproducible.',
      );
    }
    console.log(`landlock publish: ${name}@${version} already published, skipping`);
    skipped += 1;
    continue;
  }
  if (published > 0) await sleep(PUBLISH_SPACING_MS);
  await publishTarball(tarball, name, version);
  console.log(`landlock publish: ${name}@${version} published`);
  published += 1;
}

console.log(`landlock publish: ${published} published, ${skipped} already present`);
