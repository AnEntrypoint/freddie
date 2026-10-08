#!/usr/bin/env node

import path from 'node:path';
import { root, verifyPlatformBinaries } from './repo.mjs';

const packageDir = process.argv[2] ? path.resolve(root, process.argv[2]) : process.cwd();

try {
  const { name, count } = verifyPlatformBinaries(packageDir);
  console.log(`verify-launcher-binary: ${name} — ${count} binaries present with the right ELF architecture.`);
} catch (error) {
  console.error(`verify-launcher-binary: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
