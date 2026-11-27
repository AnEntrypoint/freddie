import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '..', 'test', 'fixtures')
const fxRoot = process.argv[2]
if (!fxRoot) throw new Error('usage: snapshot-fx.mjs <fx checkout root>')

const rowsOf = (text) => text.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| ---'))
const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim())

const ifaceText = readFileSync(join(fxRoot, 'docs', 'host-interface.md'), 'utf8')
const start = ifaceText.indexOf('| host.tools name')
const end = ifaceText.indexOf('| run_code |', start)
if (start < 0 || end < 0) throw new Error('host.tools table not found in docs/host-interface.md')
const tools = []
for (const row of rowsOf(ifaceText.slice(start, end))) {
  const [first] = cells(row)
  if (first === 'host.tools name') continue
  for (const name of first.split(', ')) tools.push(name)
}

mkdirSync(fixtures, { recursive: true })
writeFileSync(join(fixtures, 'fx-tool-names.json'), JSON.stringify(tools, null, 2) + '\n')
console.log('snapshot: ' + tools.length + ' tool names (host verbs come from the live binary; see test/fixtures/fx-host-verbs.json)')
