import { createRequire } from 'node:module'
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { applyEntryPatches } from '@freddie/cordis-plugin-include'
import { resolveFreddieHome } from '@freddie/freddie-home-paths'
import { loadOverlayPatches } from './index.js'

export const PROFILES_DIR = 'profiles'

export const PROFILE_PATCH_FILENAME = 'cordis.patch.yml'

export function resolveProfileDir(name, home = resolveFreddieHome()) {
  if (name === '' || name.includes('/') || name.includes('\\') || name === '.' || name === '..'
    || name === 'node_modules') {
    throw new Error(`freddie: invalid profile name ${JSON.stringify(name)}`)
  }
  return join(home, PROFILES_DIR, name)
}

const DEFAULT_ON_BUNDLES = ['@freddie/freddie-agent-team-profile', '@freddie/freddie-dream-rsi']

export const PROFILE_TEMPLATES = {
  web: ['@freddie/freddie-base', '@freddie/freddie-web-app', ...DEFAULT_ON_BUNDLES],
  headless: ['@freddie/freddie-base', '@freddie/freddie-headless', ...DEFAULT_ON_BUNDLES],
  acp: ['@freddie/freddie-base', '@freddie/freddie-acp-app', ...DEFAULT_ON_BUNDLES],
  sdk: ['@freddie/freddie-base', '@freddie/freddie-sdk-app', ...DEFAULT_ON_BUNDLES],
}

const INSTALLATION_OWNED_PROFILE_TUPLES = {
  web: [['@freddie/freddie-base', '@freddie/freddie-web-app']],
  headless: [
    ['@freddie/freddie-base', '@freddie/freddie-web-app', '@freddie/freddie-headless'],
    ['@freddie/freddie-base', '@freddie/freddie-headless'],
  ],
  acp: [['@freddie/freddie-base', '@freddie/freddie-acp-app']],
  sdk: [['@freddie/freddie-base', '@freddie/freddie-sdk-app']],
}

export const DEFAULT_PROFILE_BUNDLES = ['@freddie/freddie-base']

const PROFILE_PATCH_TEMPLATE = `# Your patch layer for this freddie profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`

const PROFILE_PNPM_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

export function initProfile(dir, bundles) {
  mkdirSync(dir, { recursive: true })
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) {
    const manifest = {
      name: `freddie-profile-${basename(dir)}`,
      private: true,
      dependencies: {},
      freddie: { profile: { bundles: [...bundles] } },
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
  }
  const patchPath = join(dir, PROFILE_PATCH_FILENAME)
  if (!existsSync(patchPath)) writeFileSync(patchPath, PROFILE_PATCH_TEMPLATE)
  const workspacePath = join(dir, 'pnpm-workspace.yaml')
  if (!existsSync(workspacePath)) writeFileSync(workspacePath, PROFILE_PNPM_WORKSPACE)
}

function ensureSymlink(link, target) {
  let stat
  try {
    stat = lstatSync(link)
  } catch {
    stat = undefined
  }
  if (stat !== undefined) {
    if (!stat.isSymbolicLink()) {
      throw new Error(`freddie: ${link} exists and is not a symlink; remove it so freddie can manage the installation fallback`)
    }
    if (readlinkSync(link) === target) return
    unlinkSync(link)
  }
  try {
    symlinkSync(target, link, 'junction')
  } catch (error) {
    if (error.code !== 'EEXIST'
      || !lstatSync(link).isSymbolicLink() || readlinkSync(link) !== target) {
      throw error
    }
  }
}

