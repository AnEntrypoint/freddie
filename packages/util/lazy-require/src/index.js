import { createRequire } from 'node:module'

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
