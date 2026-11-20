import fs from 'node:fs'

const text = fs.readFileSync(process.argv[2], 'utf8')
const found = {}
const conflicts = []
const record = (key, value) => {
  if (!(key in found)) found[key] = value
  else if (JSON.stringify(found[key]) !== JSON.stringify(value)) conflicts.push(key)
}

const balancedArray = (line, start) => {
  let depth = 0
  let quoted = false
  for (let index = start; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') quoted = !quoted
    else if (!quoted && char === '[') depth += 1
    else if (!quoted && char === ']') {
      depth -= 1
      if (depth === 0) return line.slice(start, index + 1)
    }
  }
  return null
}

for (const raw of text.split('\n')) {
  const node = raw.match(/node: (\d+)\/(\d+) shared cases match; (\d+)\/(\d+) gaps/)
  if (node) {
    record('shared', node[1] + '/' + node[2])
    record('gaps', node[3] + '/' + node[4])
  }
  const line = raw.replace(/\\/g, '')
  for (const match of line.matchAll(/"(shared|gaps|mismatches|unexpectedGaps)":\s*/g)) {
    const start = match.index + match[0].length
    const value = line[start] === '[' ? balancedArray(line, start) : line.slice(start).match(/^\d+/)?.[0]
    if (value !== null && value !== undefined) record(match[1], JSON.parse(value))
  }
}

const summary = {}
for (const key of ['shared', 'gaps', 'mismatches', 'unexpectedGaps']) {
  if (key in found) summary[key] = found[key]
}
console.log(JSON.stringify({ summary, conflicts: [...new Set(conflicts)] }))
