export class MaterializeError extends Error {
  constructor(path, reason) {
    super(`${path}: ${reason}`)
    this.path = path
    this.reason = reason
    this.name = 'MaterializeError'
  }
}

export function renderThrown(error) {
  try {
    const stack = error?.stack
    if (typeof stack === 'string' && stack.length > 0) return stack
    const message = error?.message
    if (typeof message === 'string' && message.length > 0) return message
    return String(error)
  } catch {
    return '[unrenderable thrown value]'
  }
}

function hasPlainPrototype(value) {
  const proto = Object.getPrototypeOf(value)
  if (proto === null) return true
  return Object.getPrototypeOf(proto) === null
}

export function materializeFromRealm(value, root = 'value') {
  if (value === undefined) return undefined
  try {
    return materialize(value, root, new Set())
  } catch (error) {
    if (error instanceof MaterializeError) throw error
    throw new MaterializeError(root, `reading the value threw: ${renderThrown(error)}`)
  }
}

function materialize(value, path, seen) {
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return value
    case 'number': {
      if (!Number.isFinite(value)) throw new MaterializeError(path, 'non-finite numbers are not JSON data')
      return value
    }
    case 'bigint':
      throw new MaterializeError(path, 'bigints are not JSON data')
    case 'function':
      throw new MaterializeError(path, 'functions are not plain JSON data')
    case 'symbol':
      throw new MaterializeError(path, 'symbols are not plain JSON data')
    case 'undefined':
      throw new MaterializeError(path, 'undefined is not JSON data')
    case 'object':
      break
  }
  if (value === null) return null
  const objectValue = value
  if (seen.has(objectValue)) throw new MaterializeError(path, 'circular references are not JSON data')
  seen.add(objectValue)
  try {
    if (Array.isArray(objectValue)) return materializeArray(objectValue, path, seen)
    return materializeObject(objectValue, path, seen)
  } finally {
    seen.delete(objectValue)
  }
}

function materializeArray(value, path, seen) {
  const out = []
  for (let index = 0; index < value.length; index++) {
    if (!(index in value)) throw new MaterializeError(`${path}[${index}]`, 'sparse arrays are not JSON data')
    out.push(materialize(value[index], `${path}[${index}]`, seen))
  }
  for (const key of Object.keys(value)) {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= value.length) {
      throw new MaterializeError(`${path}.${key}`, 'arrays with non-index properties are not JSON data')
    }
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new MaterializeError(path, 'symbol-keyed properties are not plain JSON data')
  }
  return out
}

function materializeObject(value, path, seen) {
  if (!hasPlainPrototype(value)) {
    throw new MaterializeError(path, 'only plain objects and arrays are JSON data (exotic prototype)')
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new MaterializeError(path, 'symbol-keyed properties are not plain JSON data')
  }
  const out = {}
  for (const key of Object.keys(value)) {
    Object.defineProperty(out, key, {
      value: materialize(value[key], `${path}.${key}`, seen),
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return out
}
