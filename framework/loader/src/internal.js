import { createRequire } from 'node:module'

/** @see https://github.com/nodejs/node/blob/main/src/module_wrap.h */
export const ModulePhase = {
  Source: 1,
  Evaluation: 2,
}

let _cachedLoader

function requireInternal(id) {
  const require = createRequire(import.meta.url)
  if (process.execArgv.includes('--expose-internals')) {
    try {
      return require(id)
    } catch {}
  }
  try {
    return require('node-addon-require-builtin').requireBuiltin(id)
  } catch {}
}

function fromInternal() {
  if (_cachedLoader) return _cachedLoader
  const [major] = process.versions.node.split('.').map(Number)

  if (major >= 24) {
    const raw = requireInternal('internal/modules/esm/loader')?.getOrInitializeCascadedLoader()
    if (raw) return _cachedLoader = Object.assign(raw, { version: 'v2' })
  } else if (major >= 22) {
    const raw = requireInternal('internal/modules/esm/loader')?.getOrInitializeCascadedLoader()
    if (raw) return _cachedLoader = Object.assign(raw, { version: 'v1' })
  }
}

/** Helpers for locating the current Node internal module loader. */
export const ModuleLoader = {
  fromInternal,
}
