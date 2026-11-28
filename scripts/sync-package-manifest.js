import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, 'plugins.manifest.json')
const write = process.argv.includes('--write')

function exportsOf(entry) {
  const exports = {}
  for (const [subpath, file] of Object.entries(entry.entries)) exports[subpath] = { default: `./${file}` }
  Object.assign(exports, entry.raw)
  if (entry.srcWildcard === true) exports['./src/*'] = './src/*'
  exports['./package.json'] = './package.json'
  return exports
}

function mainOf(entry) {
  if (entry.main !== undefined) return entry.main ?? undefined
  return entry.entries['.']
}

const { packages } = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const drift = []
for (const [dir, entry] of Object.entries(packages)) {
  const path = join(ROOT, dir, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  const wanted = { exports: exportsOf(entry), main: mainOf(entry), files: entry.files }
  const stale = Object.keys(wanted).filter(key => JSON.stringify(pkg[key]) !== JSON.stringify(wanted[key]))
  if (stale.length === 0) continue
  drift.push(`${dir}: ${stale.join(', ')}`)
  if (!write) continue
  for (const key of stale) {
    if (wanted[key] === undefined) delete pkg[key]
    else pkg[key] = wanted[key]
  }
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n')
}

const tracked = execFileSync('git', ['ls-files', 'packages/*/package.json', 'packages/*/*/package.json', 'framework/*/package.json'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
const unmanaged = tracked.map(file => dirname(file)).filter(dir => {
  const pkg = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'))
  return pkg.name?.startsWith('@freddie/') && pkg.exports !== undefined && Array.isArray(pkg.files) && packages[dir] === undefined
})

for (const line of drift) console.log(`${write ? 'wrote' : 'drift'} ${line}`)
for (const dir of unmanaged) console.log(`unmanaged ${dir}`)
console.log(`plugins.manifest.json: ${Object.keys(packages).length} packages, ${drift.length} ${write ? 'rewritten' : 'drifted'}, ${unmanaged.length} unmanaged`)
if (!write && (drift.length > 0 || unmanaged.length > 0)) process.exit(1)
