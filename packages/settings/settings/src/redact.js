function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canReachSecret(node, seen) {
  if (node === undefined || seen.has(node)) return false
  if (node.meta?.role === 'secret') return true
  seen.add(node)
  switch (node.type) {
    case 'object':
      return Object.values(node.dict ?? {}).some((child) => canReachSecret(child, seen))
    case 'dict':
    case 'array':
      return canReachSecret(node.inner, seen)
    case 'tuple':
    case 'intersect':
      return (node.list ?? []).some((child) => canReachSecret(child, seen))
    case 'union':
      return true
    default:
      return false
  }
}

function walk(node, value, path, secrets) {
  if (node === undefined) return value
  if (node.meta?.role === 'secret') {
    secrets.push({ path, set: value !== undefined })
    return undefined
  }
  switch (node.type) {
    case 'object': {
      const properties = node.dict ?? {}
      const source = isRecord(value) ? value : undefined
      const rebuilt = {}
      if (source !== undefined) {
        for (const [key, entry] of Object.entries(source)) {
          if (key in properties) continue
          rebuilt[key] = entry
        }
      }
      for (const [key, child] of Object.entries(properties)) {
        const stripped = walk(child, source?.[key], [...path, key], secrets)
        if (stripped !== undefined) rebuilt[key] = stripped
      }
      return source === undefined && Object.keys(rebuilt).length === 0 ? value : rebuilt
    }
    case 'dict': {
      if (!isRecord(value)) return value
      const rebuilt = {}
      for (const [key, entry] of Object.entries(value)) {
        const stripped = walk(node.inner, entry, [...path, key], secrets)
        if (stripped !== undefined) rebuilt[key] = stripped
      }
      return rebuilt
    }
    case 'array': {
      if (!Array.isArray(value)) return value
      return value.map((entry, index) => walk(node.inner, entry, [...path, String(index)], secrets))
    }
    case 'tuple': {
      if (!Array.isArray(value)) return value
      return value.map((entry, index) => walk(node.list[index], entry, [...path, String(index)], secrets))
    }
    case 'intersect': {
      let stripped = value
      for (const branch of node.list) stripped = walk(branch, stripped, path, secrets)
      return stripped
    }
    case 'union': {
      if (node.list.some((branch) => canReachSecret(branch, new Set()))) {
        throw new Error(
          `redactSecrets: cannot verify a secret is not reachable through the union at ${path.join('.') || '<root>'}`,
        )
      }
      return value
    }
    default:
      return value
  }
}

export function redactSecrets(schema, value) {
  const secrets = []
  const stripped = walk(schema, value, [], secrets)
  return { value: stripped, secrets }
}
