import tjsPath from 'tjs:path'
import tjsIpaddr from 'tjs:ipaddr'
import { inspect as tjsInspect } from 'tjs:utils'

const tjs = globalThis.tjs
const webCrypto = globalThis.crypto
const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder('utf-8', { ignoreBOM: true })
const RANDOM_CHUNK = 65536
const LATIN1_CHUNK = 32768
const FILE_TYPE_FLAGS = ['isBlockDevice', 'isCharacterDevice', 'isDirectory', 'isFIFO', 'isFile', 'isSocket', 'isSymbolicLink']
const FS_SYNC_NAMES = ['accessSync', 'closeSync', 'createReadStream', 'existsSync', 'lstatSync', 'mkdirSync', 'mkdtempSync', 'openSync', 'readFileSync', 'readSync', 'readdirSync', 'readlinkSync', 'realpathSync', 'rmSync', 'statSync', 'symlinkSync', 'unlinkSync', 'unwatchFile', 'watchFile', 'writeFileSync', 'writeSync']
const ENCODINGS = new Map([
  ['utf8', 'utf8'],
  ['utf-8', 'utf8'],
  ['hex', 'hex'],
  ['base64', 'base64'],
  ['base64url', 'base64url'],
  ['latin1', 'latin1'],
  ['binary', 'latin1'],
  ['ascii', 'ascii'],
  ['utf16le', 'utf16le'],
  ['utf-16le', 'utf16le'],
  ['ucs2', 'utf16le'],
  ['ucs-2', 'utf16le'],
])

function gapError(name) {
  return new Error('@freddie/freddie-runtime: txiki.js has no ' + name + ', see docs/fx-split.md (txiki gaps)')
}

function gapFunction(name) {
  return function unavailable() {
    throw gapError(name)
  }
}

function gapClass(name) {
  return class Unavailable {
    constructor() {
      throw gapError(name)
    }
  }
}

function gapFunctions(prefix, names) {
  return Object.fromEntries(names.map((name) => [name, gapFunction(prefix + '.' + name)]))
}

function gapClasses(prefix, names) {
  return Object.fromEntries(names.map((name) => [name, gapClass(prefix + '.' + name)]))
}

function withGaps(name, members) {
  return new Proxy(members, {
    get(target, key) {
      if (key in target) return target[key]
      if (typeof key === 'symbol' || key === 'then') return undefined
      throw gapError(name + '.' + String(key))
    },
    set(target, key, value) {
      if (!(key in target)) throw gapError(name + '.' + String(key))
      target[key] = value
      return true
    },
  })
}

function encodingOf(encoding = 'utf8') {
  const name = ENCODINGS.get(String(encoding).toLowerCase())
  if (name === undefined) throw new TypeError('Unknown encoding: ' + String(encoding))
  return name
}

function latin1Bytes(text) {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff
  return bytes
}

function latin1Text(bytes, mask) {
  let text = ''
  for (let start = 0; start < bytes.length; start += LATIN1_CHUNK) {
    text += String.fromCharCode(...bytes.subarray(start, start + LATIN1_CHUNK).map((byte) => byte & mask))
  }
  return text
}

function hexBytes(text) {
  const length = text.length >>> 1
  const bytes = new Uint8Array(length)
  let written = 0
  while (written < length && /^[0-9a-fA-F]{2}$/.test(text.slice(written * 2, written * 2 + 2))) {
    bytes[written] = Number.parseInt(text.slice(written * 2, written * 2 + 2), 16)
    written += 1
  }
  return bytes.subarray(0, written)
}

function hexText(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function base64Bytes(text) {
  const clean = text.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+\/]/g, '')
  const body = clean.length % 4 === 1 ? clean.slice(0, -1) : clean
  return latin1Bytes(atob(body + '='.repeat((4 - (body.length % 4)) % 4)))
}

function base64Text(bytes, url) {
  const text = btoa(latin1Text(bytes, 0xff))
  return url ? text.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : text
}

