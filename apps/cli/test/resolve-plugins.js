import '@freddie/freddie-runtime-node/install-node'
import { readFileSync, readdirSync } from '@freddie/freddie-runtime/fs'
import { join } from '@freddie/freddie-runtime/path'
import { fileURLToPath } from '@freddie/freddie-runtime/url'
import { resolveFrom } from '@freddie/cordis-plugin-loader'

const bundles = new URL('../../../packages/bundle/', import.meta.url)
const outcome = (resolve) => {
  try {
    return resolve()
  } catch {
    return 'unresolved'
  }
}

let same = 0
let unresolved = 0
for (const bundle of readdirSync(fileURLToPath(bundles))) {
  const dir = new URL(`${bundle}/`, bundles)
  let text
  try { text = readFileSync(join(fileURLToPath(dir), 'cordis.patch.yml'), 'utf8') } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue; throw error }
  const base = new URL('cordis.patch.yml', dir).href
  for (const [, name] of text.matchAll(/name: '(@[^']+)'/g)) {
    const expected = outcome(() => import.meta.resolve(name, base))
    const actual = outcome(() => resolveFrom(base, name))
    if (expected !== actual) throw new Error(`${bundle}: ${name}: node resolves ${expected}, resolveFrom gives ${actual}`)
    if (expected === 'unresolved') unresolved++
    else same++
  }
}
console.log(`resolve-plugins: ${same} bundle plugin rows resolve identically under Node and resolveFrom, ${unresolved} resolve under neither`)
