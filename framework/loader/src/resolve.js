import { existsSync, readFileSync, realpathSync } from '@freddie/freddie-runtime/fs'
import { dirname, join } from '@freddie/freddie-runtime/path'
import { fileURLToPath, pathToFileURL } from '@freddie/freddie-runtime/url'

const CONDITIONS = ['import', 'default', 'node']

function packageNameOf(specifier) {
  return specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
}

function pick(target) {
  if (typeof target === 'string') return target
  if (Array.isArray(target)) return target.map(pick).find(found => found !== undefined)
  if (target === null || typeof target !== 'object') return undefined
  for (const condition of CONDITIONS) {
    if (condition in target) {
      const found = pick(target[condition])
      if (found !== undefined) return found
    }
  }
  return undefined
}

function targetOf(manifest, subpath) {
  const key = `.${subpath}`
  const exported = manifest.exports
  if (exported === undefined) return subpath === '' ? (manifest.main ?? 'index.js') : subpath.slice(1)
  const table = typeof exported === 'string' || Array.isArray(exported) || !Object.keys(exported).some(name => name.startsWith('.'))
    ? { '.': exported }
    : exported
  if (key in table) return pick(table[key])
  const pattern = Object.keys(table)
    .filter(name => name.includes('*') && key.startsWith(name.slice(0, name.indexOf('*'))) && key.endsWith(name.slice(name.indexOf('*') + 1)))
    .sort((a, b) => b.length - a.length)[0]
  if (pattern === undefined) return undefined
  const star = pattern.indexOf('*')
  const matched = key.slice(star, key.length - (pattern.length - star - 1))
  return pick(table[pattern])?.replace('*', matched)
}

export function resolveFrom(baseUrl, specifier) {
  const name = packageNameOf(specifier)
  const subpath = specifier.slice(name.length)
  for (let dir = dirname(fileURLToPath(baseUrl)); ; dir = dirname(dir)) {
    const own = join(dir, 'package.json')
    const root = existsSync(own) && JSON.parse(readFileSync(own, 'utf8')).name === name ? dir : join(dir, 'node_modules', name)
    if (existsSync(join(root, 'package.json'))) {
      const target = targetOf(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')), subpath)
      if (target === undefined) throw new Error(`package "${name}" does not export "${subpath === '' ? '.' : `.${subpath}`}"`)
      return pathToFileURL(realpathSync(join(root, target))).href
    }
    if (dirname(dir) === dir) throw new Error(`cannot find package "${specifier}" from ${baseUrl}`)
  }
}
