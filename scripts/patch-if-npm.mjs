#!/usr/bin/env node
// pnpm already applies `patches/*@<version>.patch` through
// pnpm-workspace.yaml's `patchedDependencies` before any lifecycle script
// runs. Running patch-package on top there would try to re-apply an
// already-patched file and fail. npm and yarn have no such mechanism, so
// this postinstall hook runs patch-package (over the same diffs, copied as
// `<name>+<version>.patch` for its own naming convention) only when the
// active package manager is not pnpm.
import { execSync } from 'node:child_process'

const userAgent = process.env.npm_config_user_agent ?? ''
if (userAgent.startsWith('pnpm/')) process.exit(0)

execSync('npx patch-package', { stdio: 'inherit', shell: true })
