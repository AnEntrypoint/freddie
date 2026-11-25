import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '..', 'test', 'fixtures')
const fxRoot = process.argv[2]
if (!fxRoot) throw new Error('usage: snapshot-fx.mjs <fx checkout root>')

const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim())
const rowsOf = (text) => text.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| ---'))

function parseInput(cell) {
  if (cell === 'none') return { properties: {}, required: [] }
  const properties = {}
  const required = []
  for (const part of cell.split(/,\s*(?![^()]*\))/)) {
    const match = /^([\w$]+):\s*([\w ]+?)\s*(\(required\))?$/.exec(part.trim())
    if (match === null) throw new Error('unparsed verb input: ' + part)
    properties[match[1]] = { type: match[2].trim() }
    if (match[3]) required.push(match[1])
  }
  return { properties, required }
}

const verbText = readFileSync(join(fxRoot, 'docs', 'verb-table.md'), 'utf8')
const verbs = rowsOf(verbText)
  .map(cells)
  .filter((row) => row.length === 3 && row[0] !== 'verb' && !row[0].startsWith('registry'))
  .map(([name, description, input]) => ({ name, description, input: parseInput(input) }))

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
writeFileSync(join(fixtures, 'fx-host-verbs.json'), JSON.stringify(verbs, null, 2) + '\n')
writeFileSync(join(fixtures, 'fx-tool-names.json'), JSON.stringify(tools, null, 2) + '\n')
console.log('snapshot: ' + verbs.length + ' host verbs, ' + tools.length + ' tool names')
