export function optionalStringArray(subject, field, value) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`client-modules: ${subject} ${field} must be a string array`)
  }
  return value
}

export function stripClientSuffix(spec) {
  return spec.endsWith('/client') ? spec.slice(0, -'/client'.length) : spec
}

export function parseBootManifest(wire) {
  if (typeof wire !== 'object' || wire === null) {
    throw new Error('client-modules: window.__FREDDIE_BOOT__ is missing or not an object')
  }
  const graph = wire
  if (typeof graph.rev !== 'string') {
    throw new Error('client-modules: boot manifest rev must be a string')
  }
  if (!Array.isArray(graph.entries)) {
    throw new Error('client-modules: boot manifest entries must be an array')
  }
  const modules = []
  const plugins = []
  for (const value of graph.entries) {
    if (typeof value !== 'object' || value === null) {
      throw new Error('client-modules: boot manifest entry is not an object')
    }
    const row = value
    const where = typeof row.id === 'string' ? `"${row.id}"` : JSON.stringify(row)
    if (typeof row.id !== 'string' || typeof row.url !== 'string' || typeof row.rev !== 'string') {
      throw new Error(`client-modules: boot manifest entry ${where} must carry string id/url/rev`)
    }
    const subject = `boot manifest entry ${where}`
    const inject = optionalStringArray(subject, 'inject', row.inject)
    const external = optionalStringArray(subject, 'external', row.external)
    if (row.immediately !== undefined && typeof row.immediately !== 'boolean') {
      throw new Error(`client-modules: boot manifest entry ${where} immediately must be a boolean`)
    }
    modules.push({
      id: row.id,
      url: row.url,
      rev: row.rev,
      external: external === undefined ? [] : [...external],
    })
    plugins.push({
      id: row.id,
      inject: inject === undefined ? [] : [...inject],
      immediately: row.immediately === true,
    })
  }
  return { rev: graph.rev, modules, plugins }
}
