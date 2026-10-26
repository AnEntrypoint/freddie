export function noop() {}

export function isNullable(value) {
  return value === null || value === undefined
}

export function isNonNullable(value) {
  return !isNullable(value)
}

export function isPlainObject(data) {
  return data && typeof data === 'object' && !Array.isArray(data)
}

export function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)))
}

export function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]))
}

export { mapValues as valueMap }

export function pick(source, keys, forced) {
  if (!keys) return { ...source }
  const result = {}
  for (const key of keys) {
    if (forced || source[key] !== undefined) result[key] = source[key]
  }
  return result
}

export function omit(source, keys) {
  if (!keys) return { ...source }
  const result = { ...source }
  for (const key of keys) {
    Reflect.deleteProperty(result, key)
  }
  return result
}

export function defineProperty(object, key, value) {
  return Object.defineProperty(object, key, { writable: true, value, enumerable: false })
}
