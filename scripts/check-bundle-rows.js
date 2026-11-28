import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const write = process.argv.includes('--write')
const yaml = createRequire(join(ROOT, 'framework/include/package.json'))('js-yaml')
const isJsExpr = value => value !== null && typeof value === 'object' && '__jsExpr' in value
const JsExpr = yaml.defineScalarTag('tag:yaml.org,2002:js', {
  resolve: data => (typeof data === 'string' ? { __jsExpr: data } : yaml.NOT_RESOLVED),
  identify: isJsExpr,
  represent: data => data.__jsExpr,
})
const schema = new yaml.Schema([...yaml.JSON_SCHEMA.tags, JsExpr])
const { packages } = JSON.parse(readFileSync(join(ROOT, 'plugins.manifest.json'), 'utf8'))

const entriesByName = new Map()
for (const [dir, entry] of Object.entries(packages)) {
  entriesByName.set(JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')).name, entry)
}

const packageNameOf = spec => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/')

function rowNames(node, found = new Set()) {
  if (Array.isArray(node)) node.forEach(child => rowNames(child, found))
  else if (node !== null && typeof node === 'object' && !isJsExpr(node)) {
    if (typeof node.name === 'string' && node.name.startsWith('@')) found.add(node.name)
    Object.values(node).forEach(child => rowNames(child, found))
  }
  return found
}

const problems = []
const bundlesDir = join(ROOT, 'packages/bundle')
for (const bundle of readdirSync(bundlesDir)) {
  const patch = join(bundlesDir, bundle, 'cordis.patch.yml')
  if (!existsSync(patch)) continue
  const packagePath = join(bundlesDir, bundle, 'package.json')
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  const declared = new Set(Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }))
  const missing = []
  for (const spec of [...rowNames(yaml.load(readFileSync(patch, 'utf8'), { schema }))].sort()) {
    const name = packageNameOf(spec)
    const subpath = spec.slice(name.length)
    if (name === pkg.name) continue
    const entry = entriesByName.get(name)
    if (entry !== undefined && entry.entries[`.${subpath}`] === undefined && !(subpath === '' && entry.entries['.'])) {
      problems.push(`${bundle}: row ${spec} names a subpath that plugins.manifest.json does not export`)
    }
    if (!declared.has(name)) missing.push(name)
  }
  for (const name of new Set(missing)) problems.push(`${bundle}: row package ${name} is not in dependencies`)
  if (write && missing.length > 0) {
    pkg.dependencies = Object.fromEntries(Object.entries({ ...pkg.dependencies, ...Object.fromEntries(missing.map(name => [name, '*'])) }).sort(([a], [b]) => a.localeCompare(b)))
    writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')
  }
}
for (const problem of problems) console.log(problem)
console.log(`bundle rows: ${problems.length} problem(s)`)
if (!write && problems.length > 0) process.exit(1)