export function healProfilesModuleFallback(installAnchor, home = resolveFreddieHome()) {
  const profilesDir = join(home, PROFILES_DIR)
  const modulesDir = join(profilesDir, 'node_modules')
  mkdirSync(modulesDir, { recursive: true })
  const appManifest = JSON.parse(readFileSync(installAnchor, 'utf8'))
  const links = new Map()
  if (appManifest.name !== undefined) links.set(appManifest.name, dirname(installAnchor))
  const queue = [{ anchor: installAnchor, manifest: appManifest }]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const dep of [...Object.keys(next.manifest.dependencies ?? {}), ...Object.keys(next.manifest.peerDependencies ?? {})]) {
      if (links.has(dep)) continue
      const dir = packageDirFromAnchor(next.anchor, dep)
      if (dir === undefined) continue
      links.set(dep, dir)
      const manifestPath = join(dir, 'package.json')
      queue.push({ anchor: manifestPath, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) })
    }
  }
  for (const [packageName, target] of links) {
    const link = join(modulesDir, packageName)
    mkdirSync(dirname(link), { recursive: true })
    ensureSymlink(link, target)
  }
}

export function readProfileManifest(binName, dir) {
  const path = join(dir, 'package.json')
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`${binName}: failed to read profile manifest ${path}: ${String(error)}`)
  }
  const parsed = JSON.parse(raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${binName}: profile manifest ${path} must hold a JSON object`)
  }
  return parsed
}

export function writeProfileManifest(dir, manifest) {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, undefined, 2) + '\n')
}

function sameBundles(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function normalizeShippedProfile(name, dir, manifest) {
  const installationOwned = INSTALLATION_OWNED_PROFILE_TUPLES[name]
  const current = PROFILE_TEMPLATES[name]
  const bundles = manifest.freddie?.profile?.bundles
  if (installationOwned === undefined || current === undefined || bundles === undefined
    || !installationOwned.some(tuple => sameBundles(bundles, tuple))) return manifest
  const normalized = {
    ...manifest,
    freddie: {
      ...manifest.freddie,
      profile: { ...manifest.freddie?.profile, bundles: [...current] },
    },
  }
  writeProfileManifest(dir, normalized)
  return normalized
}

function packageDirFromAnchor(anchor, packageName) {
  for (const searchPath of createRequire(anchor).resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName)
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return undefined
}

export function resolveBundleDir(
  binName, packageName, installAnchor, profileDir,
) {
  for (const anchor of [installAnchor, join(profileDir, 'package.json')]) {
    const dir = packageDirFromAnchor(anchor, packageName)
    if (dir !== undefined) return dir
  }
  throw new Error(
    `${binName}: cannot resolve profile bundle ${JSON.stringify(packageName)} from the freddie installation or ${profileDir}; `
    + `run 'freddie plugin --profile ${basename(profileDir)} install' if its dependency is not installed`,
  )
}

export function loadProfile(
  binName, name, installAnchor, home = resolveFreddieHome(),
  options = {},
) {
  const dir = resolveProfileDir(name, home)
  if (!existsSync(join(dir, 'package.json'))) {
    const template = PROFILE_TEMPLATES[name]
    if (template === undefined) {
      throw new Error(
        `${binName}: profile ${JSON.stringify(name)} does not exist; create it with 'freddie plugin --profile ${name} add <package>'`,
      )
    }
    initProfile(dir, template)
  }
  const manifest = normalizeShippedProfile(name, dir, readProfileManifest(binName, dir))
  const bundles = manifest.freddie?.profile?.bundles ?? []
  const layers = bundles.map((packageName) => {
    const packageDir = resolveBundleDir(binName, packageName, installAnchor, dir)
    const bundleManifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    const declared = bundleManifest.freddie?.bundle?.patch
    if (declared === undefined) {
      throw new Error(`${binName}: profile bundle ${JSON.stringify(packageName)} declares no freddie.bundle in its package.json`)
    }
    const patchPath = join(packageDir, declared)
    return { packageName, packageDir, patchPath, patches: loadOverlayPatches(binName, patchPath) }
  })
  const patchPath = join(dir, PROFILE_PATCH_FILENAME)
  const patches = options.userLayer !== false && existsSync(patchPath)
    ? loadOverlayPatches(binName, patchPath)
    : []
  return { name, dir, layers, patchPath, patches }
}

export function composeEntries(
  layers, warn = () => {},
) {
  return applyEntryPatches([], structuredClone(layers.flat()), (message, ...args) => {
    let index = 0
    warn(message.replace(/%C/g, () => JSON.stringify(args[index++])))
  })
}