function utf16leBytes(text) {
  const bytes = new Uint8Array(text.length * 2)
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    bytes[index * 2] = unit & 0xff
    bytes[index * 2 + 1] = unit >>> 8
  }
  return bytes
}

function utf16leText(bytes) {
  let text = ''
  const end = bytes.length - (bytes.length % 2)
  for (let start = 0; start < end; start += LATIN1_CHUNK * 2) {
    const units = []
    for (let index = start; index < end && index < start + LATIN1_CHUNK * 2; index += 2) units.push(bytes[index] | (bytes[index + 1] << 8))
    text += String.fromCharCode(...units)
  }
  return text
}

const CODECS = {
  utf8: { encode: (text) => utf8Encoder.encode(text), decode: (bytes) => utf8Decoder.decode(bytes) },
  hex: { encode: hexBytes, decode: hexText },
  base64: { encode: base64Bytes, decode: (bytes) => base64Text(bytes, false) },
  base64url: { encode: base64Bytes, decode: (bytes) => base64Text(bytes, true) },
  latin1: { encode: latin1Bytes, decode: (bytes) => latin1Text(bytes, 0xff) },
  ascii: { encode: latin1Bytes, decode: (bytes) => latin1Text(bytes, 0x7f) },
  utf16le: { encode: utf16leBytes, decode: utf16leText },
}

