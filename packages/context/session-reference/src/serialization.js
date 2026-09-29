
export function stringifyTagSafeJson(value) {
  const serialized = JSON.stringify(value)
  if (typeof serialized !== 'string') throw new TypeError('session-reference data is not JSON-serializable')
  return serialized.replaceAll('<', '\\u003c')
}
