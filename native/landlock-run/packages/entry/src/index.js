import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LAUNCHER_BIN = 'landlock-run'

export const LAUNCHER_FAILURE_EXIT = 125



export function launcherPath(
  resolvePackageJson = createRequire(import.meta.url).resolve,
) {
  const platformPackage = `@freddie/node-addon-landlock-run-${process.platform}-${process.arch}`
  try {
    return join(dirname(resolvePackageJson(`${platformPackage}/package.json`)), 'bin', LAUNCHER_BIN)
  } catch {
    return fileURLToPath(new URL(`../node_modules/${platformPackage}/bin/${LAUNCHER_BIN}`, import.meta.url))
  }
}

export function grantArgs(grants) {
  return [
    ...(grants.readOnly ?? []).flatMap(root => ['--ro', root]),
    ...(grants.readWrite ?? []).flatMap(root => ['--rw', root]),
  ]
}

export function probe(
  launcher = launcherPath(),
  options = {},
) {
  const result = spawnSync(launcher, ['--probe'], {
    timeout: options.timeoutMs ?? 2000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0) return 'unusable'
  return /partially enforced/.test(result.stdout) ? 'partial' : 'full'
}
