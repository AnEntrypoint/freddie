import { globSync, readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

const SCOPE = '@freddie/freddie-'

export function collectPackageGraph(root, groupOrder, gate) {
  const packages = []
  for (const rel of globSync('packages/*/*/package.json', { cwd: root }).map(path => path.split(sep).join('/')).sort()) {
    const json = JSON.parse(readFileSync(resolve(root, rel), 'utf8'))
    if (!json.name.startsWith(SCOPE)) continue
    const [, group, leaf] = rel.split('/')
    if (group === undefined || leaf === undefined) throw new Error(`${gate}: unexpected package path ${rel}`)
    const deps = Object.keys(json.peerDependencies ?? {})
      .filter(dep => dep.startsWith(SCOPE))
      .map(dep => dep.slice(SCOPE.length))
      .sort()
    packages.push({
      short: json.name.slice(SCOPE.length),
      name: json.name,
      group,
      rel: dirname(rel),
      deps,
    })
  }
  return topoSort(packages, groupOrder, gate)
}

function topoSort(packages, groupOrder, gate) {
  const remaining = new Map(packages.map(pkg => [pkg.short, pkg]))
  const placed = new Set()
  const out = []
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter(pkg => pkg.deps.every(dep => placed.has(dep)))
      .sort((a, b) => comparePackages(a, b, groupOrder))
    if (ready.length === 0) throw new Error(`${gate}: dependency cycle among ${[...remaining.keys()].join(', ')}`)
    for (const pkg of ready) {
      out.push(pkg)
      placed.add(pkg.short)
      remaining.delete(pkg.short)
    }
  }
  return out
}

function comparePackages(a, b, groupOrder) {
  const groupA = groupOrder.indexOf(a.group)
  const groupB = groupOrder.indexOf(b.group)
  const normA = groupA === -1 ? Number.MAX_SAFE_INTEGER : groupA
  const normB = groupB === -1 ? Number.MAX_SAFE_INTEGER : groupB
  return normA - normB || a.group.localeCompare(b.group) || a.short.localeCompare(b.short)
}

export function graphNodeId(prefix, value) {
  return `${prefix}_${value.replace(/[^a-zA-Z0-9_]/g, '_')}`
}

export function escapeMermaidLabel(value) {
  return value.replace(/"/g, '\\"')
}
