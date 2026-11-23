import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { builtinModules } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SRC = join(ROOT, 'packages/util/runtime/src')
const table = JSON.parse(readFileSync(join(SRC, 'aliases.json'), 'utf8'))
const NOT_SEAMS = new Set(['runtime', 'node', 'txiki', 'index', 'install-node', 'install-txiki', 'install-browser'])
const SEAM_ENTRIES = new Set(['install-node', 'install-txiki', 'install-browser'])
const SHIPPED = /^(apps\/[^/]+|packages\/[^/]+\/[^/]+|framework\/[^/]+)\/src\//
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"]+)\1/g
const failures = []
const fail = (message) => failures.push(message)
const nodeNameOfSeam = (seam) => (seam === 'util-types' ? 'util/types' : seam.replace(/-promises$/, '/promises').replaceAll('-', '_'))
const keyOf = (specifier) => (specifier.startsWith('node:') ? specifier : builtinModules.includes(specifier) ? 'node:' + specifier : undefined)

const seams = new Map()
for (const [key, row] of Object.entries(table)) {
  if (!builtinModules.includes(key.slice(5))) fail(key + ' is not a Node module name')
  if (row.scope === 'shipped' && row.to === null) fail(key + ' is shipped and maps to nothing')
  if (row.to !== null && row.to !== 'fx:host' && row.to !== 'txiki') fail(key + ' maps to ' + row.to)
  if (row.seam === undefined) continue
  if ('node:' + nodeNameOfSeam(row.seam) !== key) fail(key + ' has seam ' + row.seam + ', which would need a new name')
  seams.set(row.seam, key)
}
const shims = readdirSync(SRC).filter((name) => name.endsWith('.js')).map((name) => name.slice(0, -3)).filter((name) => !NOT_SEAMS.has(name))
for (const shim of shims) if (!seams.has(shim)) fail('shim src/' + shim + '.js has no alias row')
for (const seam of seams.keys()) if (!shims.includes(seam)) fail('alias seam ' + seam + ' has no shim')
const nodeImports = new Set([...readFileSync(join(SRC, 'node.js'), 'utf8').matchAll(/from '(node:[\w/]+)'/g)].map((match) => match[1]))
for (const [seam, key] of seams) if (!nodeImports.has(key)) fail('src/node.js does not import ' + key + ' for seam ' + seam)
for (const key of nodeImports) if (table[key]?.seam === undefined) fail('src/node.js imports ' + key + ' with no alias row')

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.js', '*.mjs', '*.cjs'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((file) => file !== '' && !file.startsWith('packages/util/runtime/') && !file.includes('/vendor/') && !file.startsWith('runs/'))
for (const file of files) {
  const shipped = SHIPPED.test(file)
  for (const match of readFileSync(join(ROOT, file), 'utf8').matchAll(SPECIFIER)) {
    const specifier = match[2]
    const seam = specifier.match(/^@freddie\/freddie-runtime\/(.+)$/)?.[1]
    if (seam !== undefined) {
      if (!seams.has(seam) && !SEAM_ENTRIES.has(seam)) fail(file + ' imports runtime subpath ' + seam + ' with no alias row')
      continue
    }
    const key = keyOf(specifier)
    if (key === undefined) continue
    if (table[key] === undefined) fail(file + ' imports ' + specifier + ', which has no alias row')
    else if (shipped && table[key].scope !== 'shipped') fail(file + ' is shipped code and imports tooling-only ' + specifier)
    else if (shipped) fail(file + ' imports ' + specifier + '; import @freddie/freddie-runtime/' + table[key].seam + ' instead')
  }
}
if (failures.length > 0) {
  console.error('aliases: ' + failures.length + ' failure(s)\n' + failures.join('\n'))
  process.exit(1)
}
console.log('aliases: ' + Object.keys(table).length + ' rows, ' + seams.size + ' seams, ' + files.length + ' files scanned, no node: import in shipped code, no import needs a new name')
