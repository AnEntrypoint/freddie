
const intrinsicReflectApply = Reflect.apply
const intrinsicArrayIsArray = Array.isArray
const IntrinsicBuffer = Buffer
const intrinsicBufferByteLength = Reflect.get(Buffer, 'byteLength')
const intrinsicObjectCreate = Object.create
const intrinsicObjectDefineProperty = Object.defineProperty
const intrinsicObjectKeys = Object.keys
const intrinsicString = String
const intrinsicStringCharCodeAt = Reflect.get(String.prototype, 'charCodeAt')
const intrinsicStringCodePointAt = Reflect.get(String.prototype, 'codePointAt')
const intrinsicStringSlice = Reflect.get(String.prototype, 'slice')

function dataDescriptor(value) {
  const descriptor = intrinsicObjectCreate(null)
  descriptor.value = value
  return descriptor
}

function defineEnumerableDataProperty(target, key, value) {
  const descriptor = dataDescriptor(value)
  descriptor.enumerable = true
  descriptor.configurable = true
  descriptor.writable = true
  intrinsicObjectDefineProperty(target, key, descriptor)
}

function byteLength(text) {
  return intrinsicReflectApply(intrinsicBufferByteLength, IntrinsicBuffer, [text, 'utf8'])
}

function append(target, value) {
  defineEnumerableDataProperty(target, target.length, value)
}

function takeLast(target) {
  if (target.length === 0) return undefined
  const index = target.length - 1
  const value = target[index]
  intrinsicObjectDefineProperty(target, 'length', dataDescriptor(index))
  return value
}

function characterAt(text, index) {
  const codePoint = intrinsicReflectApply(intrinsicStringCodePointAt, text, [index])
  const width = codePoint > 0xffff ? 2 : 1
  return intrinsicReflectApply(intrinsicStringSlice, text, [index, index + width])
}

function serializedCharacterBytes(character) {
  if (character.length === 2) return 4
  if (character === '"' || character === '\\') return 2
  const code = intrinsicReflectApply(intrinsicStringCharCodeAt, character, [0])
  if (code >= 0xd800 && code <= 0xdfff) return 6
  if (code < 0x20) return code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d ? 2 : 6
  return byteLength(character)
}

export const EMPTY_JSON_ARRAY_BYTES = 2

export const JSON_STRING_QUOTES_BYTES = 2

export function jsonStringBytesUpTo(text, maxBytes) {
  if (maxBytes < 2) return undefined
  let bytes = 2
  for (let index = 0; index < text.length;) {
    const character = characterAt(text, index)
    bytes += serializedCharacterBytes(character)
    if (bytes > maxBytes) return undefined
    index += character.length
  }
  return bytes
}

export function jsonValueBytesUpTo(value, maxBytes) {
  let bytes = 0
  const add = (cost) => {
    bytes += cost
    return bytes <= maxBytes
  }
  const tasks = [{ kind: 'value', value }]
  for (let task = takeLast(tasks); task !== undefined; task = takeLast(tasks)) {
    if (task.kind === 'value') {
      const current = task.value
      if (current === null) {
        if (!add(4)) return undefined
      } else if (typeof current === 'string') {
        const stringBytes = jsonStringBytesUpTo(current, maxBytes - bytes)
        if (stringBytes === undefined) return undefined
        bytes += stringBytes
      } else if (typeof current === 'number') {
        if (!add(byteLength(intrinsicString(current)))) return undefined
      } else if (typeof current === 'boolean') {
        if (!add(current ? 4 : 5)) return undefined
      } else if (intrinsicArrayIsArray(current)) {
        if (!add(2)) return undefined
        if (current.length > 0) append(tasks, { kind: 'array', value: current, index: 0 })
      } else {
        if (!add(2)) return undefined
        const keys = intrinsicObjectKeys(current)
        if (keys.length > 0) append(tasks, { kind: 'object', value: current, keys, index: 0 })
      }
      continue
    }

    if (task.index > 0 && !add(1)) return undefined
    if (task.kind === 'array') {
      const item = task.value[task.index]
      if (item === undefined) return undefined
      if (task.index + 1 < task.value.length) append(tasks, { ...task, index: task.index + 1 })
      append(tasks, { kind: 'value', value: item })
      continue
    }

    const key = task.keys[task.index]
    if (key === undefined) return undefined
    const keyBytes = jsonStringBytesUpTo(key, maxBytes - bytes)
    if (keyBytes === undefined) return undefined
    if (!add(keyBytes + 1)) return undefined
    const item = task.value[key]
    if (item === undefined) return undefined
    if (task.index + 1 < task.keys.length) append(tasks, { ...task, index: task.index + 1 })
    append(tasks, { kind: 'value', value: item })
  }
  return bytes
}

export function truncateJsonStringBytes(text, maxBytes) {
  if (maxBytes < 2) return ''
  let bytes = 2
  let end = 0
  for (let index = 0; index < text.length;) {
    const character = characterAt(text, index)
    const cost = serializedCharacterBytes(character)
    if (bytes + cost > maxBytes) break
    bytes += cost
    end += character.length
    index += character.length
  }
  return end === text.length ? text : intrinsicReflectApply(intrinsicStringSlice, text, [0, end])
}
