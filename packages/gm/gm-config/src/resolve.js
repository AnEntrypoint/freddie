/**
  * Four-tier gm.config.json resolution over files already on disk.
  * Never clones, fetches, or shells to agentplug-runner.
  * @module @freddie/freddie-gm-config/src/resolve
  */

import { homeDir, readText } from './fs.js'
import {
  DEFAULT_REPO_CACHE_REL,
  DEFAULT_REPO_URL,
  PROJECT_CONFIG_REL,
  SOURCE_CACHE_REL,
  SOURCE_SPEC_REL,
  TIER,
  builtinDefault,
  deepMerge,
  parseConfig,
  parseSourceSpec,
  sourceConfigPath,
  unknownTopLevelKeys,
} from './parse.js'
import { joinRel } from './path.js'

function loadOneRepoSource(source) {
  const cfgPath = sourceConfigPath(source)
  const text = readText(cfgPath)
  if (text === undefined) {
    return { kind: 'rejected', reason: `${cfgPath}: no cached config file (this resolver never clones; the gm daemon materializes the cache)` }
  }
  const parsed = parseConfig(text, cfgPath)
  if (parsed.kind === 'absent') {
    return { kind: 'rejected', reason: `${cfgPath}: config file is empty` }
  }
  return parsed
}

function loadRepoTier(specPath, cacheRoot, tierLabel) {
  const raw = readText(specPath)
  if (raw === undefined) return { kind: 'absent' }
  const spec = parseSourceSpec(raw, specPath, cacheRoot, tierLabel)
  if (!spec.ok) return { kind: 'rejected', reason: spec.reason }
  if (spec.sources.length === 0) return { kind: 'absent' }
  let merged
  const entryFailures = []
  let winningCacheDir
  for (const src of spec.sources) {
    const loaded = loadOneRepoSource(src)
    if (loaded.kind === 'accepted') {
      if (merged === undefined) {
        merged = { version: loaded.version, value: loaded.value }
        winningCacheDir = src.cacheDir
      } else {
        merged = {
          version: merged.version,
          value: deepMerge(loaded.value, merged.value),
        }
      }
    } else if (loaded.kind === 'rejected') {
      entryFailures.push(loaded.reason)
    }
  }
  if (merged !== undefined) {
    return { kind: 'accepted', version: merged.version, value: merged.value, cacheDir: winningCacheDir }
  }
  return {
    kind: 'rejected',
    reason: `${specPath}: every source in this tier failed to load (${spec.sources.length} entries): ${entryFailures.join('; ')}`,
  }
}

function loadImplicitDefault(projectRoot) {
  const cacheDir = joinRel(projectRoot, DEFAULT_REPO_CACHE_REL)
  const cfgPath = joinRel(cacheDir, 'gm.config.json')
  const text = readText(cfgPath)
  if (text === undefined) return { kind: 'absent' }
  const parsed = parseConfig(text, cfgPath)
  if (parsed.kind === 'accepted') return { ...parsed, cacheDir }
  return parsed
}

function resolution({ tier, why, rejected, version, config, cacheDir }) {
  return {
    tier,
    why,
    rejected,
    version,
    config,
    cacheDir,
    unknownKeys: unknownTopLevelKeys(config),
  }
}

/**
  * Resolve gm.config.json for `projectRoot` from files already on disk.
  * @param projectRoot - project directory containing `.gm/`.
  * @returns `{ tier, why, rejected, version, config, cacheDir, unknownKeys }`.
  */
export function resolve(projectRoot) {
  const rejected = []
  const p1 = joinRel(projectRoot, PROJECT_CONFIG_REL)
  const p1Text = readText(p1)
  if (p1Text !== undefined) {
    const parsed = parseConfig(p1Text, p1)
    if (parsed.kind === 'accepted') {
      return resolution({
        tier: TIER.ProjectVendored,
        why: `project-vendored config at ${p1}`,
        rejected,
        version: parsed.version,
        config: parsed.value,
        cacheDir: undefined,
      })
    }
    if (parsed.kind === 'rejected') rejected.push(parsed.reason)
  }

  const p2 = joinRel(projectRoot, SOURCE_SPEC_REL)
  const p2Load = loadRepoTier(p2, joinRel(projectRoot, SOURCE_CACHE_REL), TIER.ProjectRepoSpec)
  if (p2Load.kind === 'accepted') {
    return resolution({
      tier: TIER.ProjectRepoSpec,
      why: `in-project config-repo spec at ${p2}`,
      rejected,
      version: p2Load.version,
      config: p2Load.value,
      cacheDir: p2Load.cacheDir,
    })
  }
  if (p2Load.kind === 'rejected') rejected.push(p2Load.reason)

  const home = homeDir()
  if (home !== undefined) {
    const p3 = joinRel(home, SOURCE_SPEC_REL)
    const p3Load = loadRepoTier(p3, joinRel(home, SOURCE_CACHE_REL), TIER.UserRepoSpec)
    if (p3Load.kind === 'accepted') {
      return resolution({
        tier: TIER.UserRepoSpec,
        why: `user-wide config-repo spec at ${p3}`,
        rejected,
        version: p3Load.version,
        config: p3Load.value,
        cacheDir: p3Load.cacheDir,
      })
    }
    if (p3Load.kind === 'rejected') rejected.push(p3Load.reason)
  }

  const implicit = loadImplicitDefault(projectRoot)
  if (implicit.kind === 'accepted') {
    return resolution({
      tier: TIER.ImplicitDefaultRepo,
      why: `gm's own shared default config repo at ${DEFAULT_REPO_URL} (no project or user config.source.json configured)`,
      rejected,
      version: implicit.version,
      config: implicit.value,
      cacheDir: implicit.cacheDir,
    })
  }
  if (implicit.kind === 'rejected') rejected.push(implicit.reason)

  const builtin = builtinDefault()
  const why = rejected.length === 0
    ? 'no config found in any tier; using builtin defaults'
    : `builtin defaults; ${rejected.length} higher tier(s) were present but rejected (see \`rejected\`)`
  return resolution({
    tier: TIER.BuiltinDefault,
    why,
    rejected,
    version: builtin.version,
    config: builtin,
    cacheDir: undefined,
  })
}
