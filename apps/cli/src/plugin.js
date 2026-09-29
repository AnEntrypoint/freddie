import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DEFAULT_PROFILE_BUNDLES,
  initProfile,
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveBundleDir,
  resolveProfileDir,
  writeProfileManifest,
} from '@freddie/freddie-app-boot'
import { INSTALL_ANCHOR } from './profile-boot.js'

const NAME = 'freddie'

function exportsPatch(packageName, profileDir) {
  let dir
  try {
    dir = resolveBundleDir(NAME, packageName, INSTALL_ANCHOR, profileDir)
  } catch {
    return false
  }
  const manifest = readProfileManifest(NAME, dir)
  return manifest.freddie?.bundle?.patch !== undefined
}

function reconcilePlugins(before, profileDir) {
  const after = readProfileManifest(NAME, profileDir)
  const beforeDeps = new Set(Object.keys(before.dependencies ?? {}))
  const dependencies = Object.keys(after.dependencies ?? {})
  const plugins = after.freddie?.profile?.bundles ?? []
  let changed = false
  for (const packageName of dependencies) {
    const isBundle = exportsPatch(packageName, profileDir)
    if (isBundle && !plugins.includes(packageName)) {
      plugins.push(packageName)
      changed = true
    } else if (!isBundle && !beforeDeps.has(packageName)) {
      process.stderr.write(
        `${NAME}: warning: ${packageName} declares no freddie.bundle — installed as a plain dependency, not a profile layer `
        + '(a later update that gains one activates it automatically)\n',
      )
    }
  }
  const dependencySet = new Set(dependencies)
  for (const packageName of [...plugins]) {
    const wasDependency = beforeDeps.has(packageName) || dependencySet.has(packageName)
    const stillBundle = dependencySet.has(packageName) && exportsPatch(packageName, profileDir)
    if (wasDependency && !stillBundle) {
      plugins.splice(plugins.indexOf(packageName), 1)
      changed = true
    }
  }
  if (!changed) return
  after.freddie = { ...after.freddie, profile: { ...after.freddie?.profile, bundles: plugins } }
  writeProfileManifest(profileDir, after)
}

function anchorPathSpec(argument, cwd) {
  const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument)
  if (match?.groups?.path === undefined) return argument
  const prefix = match.groups.prefix ?? ''
  return `${prefix}${resolve(cwd, match.groups.path)}`
}

export function runPlugin(profile, args) {
  const dir = resolveProfileDir(profile)
  if (!existsSync(join(dir, 'package.json'))) {
    initProfile(dir, PROFILE_TEMPLATES[profile] ?? DEFAULT_PROFILE_BUNDLES)
    process.stderr.write(`${NAME}: initialized profile ${profile} at ${dir}\n`)
  }
  const before = readProfileManifest(NAME, dir)
  const result = spawnSync('pnpm', args.map(argument => anchorPathSpec(argument, process.cwd())), {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error !== undefined) {
    const code = result.error.code
    if (code === 'ENOENT') {
      process.stderr.write(`${NAME}: pnpm not found on PATH — install pnpm to manage profile plugins\n`)
      return 127
    }
    throw result.error
  }
  const exitCode = result.status ?? 1
  if (exitCode === 0) {
    reconcilePlugins(before, dir)
  } else {
    process.stderr.write(`${NAME}: pnpm failed in profile directory ${dir}\n`)
    if (args.some(argument => /^git\+|^github:|\.git(?:#|$)/.test(argument))) {
      process.stderr.write(
        `${NAME}: git-hosted plugins build on install via their prepare script, which pnpm blocks until allowed — `
        + `add the exact key pnpm printed above under allowBuilds in ${join(dir, 'pnpm-workspace.yaml')}, then re-run\n`,
      )
    }
  }
  return exitCode
}
