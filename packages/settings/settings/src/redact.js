/**
 * Structural secret redaction for settings values. `role('secret')` fields are
 * removed from a value before it crosses a wire boundary; a sidecar records
 * each schema-declared secret position and whether it currently holds a value,
 * so a configuration surface can render a write-only input without ever
 * receiving the secret itself.
 * @module @freddie/freddie-settings/redact
 */

/** Whether a value is a plain data object the walker may recurse into. */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a schema node can reach a `role('secret')` field anywhere beneath
 * it. Used only to decide whether a `union` branch is safe to pass through
 * unredacted -- a positive here is exactly what makes `walk` fail closed on
 * that union instead of risking a verbatim secret. Recurses through every
 * container `walk` itself understands (`object`, `dict`, `array`, `tuple`,
 * `intersect`); a nested `union` is conservatively treated as reachable,
 * since resolving which of ITS branches applies would require the value
 * `walk`'s union case never receives.
 * @param node - schema node to inspect.
 * @param seen - node objects already visited, guarding a cyclic schema.
 * @returns whether a secret could be reached beneath `node`.
 */
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

/**
 * Remove every `role('secret')` field a schema declares from a value. The
 * walker follows `object`, `dict`, `array`, `tuple`, and `intersect`
 * containers. A `union` is redacted only when none of its branches could
 * hold a secret (directly or nested); otherwise `walk` throws rather than
 * risk shipping a secret verbatim, since it cannot tell which branch
 * actually matched the value without re-running schema resolution. The
 * input is never mutated.
 * @param schema - live schemastery schema describing the value.
 * @param value - the value to strip; `undefined` yields an empty record with
 *   object-property secret slots still enumerated.
 * @returns the stripped detached value and the ordered secret positions.
 */
export function redactSecrets(schema, value) {
  const secrets = []
  const stripped = walk(schema, value, [], secrets)
  return { value: stripped, secrets }
}
