import fs from 'node:fs'

const text = fs.readFileSync(process.argv[2], 'utf8')
const found = {}
const conflicts = []
const record = (key, value) => {
  const normal = JSON.stringify(value)
  if (!(key in found)) found[key] = value
  else if (JSON.stringify(found[key]) !== normal) conflicts.push(key)
}

for (const line of text.split('\n')) {
  const node = line.match(/node: (\d+)\/(\d+) shared cases match; (\d+)\/(\d+) gaps/)
  if (node) {
    record('shared', node[1] + '/' + node[2])
    record('gaps', node[3] + '/' + node[4])
  }
  for (const match of line.matchAll(/\\*"(shared|gaps|mismatches|unexpectedGaps)\\*":\s*(\d+|\[[^\]]*\])/g)) {
    const raw = match[2].replace(/\\/g, '')
    record(match[1], /^\d+$/.test(raw) ? Number(raw) : JSON.parse(raw))
  }
}

const summary = {}
for (const key of ['shared', 'gaps', 'mismatches', 'unexpectedGaps']) {
  if (key in found) summary[key] = found[key]
}
console.log(JSON.stringify({ summary, conflicts: [...new Set(conflicts)] }))
