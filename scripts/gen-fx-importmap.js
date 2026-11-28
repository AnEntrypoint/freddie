import { readFileSync, writeFileSync, existsSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(ROOT, 'fx.importmap.json')
const write = process.argv.includes('--write')
const { fx, packages } = JSON.parse(readFileSync(join(ROOT, 'plugins.manifest.json'), 'utf8'))

const byName = new Map()
for (const [dir, entry] of Object.entries(packages)) {
  byName.set(JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')).name, { dir, entry })
}

const packageNameOf = spec => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])

function workspaceTarget(name, subpath) {
  const pkg = byName.get(name)
  if (pkg === undefined) return undefined
  const key = `.${subpath}`
  const declared = pkg.entry.entries[key]
  if (declared !== undefined) return `${pkg.dir}/${declared}`
  const wildcard = Object.entries(pkg.entry.raw ?? {}).find(([pattern]) => pattern.endsWith('/*') && key.startsWith(pattern.slice(0, -1)))
  if (wildcard !== undefined) {
    const target = typeof wildcard[1] === 'string' ? wildcard[1] : wildcard[1].default
    return `${pkg.dir}/${target.replace('*', key.slice(wildcard[0].length - 1)).slice(2)}`
  }
  if (pkg.entry.srcWildcard === true && key.startsWith('./src/')) return `${pkg.dir}/${key.slice(2)}`
  return undefined
}

function withExtension(path) {
  if (existsSync(path) && statSync(path).isDirectory()) return join(path, 'index.js')
  return !existsSync(path) && existsSync(`${path}.js`) ? `${path}.js` : path
}

function externalTarget(spec, fromDir) {
  const name = packageNameOf(spec)
  const subpath = spec.slice(name.length)
  for (let dir = realpathSync(fromDir); ; dir = dirname(dir)) {
    const parent = dirname(dir)
    const sibling = parent.endsWith('node_modules') && existsSync(join(parent, name)) ? join(parent, name) : undefined
    const candidate = sibling ?? join(dir, 'node_modules', name)
    if (existsSync(candidate)) {
      const pkg = JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8'))
      const exported = pkg.exports ?? {}
      let target = exported[`.${subpath}`]
      if (target === undefined && subpath === '') target = pkg.main ?? pkg.module ?? './index.js'
      if (target === undefined) {
        const pattern = Object.keys(exported).find(key => key.endsWith('/*') && `.${subpath}`.startsWith(key.slice(0, -1)))
        if (pattern !== undefined) {
          const value = exported[pattern]
          const resolved = typeof value === 'object' ? (value.import ?? value.default) : value
          target = resolved.replace('*', `.${subpath}`.slice(pattern.length - 1))
        }
      }
      if (target === undefined && subpath !== '') target = `./${subpath.slice(1)}.js`
      if (typeof target === 'object') target = target.import ?? target.default ?? target.require
      if (typeof target !== 'string') return undefined
      const path = withExtension(resolve(realpathSync(candidate), target))
      return existsSync(path) ? path : undefined
    }
    if (parent === dir) return undefined
  }
}

const IMPORT = /(?:from\s*|import\s*\(\s*|import\s+|export\s+\*\s+from\s*|export\s*\{[^}]*\}\s*from\s*)['"]([^'"]+)['"]/g
const seen = new Set()
const bare = new Set()
const externals = new Map()

function visit(file) {
  const absolute = resolve(ROOT, file)
  if (seen.has(absolute) || !existsSync(absolute) || !/\.[cm]?js$/.test(absolute)) return
  seen.add(absolute)
  for (const [, spec] of readFileSync(absolute, 'utf8').matchAll(IMPORT)) {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      visit(relative(ROOT, withExtension(resolve(dirname(absolute), spec))))
      continue
    }
    if (spec === 'fx:host' || spec.startsWith('node:') || !/^@?[\w.-]+(\/[\w.-]+)*$/.test(spec)) continue
    bare.add(spec)
    const target = fx.overrides[spec] ?? workspaceTarget(packageNameOf(spec), spec.slice(packageNameOf(spec).length))
    if (target !== undefined) {
      visit(target)
      continue
    }
    const external = externalTarget(spec, dirname(absolute))
    if (external === undefined) continue
    externals.set(spec, relative(ROOT, external))
    visit(relative(ROOT, external))
  }
}

for (const seed of fx.tests) visit(seed)
for (const dir of fx.bundles ?? []) {
  const { dependencies = {} } = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'))
  const own = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')).name
  for (const name of [own, ...Object.keys(dependencies)]) {
    const pkg = byName.get(name)
    if (pkg === undefined) continue
    for (const [subpath, file] of Object.entries(pkg.entry.entries)) {
      bare.add(`${name}${subpath.slice(1)}`)
      visit(`${pkg.dir}/${file}`)
    }
  }
}

const imports = { ...fx.overrides }
for (const [spec, path] of externals) if (!(spec in imports)) imports[spec] = path
for (const spec of [...bare].sort()) {
  if (spec in imports) continue
  const target = workspaceTarget(packageNameOf(spec), spec.slice(packageNameOf(spec).length))
  if (target !== undefined) imports[spec] = target
}

const text = `${JSON.stringify({ imports }, null, 2)}\n`
const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : ''
if (write) writeFileSync(OUTPUT, text)
console.log(`fx.importmap.json: ${Object.keys(imports).length} entries from ${seen.size} files, ${current === text ? 'unchanged' : write ? 'rewritten' : 'drifted'}`)
if (!write && current !== text) process.exit(1)
