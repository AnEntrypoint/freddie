/** Caller-relative lazy loading for CommonJS-compatible Host dependencies. */

import { createRequire } from 'node:module'

/**
 * Create a successful-result cache around Node's caller-relative `require`.
 * A failed load is not cached, so a corrected installation can be retried.
 * @template T
 * @param {string} specifier - Literal dependency specifier declared by the caller package.
 * @param {string | URL} parentURL - Caller's `import.meta.url`, which owns package resolution.
 * @returns {() => T} a zero-argument loader that resolves the dependency on first use.
 */
export function createLazyRequire(specifier, parentURL) {
  const require = createRequire(parentURL)
  let loaded = false
  let value
  return () => {
    if (!loaded) {
      value = require(specifier)
      loaded = true
    }
    return value
  }
}