function viewOf(bytes) {
  return new Buffer(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function dataViewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

class Buffer extends Uint8Array {
  static from(value, encodingOrOffset, length) {
    if (typeof value === 'string') return viewOf(CODECS[encodingOf(encodingOrOffset)].encode(value))
    if (value instanceof ArrayBuffer) {
      const offset = encodingOrOffset ?? 0
      return new Buffer(value, offset, length ?? value.byteLength - offset)
    }
    if (ArrayBuffer.isView(value) || Array.isArray(value)) return new Buffer(value)
    throw new TypeError('Buffer.from: unsupported value')
  }

  static alloc(size, fill, encoding) {
    const buffer = new Buffer(size)
    if (fill === undefined) return buffer
    if (typeof fill === 'number') return buffer.fill(fill)
    const pattern = typeof fill === 'string' ? CODECS[encodingOf(encoding)].encode(fill) : Buffer.from(fill)
    for (let index = 0; index < size && pattern.length > 0; index += 1) buffer[index] = pattern[index % pattern.length]
    return buffer
  }

  static allocUnsafe(size) {
    return new Buffer(size)
  }

  static concat(list, totalLength) {
    const length = totalLength ?? list.reduce((sum, item) => sum + item.length, 0)
    const result = new Buffer(length)
    let offset = 0
    for (const item of list) {
      if (offset >= length) break
      const piece = item.subarray(0, length - offset)
      result.set(piece, offset)
      offset += piece.length
    }
    return result
  }

  static byteLength(value, encoding) {
    if (typeof value === 'string') return CODECS[encodingOf(encoding)].encode(value).length
    return value.byteLength
  }

  static compare(left, right) {
    return left.compare(right)
  }

  static isBuffer(value) {
    return value instanceof Buffer
  }

  toString(encoding, start = 0, end = this.length) {
    return CODECS[encodingOf(encoding)].decode(this.subarray(start, end))
  }

  toJSON() {
    return { type: 'Buffer', data: Array.from(this) }
  }

  equals(other) {
    return this.compare(other) === 0
  }

  compare(other) {
    const length = Math.min(this.length, other.length)
    for (let index = 0; index < length; index += 1) {
      if (this[index] !== other[index]) return this[index] < other[index] ? -1 : 1
    }
    return Math.sign(this.length - other.length)
  }

  copy(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
    const piece = this.subarray(sourceStart, sourceEnd)
    const count = Math.max(0, Math.min(piece.length, target.length - targetStart))
    target.set(piece.subarray(0, count), targetStart)
    return count
  }

  write(text, offset, length, encoding) {
    if (typeof offset === 'string') return this.write(text, 0, undefined, offset)
    if (typeof length === 'string') return this.write(text, offset, undefined, length)
    const start = offset ?? 0
    const bytes = CODECS[encodingOf(encoding)].encode(text)
    const count = Math.min(bytes.length, this.length - start, length ?? Infinity)
    this.set(bytes.subarray(0, count), start)
    return count
  }

  slice(start, end) {
    return this.subarray(start, end)
  }

  readUInt8(offset = 0) {
    return dataViewOf(this).getUint8(offset)
  }

  readUInt16LE(offset = 0) {
    return dataViewOf(this).getUint16(offset, true)
  }

  readUInt16BE(offset = 0) {
    return dataViewOf(this).getUint16(offset, false)
  }

  readUInt32LE(offset = 0) {
    return dataViewOf(this).getUint32(offset, true)
  }

  readUInt32BE(offset = 0) {
    return dataViewOf(this).getUint32(offset, false)
  }

  readInt16LE(offset = 0) {
    return dataViewOf(this).getInt16(offset, true)
  }

  readInt32LE(offset = 0) {
    return dataViewOf(this).getInt32(offset, true)
  }

  readUIntLE(offset, byteLength) {
    let value = 0
    for (let index = byteLength - 1; index >= 0; index -= 1) value = value * 256 + this[offset + index]
    return value
  }

  readUIntBE(offset, byteLength) {
    let value = 0
    for (let index = 0; index < byteLength; index += 1) value = value * 256 + this[offset + index]
    return value
  }

  writeUInt8(value, offset = 0) {
    dataViewOf(this).setUint8(offset, value)
    return offset + 1
  }

  writeUInt16LE(value, offset = 0) {
    dataViewOf(this).setUint16(offset, value, true)
    return offset + 2
  }

  writeUInt16BE(value, offset = 0) {
    dataViewOf(this).setUint16(offset, value, false)
    return offset + 2
  }

  writeUInt32LE(value, offset = 0) {
    dataViewOf(this).setUint32(offset, value, true)
    return offset + 4
  }

  writeUInt32BE(value, offset = 0) {
    dataViewOf(this).setUint32(offset, value, false)
    return offset + 4
  }
}

function fileTypeMethods(raw) {
  return Object.fromEntries(FILE_TYPE_FLAGS.map((flag) => [flag, () => raw[flag]]))
}

function statsOf(raw) {
  return {
    ...fileTypeMethods(raw),
    dev: raw.dev,
    mode: raw.mode,
    nlink: raw.nlink,
    uid: raw.uid,
    gid: raw.gid,
    rdev: raw.rdev,
    ino: raw.ino,
    size: raw.size,
    blksize: raw.blksize,
    blocks: raw.blocks,
    atime: raw.atim,
    mtime: raw.mtim,
    ctime: raw.ctim,
    birthtime: raw.birthtim,
    atimeMs: raw.atim.getTime(),
    mtimeMs: raw.mtim.getTime(),
    ctimeMs: raw.ctim.getTime(),
    birthtimeMs: raw.birthtim.getTime(),
  }
}

function direntOf(raw) {
  return { name: raw.name, ...fileTypeMethods(raw) }
}

const fsConstants = withGaps('fs.constants', { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 })

async function exists(path) {
  return tjs.lstat(path).then(() => true, () => false)
}

async function access(path, mode = fsConstants.F_OK) {
  if (mode !== fsConstants.F_OK) throw gapError('fs.promises.access with a mode other than F_OK')
  await tjs.stat(path)
}

function chmod(path, mode) {
  return tjs.chmod(path, mode)
}

async function mkdir(path, options = {}) {
  const mode = typeof options === 'number' ? options : options.mode
  await tjs.makeDir(path, { recursive: options.recursive === true, mode })
}

async function cp(source, destination, options = {}) {
  const entry = statsOf(await tjs.lstat(source))
  if (entry.isSymbolicLink()) throw gapError('fs.promises.cp of a symbolic link')
  if (!entry.isDirectory()) return tjs.copyFile(source, destination)
  if (options.recursive !== true) throw new Error('fs.promises.cp: ' + source + ' is a directory; pass { recursive: true }')
  await mkdir(destination, { recursive: true })
  for (const name of await readdir(source)) {
    await cp(tjsPath.join(source, name), tjsPath.join(destination, name), options)
  }
}

function link(existing, path) {
  return tjs.link(existing, path)
}

async function lstat(path) {
  return statsOf(await tjs.lstat(path))
}

function mkdtemp(prefix) {
  return tjs.makeTempDir(prefix + 'XXXXXX')
}

function open(path, flags, mode) {
  return tjs.open(path, flags, mode)
}

async function readFile(path, options) {
  const encoding = typeof options === 'string' ? options : options?.encoding
  const bytes = viewOf(await tjs.readFile(path))
  return encoding === undefined || encoding === null ? bytes : bytes.toString(encoding)
}

function closedDirError() {
  const error = new Error('Directory handle was closed')
  error.code = 'ERR_DIR_CLOSED'
  return error
}

class Dir {
  #path
  #entries
  #closed = false
  #exhausted = false

  constructor(path, entries) {
    this.#path = path
    this.#entries = entries
  }

  get path() {
    return this.#path
  }

  async read() {
    if (this.#closed) throw closedDirError()
    if (this.#exhausted) return null
    const next = await this.#entries.next()
    if (next.done) {
      this.#exhausted = true
      return null
    }
    return direntOf(next.value)
  }

  async close() {
    if (this.#closed) throw closedDirError()
    this.#closed = true
  }

  async *[Symbol.asyncIterator]() {
    try {
      for (let entry = await this.read(); entry !== null; entry = await this.read()) yield entry
    } finally {
      if (!this.#closed) await this.close()
    }
  }
}

async function opendir(path) {
  const entries = await tjs.readDir(path)
  return new Dir(path, entries[Symbol.asyncIterator]())
}

async function readdir(path, options) {
  const withFileTypes = options?.withFileTypes === true
  const entries = []
  for await (const entry of await tjs.readDir(path)) entries.push(withFileTypes ? direntOf(entry) : entry.name)
  return entries
}

function realpath(path) {
  return tjs.realPath(path)
}

function rename(from, to) {
  return tjs.rename(from, to)
}

async function rm(path, options = {}) {
  if (options.force === true && !(await exists(path))) return
  await tjs.remove(path, { recursive: options.recursive === true })
}

async function stat(path) {
  return statsOf(await tjs.stat(path))
}

async function truncate(path, length = 0) {
  const handle = await tjs.open(path, 'r+')
  try {
    await handle.truncate(length)
  } finally {
    await handle.close()
  }
}

async function unlink(path) {
  if (statsOf(await tjs.lstat(path)).isDirectory()) throw new Error('fs.promises.unlink: ' + path + ' is a directory')
  await tjs.remove(path)
}

async function writeFile(path, data, options) {
  const encoding = typeof options === 'string' ? options : options?.encoding
  const flag = options?.flag ?? 'w'
  if (flag !== 'w' && flag !== 'a') throw gapError('fs.promises.writeFile with flag ' + flag)
  if (options?.mode !== undefined) throw gapError('fs.promises.writeFile with mode')
  const bytes = typeof data === 'string' ? CODECS[encodingOf(encoding)].encode(data) : data
  if (flag === 'w') {
    await tjs.writeFile(path, bytes)
    return
  }
  const handle = await tjs.open(path, 'a')
  try {
    let offset = 0
    while (offset < bytes.length) offset += await handle.write(bytes.subarray(offset))
  } finally {
    await handle.close()
  }
}

const fsPromises = withGaps('fs.promises', {
  access,
  chmod,
  constants: fsConstants,
  cp,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  opendir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  truncate,
  unlink,
  writeFile,
})

function randomBytes(size, callback) {
  const bytes = new Uint8Array(size)
  for (let start = 0; start < size; start += RANDOM_CHUNK) {
    webCrypto.getRandomValues(bytes.subarray(start, start + RANDOM_CHUNK))
  }
  const buffer = viewOf(bytes)
  if (callback === undefined) return buffer
  globalThis.setTimeout(() => callback(null, buffer), 0)
}

function fileURLToPath(value) {
  const url = typeof value === 'string' ? new URL(value) : value
  if (url.protocol !== 'file:') throw new TypeError('The URL must be of scheme file')
  return decodeURIComponent(url.pathname)
}

function pathToFileURL(filePath) {
  const absolute = tjsPath.isAbsolute(filePath) ? filePath : tjsPath.resolve(tjs.cwd, filePath)
  const url = new URL('file:///')
  url.pathname = absolute
    .replace(/%/g, '%25')
    .replace(/\\/g, '%5C')
    .replace(/\n/g, '%0A')
    .replace(/\r/g, '%0D')
    .replace(/\t/g, '%09')
  return url
}

function promisify(original) {
  if (typeof original !== 'function') throw new TypeError('The "original" argument must be of type function')
  return (...args) => new Promise((resolve, reject) => {
    original(...args, (error, value) => (error ? reject(error) : resolve(value)))
  })
}

const DOTENV_LINE = /^\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?$/gm

function hasOwnKey(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function parseArgsError(code, message) {
  const error = new TypeError(message)
  error.code = code
  return error
}

function optionLabel(name, option) {
  const short = option.short === undefined ? '' : '-' + option.short + ', '
  return short + '--' + name + (option.type === 'string' ? ' <value>' : '')
}

function shortOptionName(options, char) {
  return Object.keys(options).find((name) => options[name].short === char)
}

function ambiguousValueMessage(rawName, name, option) {
  const suffix = rawName.startsWith('--') ? "use '--" + name + "=-XYZ'." : "use '--" + name + "=-XYZ' or '-" + option.short + "-XYZ'."
  return "Option '" + rawName + "' argument is ambiguous.\nDid you forget to specify the option argument for '" + rawName + "'?\nTo specify an option argument starting with a dash " + suffix
}

function unknownOptionMessage(rawName, allowPositionals) {
  const hint = allowPositionals ? ". To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"" + rawName + "\"" : ''
  return "Unknown option '" + rawName + "'" + hint
}

function valueToken(args, index, name, option, rawName, strict, tokens) {
  const next = args[index + 1]
  if (next === undefined) {
    if (strict) throw parseArgsError('ERR_PARSE_ARGS_INVALID_OPTION_VALUE', "Option '" + optionLabel(name, option) + "' argument missing")
    tokens.push({ kind: 'option', name, rawName, index })
    return 0
  }
  if (strict && next.startsWith('-')) throw parseArgsError('ERR_PARSE_ARGS_INVALID_OPTION_VALUE', ambiguousValueMessage(rawName, name, option))
  tokens.push({ kind: 'option', name, rawName, index, value: next, inlineValue: false })
  return 1
}

function longToken(args, index, options, strict, allowNegative, tokens) {
  const arg = args[index]
  const body = arg.slice(2)
  const equals = body.indexOf('=')
  const name = equals === -1 ? body : body.slice(0, equals)
  const rawName = '--' + name
  const inline = equals === -1 ? undefined : body.slice(equals + 1)
  if (!hasOwnKey(options, name) && allowNegative && name.startsWith('no-') && hasOwnKey(options, name.slice(3)) && options[name.slice(3)].type === 'boolean') {
    tokens.push({ kind: 'option', name: name.slice(3), rawName, index })
    return 0
  }
  if (!hasOwnKey(options, name)) {
    tokens.push(inline === undefined ? { kind: 'option', name, rawName, index } : { kind: 'option', name, rawName, index, value: inline, inlineValue: true })
    return 0
  }
  const option = options[name]
  if (inline !== undefined) {
    if (option.type === 'boolean' && strict) throw parseArgsError('ERR_PARSE_ARGS_INVALID_OPTION_VALUE', "Option '" + optionLabel(name, option) + "' does not take an argument")
    tokens.push({ kind: 'option', name, rawName, index, value: inline, inlineValue: true })
    return 0
  }
  if (option.type === 'boolean') {
    tokens.push({ kind: 'option', name, rawName, index })
    return 0
  }
  return valueToken(args, index, name, option, rawName, strict, tokens)
}

function shortToken(args, index, options, strict, tokens) {
  const chars = args[index].slice(1)
  for (let position = 0; position < chars.length; position += 1) {
    const char = chars[position]
    const rawName = '-' + char
    const name = shortOptionName(options, char)
    if (name === undefined) {
      tokens.push({ kind: 'option', name: char, rawName, index })
      continue
    }
    const option = options[name]
    if (option.type === 'boolean') {
      tokens.push({ kind: 'option', name, rawName, index })
      continue
    }
    const rest = chars.slice(position + 1)
    if (rest.length > 0) {
      tokens.push({ kind: 'option', name, rawName, index, value: rest, inlineValue: true })
      return 0
    }
    return valueToken(args, index, name, option, rawName, strict, tokens)
  }
  return 0
}

function tokenizeArgs(args, options, strict, allowNegative) {
  const tokens = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--') {
      tokens.push({ kind: 'option-terminator', index })
      for (let rest = index + 1; rest < args.length; rest += 1) tokens.push({ kind: 'positional', index: rest, value: args[rest] })
      break
    }
    let consumed = 0
    if (arg.startsWith('--')) consumed = longToken(args, index, options, strict, allowNegative, tokens)
    else if (arg.startsWith('-') && arg.length > 1) consumed = shortToken(args, index, options, strict, tokens)
    else tokens.push({ kind: 'positional', index, value: arg })
    index += consumed
  }
  return tokens
}

function storeOptionToken(token, options, strict, allowPositionals, values) {
  if (!hasOwnKey(options, token.name)) {
    if (strict) throw parseArgsError('ERR_PARSE_ARGS_UNKNOWN_OPTION', unknownOptionMessage(token.rawName, allowPositionals))
    values[token.name] = token.value ?? true
    return
  }
  const option = options[token.name]
  const negated = token.rawName.startsWith('--no-') && token.name === token.rawName.slice(5)
  const stored = token.value ?? (option.type === 'boolean' ? !negated : true)
  values[token.name] = option.multiple === true ? [...(values[token.name] ?? []), stored] : stored
}

function parseArgs(config = {}) {
  const args = config.args
  if (args === undefined) throw gapError('util.parseArgs without args')
  const options = config.options ?? {}
  const strict = config.strict ?? true
  const allowPositionals = config.allowPositionals ?? !strict
  const allowNegative = config.allowNegative ?? false
  const tokens = tokenizeArgs(args, options, strict, allowNegative)
  const values = Object.create(null)
  const positionals = []
  for (const token of tokens) {
    if (token.kind === 'option-terminator') continue
    if (token.kind === 'positional') {
      if (!allowPositionals) throw parseArgsError('ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL', "Unexpected argument '" + token.value + "'. This command does not take positional arguments")
      positionals.push(token.value)
      continue
    }
    storeOptionToken(token, options, strict, allowPositionals, values)
  }
  for (const [name, option] of Object.entries(options)) {
    if (values[name] === undefined && option.default !== undefined) values[name] = option.default
  }
  const result = { values, positionals }
  if (config.tokens === true) result.tokens = tokens
  return result
}

function expandIPv6(text) {
  if (!text.includes('::')) return text.split(':')
  const [head, tail] = text.split('::')
  const headGroups = head === '' ? [] : head.split(':')
  const tailGroups = tail === '' ? [] : tail.split(':')
  return [...headGroups, ...Array(8 - headGroups.length - tailGroups.length).fill('0'), ...tailGroups]
}

function prefixLength(netmask) {
  const groups = netmask.includes(':') ? expandIPv6(netmask).map((group) => parseInt(group, 16)) : netmask.split('.').map(Number)
  return groups.reduce((bits, group) => bits + group.toString(2).replace(/0/g, '').length, 0)
}

function networkInterfaces() {
  const interfaces = {}
  for (const entry of tjs.system.networkInterfaces) {
    const family = entry.address.includes(':') ? 'IPv6' : 'IPv4'
    const record = { address: entry.address, netmask: entry.netmask, family, mac: entry.mac, internal: entry.internal, cidr: entry.address + '/' + prefixLength(entry.netmask) }
    if (family === 'IPv6') record.scopeid = entry.scopeId
    if (!hasOwnKey(interfaces, entry.name)) interfaces[entry.name] = []
    interfaces[entry.name].push(record)
  }
  return interfaces
}

function parseEnv(content) {
  const env = {}
  const text = String(content).replace(/\r\n?/g, '\n')
  for (const match of text.matchAll(DOTENV_LINE)) {
    const raw = (match[2] ?? '').trim()
    const value = raw.replace(/^(['"`])([\s\S]*)\1$/, '$2')
    env[match[1]] = raw[0] === '"' ? value.replace(/\\n/g, '\n').replace(/\\r/g, '\r') : value
  }
  return env
}

function sameBytes(left, right) {
  const leftBytes = new Uint8Array(left.buffer ?? left, left.byteOffset ?? 0, left.byteLength)
  const rightBytes = new Uint8Array(right.buffer ?? right, right.byteOffset ?? 0, right.byteLength)
  return leftBytes.length === rightBytes.length && leftBytes.every((byte, index) => byte === rightBytes[index])
}

function sameValueFields(left, right) {
  if (left instanceof Date) return Object.is(left.getTime(), right.getTime())
  if (left instanceof RegExp) return left.source === right.source && left.flags === right.flags
  if (left instanceof Error) return left.name === right.name && left.message === right.message
  if (left instanceof Number || left instanceof String || left instanceof Boolean) return Object.is(left.valueOf(), right.valueOf())
  if (left instanceof ArrayBuffer) return sameBytes(left, right)
  if (ArrayBuffer.isView(left)) return sameBytes(left, right)
  return true
}

function sameMap(left, right, seen) {
  if (left.size !== right.size) return false
  for (const [key, value] of left) {
    if (right.has(key)) {
      if (!deepEqual(value, right.get(key), seen)) return false
      continue
    }
    const matched = [...right].some(([otherKey, otherValue]) => deepEqual(key, otherKey, seen) && deepEqual(value, otherValue, seen))
    if (!matched) return false
  }
  return true
}

function sameSet(left, right, seen) {
  if (left.size !== right.size) return false
  return [...left].every((value) => right.has(value) || [...right].some((other) => deepEqual(value, other, seen)))
}

function sameEnumerableProperties(left, right, seen) {
  const enumerableKeys = (object) => Reflect.ownKeys(object).filter((key) => Object.prototype.propertyIsEnumerable.call(object, key))
  const keys = enumerableKeys(left)
  if (keys.length !== enumerableKeys(right).length) return false
  return keys.every((key) => Object.prototype.propertyIsEnumerable.call(right, key) && deepEqual(left[key], right[key], seen))
}

function deepEqual(left, right, seen) {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false
  if (Object.prototype.toString.call(left) !== Object.prototype.toString.call(right)) return false
  const partners = seen.get(left) ?? new Set()
  if (partners.has(right)) return true
  partners.add(right)
  seen.set(left, partners)
  if (!sameValueFields(left, right)) return false
  if (left instanceof Map && !sameMap(left, right, seen)) return false
  if (left instanceof Set && !sameSet(left, right, seen)) return false
  return sameEnumerableProperties(left, right, seen)
}

function isDeepStrictEqual(left, right) {
  return deepEqual(left, right, new Map())
}

function isPromise(value) {
  return value instanceof Promise
}

function isIP(input) {
  if (typeof input !== 'string' || !tjsIpaddr.isValid(input)) return 0
  return input.includes(':') ? 6 : 4
}

function availableParallelism() {
  return tjs.system.cpus.length
}

class StringDecoder {
  #decoder = new TextDecoder('utf-8', { ignoreBOM: true })

  constructor(encoding = 'utf8') {
    if (encodingOf(encoding) !== 'utf8') throw gapError('StringDecoder for ' + String(encoding))
  }

  write(bytes) {
    return this.#decoder.decode(bytes, { stream: true })
  }

  end(bytes) {
    return bytes === undefined ? this.#decoder.decode() : this.#decoder.decode(bytes)
  }
}

function abortError(signal) {
  const error = new Error('The operation was aborted', { cause: signal.reason })
  error.name = 'AbortError'
  error.code = 'ABORT_ERR'
  return error
}

function delay(milliseconds, value, options) {
  const signal = options?.signal
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal))
    const onAbort = () => {
      globalThis.clearTimeout(timer)
      reject(abortError(signal))
    }
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(value)
    }, milliseconds)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const scheduler = {
  wait: (milliseconds, options) => delay(milliseconds, undefined, options),
  yield: () => delay(0),
}

const processObject = withGaps('process', {
  argv: [tjs.exePath, ...tjs.args],
  cwd: () => tjs.cwd,
  env: tjs.env,
  execArgv: [],
  execPath: tjs.exePath,
  exit: (code) => tjs.exit(code),
  kill: (pid, signal) => tjs.kill(pid, signal),
  pid: tjs.pid,
  ppid: tjs.ppid,
})

export const txikiRuntime = {
  fs: withGaps('fs', { ...gapFunctions('fs', FS_SYNC_NAMES), constants: fsConstants }),
  fsPromises,
  path: tjsPath,
  crypto: withGaps('crypto', {
    ...gapFunctions('crypto', ['createHash']),
    randomBytes,
    randomUUID: () => webCrypto.randomUUID(),
  }),
  stream: withGaps('stream', {
    ...gapClasses('stream', ['PassThrough', 'Readable', 'Writable']),
    ...gapFunctions('stream', ['pipeline']),
  }),
  buffer: withGaps('buffer', { Buffer, constants: withGaps('buffer.constants', {}) }),
  url: { fileURLToPath, pathToFileURL },
  util: withGaps('util', {
    TextDecoder: globalThis.TextDecoder,
    inspect: tjsInspect,
    isDeepStrictEqual,
    parseArgs,
    parseEnv,
    promisify,
  }),
  utilTypes: withGaps('util.types', { isPromise }),
  module: withGaps('module', gapFunctions('module', ['createRequire', 'stripTypeScriptTypes'])),
  childProcess: withGaps('child_process', gapFunctions('child_process', ['execFile', 'execFileSync', 'spawn', 'spawnSync'])),
  os: withGaps('os', {
    availableParallelism,
    constants: withGaps('os.constants', {}),
    homedir: () => tjs.homeDir,
    tmpdir: () => tjs.tmpDir,
    networkInterfaces,
    ...gapFunctions('os', ['platform', 'release']),
  }),
  workerThreads: withGaps('worker_threads', {
    MessageChannel: globalThis.MessageChannel,
    Worker: gapClass('worker_threads.Worker'),
    parentPort: withGaps('worker_threads.parentPort', {}),
    workerData: withGaps('worker_threads.workerData', {}),
  }),
  asyncHooks: withGaps('async_hooks', { AsyncLocalStorage: gapClass('async_hooks.AsyncLocalStorage') }),
  vm: withGaps('vm', { Script: gapClass('vm.Script'), ...gapFunctions('vm', ['createContext', 'runInContext']) }),
  http: withGaps('http', gapFunctions('http', ['createServer', 'validateHeaderValue'])),
  https: withGaps('https', {}),
  zlib: withGaps('zlib', {
    constants: withGaps('zlib.constants', {}),
    ...gapFunctions('zlib', ['brotliCompress', 'createZstdDecompress', 'gunzip', 'gzip', 'zstdCompress', 'zstdDecompress', 'zstdDecompressSync']),
  }),
  inspector: withGaps('inspector', { Session: gapClass('inspector.Session') }),
  stringDecoder: withGaps('string_decoder', { StringDecoder }),
  perfHooks: withGaps('perf_hooks', { performance: globalThis.performance }),
  timersPromises: withGaps('timers/promises', { scheduler, setTimeout: delay }),
  net: withGaps('net', { isIP }),
  dnsPromises: withGaps('dns/promises', {}),
  process: processObject,
}
