/**
  * Read-only JS resolver for gm-config's four-tier protocol.
  * Clone/fetch and `hooks/*.js` execution stay with the gm daemon.
  * @module @freddie/freddie-gm-config
  */

export {
  SCHEMA_VERSION,
  MIN_READABLE_SCHEMA_VERSION,
  PROJECT_CONFIG_REL,
  SOURCE_SPEC_REL,
  SOURCE_CACHE_REL,
  DEFAULT_REPO_URL,
  DEFAULT_REPO_PINNED_SHA,
  DEFAULT_REPO_CACHE_REL,
  TIER,
  builtinDefault,
  deepMerge,
  parseConfig,
  parseSourceSpec,
  parseSourceEntry,
  sourceConfigPath,
  unknownTopLevelKeys,
} from './parse.js'
export { fnv1a64Hex } from './hash.js'
export {
  validateProseKey,
  validateSourcePath,
  validateRepoUrl,
  validateGitRef,
  pathContainedWithin,
  joinRel,
} from './path.js'
export { resolve, resolve as resolveConfig } from './resolve.js'
export { resolveProse } from './prose.js'
export { resolveGraph, resolveHookPath } from './graph.js'
