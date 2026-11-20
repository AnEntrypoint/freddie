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
const FS_SYNC_NAMES = ['accessSync', 'closeSync', 'existsSync', 'lstatSync', 'mkdirSync', 'mkdtempSync', 'openSync', 'readFileSync', 'readSync', 'readdirSync', 'readlinkSync', 'realpathSync', 'rmSync', 'statSync', 'symlinkSync', 'unlinkSync', 'writeFileSync', 'writeSync']
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
  if (name === undefined) throw codedError(TypeError, 'ERR_UNKNOWN_ENCODING', 'Unknown encoding: ' + String(encoding))
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

const fsConstants = withGaps('fs.constants', {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 64,
  O_EXCL: 128,
  O_NOCTTY: 256,
  O_TRUNC: 512,
  O_APPEND: 1024,
  O_NONBLOCK: 2048,
  O_DSYNC: 4096,
  O_DIRECT: 16384,
  O_DIRECTORY: 65536,
  O_NOFOLLOW: 131072,
  O_NOATIME: 262144,
  O_SYNC: 1052672,
})

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

async function statFor(path, dereference) {
  try {
    return statsOf(await (dereference ? tjs.stat(path) : tjs.lstat(path)))
  } catch (error) {
    throw fsPathError(error, dereference ? 'stat' : 'lstat', path)
  }
}

function cpError(code, errno, message) {
  return Object.assign(new Error(message), { code, errno, syscall: 'cp' })
}

function cpSubdirectory(source, destination, path) {
  return cpError('ERR_FS_CP_EINVAL', 22, 'Invalid src or dest: cp returned EINVAL (cannot copy ' + source + ' to a subdirectory of self ' + destination + ') ' + path)
}

function isSrcSubdir(source, destination) {
  const sourceParts = tjsPath.resolve(source).split('/').filter(Boolean)
  const destinationParts = tjsPath.resolve(destination).split('/').filter(Boolean)
  return sourceParts.every((part, index) => destinationParts[index] === part)
}

function sameFile(left, right) {
  return left.ino === right.ino && left.dev === right.dev
}

async function sourceIsDirectory(source) {
  return statFor(source, true).then((entry) => entry.isDirectory(), () => false)
}

async function copyLink(source, destination, destinationEntry) {
  const target = tjsPath.resolve(tjsPath.dirname(source), await tjs.readLink(source))
  if (destinationEntry?.isSymbolicLink()) {
    const resolvedDestination = tjsPath.resolve(tjsPath.dirname(destination), await tjs.readLink(destination))
    if (await sourceIsDirectory(source)) {
      if (isSrcSubdir(target, resolvedDestination)) throw cpSubdirectory(target, resolvedDestination, destination)
      if (isSrcSubdir(resolvedDestination, target)) throw cpError('ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY', 22, 'Cannot overwrite symlink in subdirectory of self: cp returned EINVAL (cannot overwrite ' + resolvedDestination + ' with ' + target + ') ' + destination)
    }
    await unlink(destination)
  }
  await symlink(target, destination)
}

async function cp(source, destination, options = {}) {
  const dereference = options.dereference === true
  const sourceEntry = await statFor(source, dereference)
  const destinationEntry = await statFor(destination, dereference).catch(() => null)
  if (destinationEntry !== null && sameFile(sourceEntry, destinationEntry)) throw cpError('ERR_FS_CP_EINVAL', 22, 'Invalid src or dest: cp returned EINVAL (src and dest cannot be the same) ' + destination)
  if (destinationEntry?.isDirectory() && !sourceEntry.isDirectory()) throw cpError('ERR_FS_CP_NON_DIR_TO_DIR', 20, 'Cannot overwrite directory with non-directory: cp returned ENOTDIR (cannot overwrite directory ' + destination + ' with non-directory ' + source + ') ' + destination)
  if (sourceEntry.isDirectory() && destinationEntry !== null && !destinationEntry.isDirectory()) throw cpError('ERR_FS_CP_DIR_TO_NON_DIR', 21, 'Cannot overwrite non-directory with directory: cp returned EISDIR (cannot overwrite non-directory ' + destination + ' with directory ' + source + ') ' + destination)
  if (sourceEntry.isDirectory() && options.recursive !== true) throw new Error('fs.promises.cp: ' + source + ' is a directory; pass { recursive: true }')
  if (sourceEntry.isDirectory() && isSrcSubdir(source, destination)) throw cpSubdirectory(source, destination, destination)
  await mkdir(tjsPath.dirname(destination), { recursive: true })
  if (sourceEntry.isSymbolicLink()) return copyLink(source, destination, destinationEntry)
  if (sourceEntry.isDirectory()) {
    await mkdir(destination, { recursive: true })
    for (const name of await readdir(source)) {
      await cp(tjsPath.join(source, name), tjsPath.join(destination, name), options)
    }
    return
  }
  if (destinationEntry !== null) await unlink(destination)
  return tjs.copyFile(source, destination)
}

function linkError(error, target, path) {
  if (error.code !== 'EEXIST') return error
  return Object.assign(new Error("EEXIST: file already exists, symlink '" + target + "' -> '" + path + "'"), { errno: -17, code: 'EEXIST', syscall: 'symlink', path: target, dest: path })
}

async function symlink(target, path) {
  try {
    await tjs.symlink(target, path)
  } catch (error) {
    throw linkError(error, target, path)
  }
}

async function readlink(path) {
  try {
    return await tjs.readLink(path)
  } catch (error) {
    throw fsPathError(error, 'readlink', path)
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

const WRITE_FILE_FLAGS = ['w', 'wx', 'w+', 'wx+', 'a', 'ax', 'a+', 'ax+', 'r+', 'rs+', 'as', 'as+']

function modeOf(value = 0o666) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^[0-7]+$/.test(value)) return parseInt(value, 8)
  if (typeof value === 'string') throw codedError(TypeError, 'ERR_INVALID_ARG_VALUE', "The argument 'mode' must be a 32-bit unsigned integer or an octal string. Received '" + value + "'")
  throw gapError('fs.promises.writeFile with mode ' + String(value))
}

async function writeFile(path, data, options) {
  const encoding = typeof options === 'string' ? options : options?.encoding
  const flag = options?.flag ?? 'w'
  if (!WRITE_FILE_FLAGS.includes(flag)) throw gapError('fs.promises.writeFile with flag ' + flag)
  const signal = options?.signal
  if (signal !== undefined) {
    if (signal === null || typeof signal !== 'object' || !('aborted' in signal)) throw invalidArgType('options.signal', signal, 'AbortSignal')
    if (signal.aborted) throw abortError(signal)
  }
  if (options?.flush !== undefined && typeof options.flush !== 'boolean') throw codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "options.flush" property must be of type boolean. Received ' + describeReceived(options.flush))
  const mode = modeOf(options?.mode)
  const bytes = typeof data === 'string' ? CODECS[encodingOf(encoding)].encode(data) : data
  const handle = await tjs.open(path, flag, mode).catch((error) => {
    throw fsPathError(error, 'open', path)
  })
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
  readlink,
  realpath,
  rename,
  symlink,
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

const INVALID_HEADER_CHAR = /[^\t\x20-\x7e\x80-\xff]/

function validateHeaderValue(name, value) {
  if (value === undefined) throw codedError(TypeError, 'ERR_HTTP_INVALID_HEADER_VALUE', 'Invalid value "undefined" for header "' + name + '"')
  if (INVALID_HEADER_CHAR.test(value)) throw codedError(TypeError, 'ERR_INVALID_CHAR', 'Invalid character in header content ["' + name + '"]')
}

function hasOwnKey(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function codedError(Type, code, message) {
  return Object.assign(new Type(message), { code })
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
    if (strict) throw codedError(TypeError, 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE', "Option '" + optionLabel(name, option) + "' argument missing")
    tokens.push({ kind: 'option', name, rawName, index })
    return 0
  }
  if (strict && next.startsWith('-')) throw codedError(TypeError, 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE', ambiguousValueMessage(rawName, name, option))
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
    if (option.type === 'boolean' && strict) throw codedError(TypeError, 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE', "Option '" + optionLabel(name, option) + "' does not take an argument")
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
    if (strict) throw codedError(TypeError, 'ERR_PARSE_ARGS_UNKNOWN_OPTION', unknownOptionMessage(token.rawName, allowPositionals))
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
      if (!allowPositionals) throw codedError(TypeError, 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL', "Unexpected argument '" + token.value + "'. This command does not take positional arguments")
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
  #encoding
  #lastChar = new Uint8Array(4)
  #lastNeed = 0
  #lastTotal = 0

  constructor(encoding = 'utf8') {
    this.#encoding = encodingOf(encoding)
  }

  write(bytes) {
    if (this.#encoding === 'utf8') return this.#decoder.decode(bytes, { stream: true })
    let text = ''
    let offset = 0
    if (this.#lastNeed > 0) {
      const count = Math.min(this.#lastNeed, bytes.length)
      this.#lastChar.set(bytes.subarray(0, count), this.#lastTotal - this.#lastNeed)
      this.#lastNeed -= count
      if (this.#lastNeed > 0) return ''
      text = CODECS[this.#encoding].decode(this.#lastChar.subarray(0, this.#lastTotal))
      offset = count
    }
    return offset < bytes.length ? text + this.#text(bytes, offset) : text
  }

  end(bytes) {
    if (this.#encoding === 'utf8') return bytes === undefined ? this.#decoder.decode() : this.#decoder.decode(bytes)
    const text = bytes === undefined || bytes.length === 0 ? '' : this.write(bytes)
    if (this.#lastNeed === 0) return text
    return text + CODECS[this.#encoding].decode(this.#lastChar.subarray(0, this.#lastTotal - this.#lastNeed))
  }

  #text(bytes, offset) {
    if (this.#encoding === 'utf16le') return this.#utf16Text(bytes, offset)
    if (this.#encoding === 'base64' || this.#encoding === 'base64url') return this.#base64Text(bytes, offset)
    return CODECS[this.#encoding].decode(bytes.subarray(offset))
  }

  #utf16Text(bytes, offset) {
    if ((bytes.length - offset) % 2 === 1) {
      this.#lastNeed = 1
      this.#lastTotal = 2
      this.#lastChar[0] = bytes[bytes.length - 1]
      return CODECS.utf16le.decode(bytes.subarray(offset, bytes.length - 1))
    }
    const text = CODECS.utf16le.decode(bytes.subarray(offset))
    const last = text.charCodeAt(text.length - 1)
    if (last >= 0xd800 && last <= 0xdbff) {
      this.#lastNeed = 2
      this.#lastTotal = 4
      this.#lastChar[0] = bytes[bytes.length - 2]
      this.#lastChar[1] = bytes[bytes.length - 1]
      return text.slice(0, -1)
    }
    return text
  }

  #base64Text(bytes, offset) {
    const rest = (bytes.length - offset) % 3
    if (rest === 0) return CODECS[this.#encoding].decode(bytes.subarray(offset))
    this.#lastNeed = 3 - rest
    this.#lastTotal = 3
    this.#lastChar.set(bytes.subarray(bytes.length - rest), 0)
    return CODECS[this.#encoding].decode(bytes.subarray(offset, bytes.length - rest))
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

const PLATFORM_BY_UNAME = { Linux: 'linux', Darwin: 'darwin', FreeBSD: 'freebsd', OpenBSD: 'openbsd', SunOS: 'sunos', AIX: 'aix' }

async function kernelName() {
  const child = tjs.spawn(['uname', '-s'], { stdout: 'pipe', stderr: 'pipe' })
  const name = new TextDecoder().decode(await child.stdout.bytes()).trim()
  await child.wait()
  return name
}

const osPlatform = await kernelName().then(
  (name) => (Object.hasOwn(PLATFORM_BY_UNAME, name) ? PLATFORM_BY_UNAME[name] : undefined),
  () => undefined,
)

const processObject = withGaps('process', {
  ...(osPlatform === undefined ? {} : { platform: osPlatform }),
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

const osRelease = await tjs.readFile('/proc/sys/kernel/osrelease').then(
  (bytes) => utf8Decoder.decode(bytes).trimEnd(),
  (error) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  },
)

const STAT_WATCH_DEFAULT_INTERVAL = 5007
const STAT_WATCH_COMPARED_FIELDS = ['dev', 'mode', 'nlink', 'uid', 'gid', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'birthtimeMs']
const statWatchers = new Map()

function zeroRawStat() {
  return {
    dev: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    blksize: 0,
    ino: 0,
    size: 0,
    blocks: 0,
    atim: new Date(0),
    mtim: new Date(0),
    ctim: new Date(0),
    birthtim: new Date(0),
    ...Object.fromEntries(FILE_TYPE_FLAGS.map((flag) => [flag, false])),
  }
}

async function statOrNull(path) {
  try {
    return statsOf(await tjs.stat(path))
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    return null
  }
}

function statsDiffer(a, b) {
  return STAT_WATCH_COMPARED_FIELDS.some((field) => a[field] !== b[field])
}

async function pollStatWatcher(path, entry) {
  if (entry.polling) return
  entry.polling = true
  let found
  try {
    found = await statOrNull(path)
  } finally {
    entry.polling = false
  }
  if (statWatchers.get(path) !== entry) return
  const curr = found ?? statsOf(zeroRawStat())
  if (entry.prev === undefined) {
    entry.prev = curr
    if (found !== null) return
  } else if (!statsDiffer(entry.prev, curr)) {
    return
  }
  const prev = entry.prev
  entry.prev = curr
  for (const listener of [...entry.listeners]) listener(curr, prev)
}

function watchFile(path, options, listener) {
  const fn = typeof options === 'function' ? options : listener
  const interval = typeof options === 'function' ? STAT_WATCH_DEFAULT_INTERVAL : (options?.interval ?? STAT_WATCH_DEFAULT_INTERVAL)
  let entry = statWatchers.get(path)
  if (entry === undefined) {
    entry = { listeners: new Set(), prev: undefined, polling: false, timer: undefined }
    entry.timer = setInterval(() => pollStatWatcher(path, entry), interval)
    statWatchers.set(path, entry)
  }
  entry.listeners.add(fn)
}

function unwatchFile(path, listener) {
  const entry = statWatchers.get(path)
  if (entry === undefined) return
  if (listener !== undefined) {
    entry.listeners.delete(listener)
    if (entry.listeners.size > 0) return
  }
  clearInterval(entry.timer)
  statWatchers.delete(path)
}

const UINT64_MASK = (1n << 64n) - 1n
const HASH_PRIMES = firstPrimes(80)
const MD5_CONSTANTS = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32))
const SHA256_CONSTANTS = HASH_PRIMES.slice(0, 64).map((prime) => Number(integerRoot(BigInt(prime) << 96n, 3n) & 0xffffffffn))
const SHA256_INITIAL = HASH_PRIMES.slice(0, 8).map((prime) => Number(integerRoot(BigInt(prime) << 64n, 2n) & 0xffffffffn))
const SHA512_CONSTANTS = HASH_PRIMES.map((prime) => integerRoot(BigInt(prime) << 192n, 3n) & UINT64_MASK)
const SHA512_INITIAL = HASH_PRIMES.slice(0, 8).map((prime) => integerRoot(BigInt(prime) << 128n, 2n) & UINT64_MASK)
const SHA224_INITIAL = HASH_PRIMES.slice(8, 16).map((prime) => Number(integerRoot(BigInt(prime) << 128n, 2n) & 0xffffffffn))
const SHA384_INITIAL = HASH_PRIMES.slice(8, 16).map((prime) => integerRoot(BigInt(prime) << 128n, 2n) & UINT64_MASK)

function firstPrimes(count) {
  const primes = []
  for (let candidate = 2; primes.length < count; candidate++) {
    if (primes.every((prime) => candidate % prime !== 0)) primes.push(candidate)
  }
  return primes
}

function integerRoot(value, degree) {
  let root = 1n << BigInt(Math.ceil(value.toString(2).length / Number(degree)))
  for (;;) {
    const next = ((degree - 1n) * root + value / root ** (degree - 1n)) / degree
    if (next >= root) return root
    root = next
  }
}

function rotl32(value, bits) {
  return (value << bits) | (value >>> (32 - bits))
}

function rotr32(value, bits) {
  return (value >>> bits) | (value << (32 - bits))
}

function rotr64(value, bits) {
  return ((value >> bits) | (value << (64n - bits))) & UINT64_MASK
}

function padMessage(bytes, blockBytes, lengthBytes, littleEndian) {
  const paddedLength = Math.ceil((bytes.length + 1 + lengthBytes) / blockBytes) * blockBytes
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  const bits = BigInt(bytes.length) * 8n
  const high = Number(bits >> 32n)
  const low = Number(bits & 0xffffffffn)
  if (littleEndian) {
    view.setUint32(paddedLength - 8, low, true)
    view.setUint32(paddedLength - 4, high, true)
  } else {
    view.setUint32(paddedLength - 8, high, false)
    view.setUint32(paddedLength - 4, low, false)
  }
  return padded
}

function wordsToBytes(words, littleEndian) {
  const bytes = new Uint8Array(words.length * 4)
  const view = new DataView(bytes.buffer)
  words.forEach((word, i) => view.setUint32(i * 4, word, littleEndian))
  return bytes
}

function md5Round(round, b, c, d) {
  if (round < 16) return [(b & c) | (~b & d), round]
  if (round < 32) return [(d & b) | (~d & c), (5 * round + 1) % 16]
  if (round < 48) return [b ^ c ^ d, (3 * round + 5) % 16]
  return [c ^ (b | ~d), (7 * round) % 16]
}

const MD5_SHIFTS = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]

function md5Digest(bytes) {
  const blocks = padMessage(bytes, 64, 8, true)
  const view = new DataView(blocks.buffer)
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]
  for (let offset = 0; offset < blocks.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, i) => view.getUint32(offset + i * 4, true))
    let [a, b, c, d] = state
    for (let i = 0; i < 64; i++) {
      const [f, g] = md5Round(i, b, c, d)
      const next = (b + rotl32((a + f + MD5_CONSTANTS[i] + words[g]) | 0, MD5_SHIFTS[i])) | 0
      a = d
      d = c
      c = b
      b = next
    }
    const working = [a, b, c, d]
    state.forEach((value, j) => {
      state[j] = (value + working[j]) | 0
    })
  }
  return wordsToBytes(state, true)
}

function sha1Round(round, b, c, d) {
  if (round < 20) return [(b & c) | (~b & d), 0x5a827999]
  if (round < 40) return [b ^ c ^ d, 0x6ed9eba1]
  if (round < 60) return [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
  return [b ^ c ^ d, 0xca62c1d6]
}

function sha1Digest(bytes) {
  const blocks = padMessage(bytes, 64, 8, false)
  const view = new DataView(blocks.buffer)
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  for (let offset = 0; offset < blocks.length; offset += 64) {
    const w = Array.from({ length: 80 }, (_, i) => (i < 16 ? view.getUint32(offset + i * 4) : 0))
    for (let i = 16; i < 80; i++) w[i] = rotl32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let [a, b, c, d, e] = state
    for (let i = 0; i < 80; i++) {
      const [f, k] = sha1Round(i, b, c, d)
      const temp = (rotl32(a, 5) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = rotl32(b, 30)
      b = a
      a = temp
    }
    const working = [a, b, c, d, e]
    state.forEach((value, j) => {
      state[j] = (value + working[j]) | 0
    })
  }
  return wordsToBytes(state, false)
}

function sha256Digest(bytes, initial = SHA256_INITIAL, length = 32) {
  const blocks = padMessage(bytes, 64, 8, false)
  const view = new DataView(blocks.buffer)
  const state = initial.slice()
  for (let offset = 0; offset < blocks.length; offset += 64) {
    const w = Array.from({ length: 64 }, (_, i) => (i < 16 ? view.getUint32(offset + i * 4) : 0))
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, h] = state
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + sigma1 + choice + SHA256_CONSTANTS[i] + w[i]) | 0
      const sigma0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sigma0 + majority) | 0
      h = g
      g = f
      f = e
      e = (d + temp1) | 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) | 0
    }
    const working = [a, b, c, d, e, f, g, h]
    state.forEach((value, j) => {
      state[j] = (value + working[j]) | 0
    })
  }
  return wordsToBytes(state, false).subarray(0, length)
}

function sha512Digest(bytes, initial = SHA512_INITIAL, length = 64) {
  const blocks = padMessage(bytes, 128, 16, false)
  const view = new DataView(blocks.buffer)
  const state = initial.slice()
  for (let offset = 0; offset < blocks.length; offset += 128) {
    const w = Array.from({ length: 80 }, (_, i) => (i < 16 ? view.getBigUint64(offset + i * 8) : 0n))
    for (let i = 16; i < 80; i++) {
      const s0 = rotr64(w[i - 15], 1n) ^ rotr64(w[i - 15], 8n) ^ (w[i - 15] >> 7n)
      const s1 = rotr64(w[i - 2], 19n) ^ rotr64(w[i - 2], 61n) ^ (w[i - 2] >> 6n)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & UINT64_MASK
    }
    let [a, b, c, d, e, f, g, h] = state
    for (let i = 0; i < 80; i++) {
      const sigma1 = rotr64(e, 14n) ^ rotr64(e, 18n) ^ rotr64(e, 41n)
      const choice = (e & f) ^ ((e ^ UINT64_MASK) & g)
      const temp1 = (h + sigma1 + choice + SHA512_CONSTANTS[i] + w[i]) & UINT64_MASK
      const sigma0 = rotr64(a, 28n) ^ rotr64(a, 34n) ^ rotr64(a, 39n)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sigma0 + majority) & UINT64_MASK
      h = g
      g = f
      f = e
      e = (d + temp1) & UINT64_MASK
      d = c
      c = b
      b = a
      a = (temp1 + temp2) & UINT64_MASK
    }
    const working = [a, b, c, d, e, f, g, h]
    state.forEach((value, j) => {
      state[j] = (value + working[j]) & UINT64_MASK
    })
  }
  const bytes64 = new Uint8Array(64)
  const view64 = new DataView(bytes64.buffer)
  state.forEach((word, i) => view64.setBigUint64(i * 8, word))
  return bytes64.subarray(0, length)
}

function sha512TruncatedInitial(truncatedBits) {
  const digest = sha512Digest(Buffer.from('SHA-512/' + truncatedBits), SHA512_INITIAL.map((word) => word ^ 0xa5a5a5a5a5a5a5a5n))
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)
  return Array.from({ length: 8 }, (_, i) => view.getBigUint64(i * 8))
}

const SHA512_224_INITIAL = sha512TruncatedInitial(224)
const SHA512_256_INITIAL = sha512TruncatedInitial(256)

function keccakRcBit(t) {
  if (t % 255 === 0) return 1
  const bits = [1, 0, 0, 0, 0, 0, 0, 0]
  for (let i = 1; i <= t % 255; i++) {
    bits.unshift(0)
    bits[0] ^= bits[8]
    bits[4] ^= bits[8]
    bits[5] ^= bits[8]
    bits[6] ^= bits[8]
    bits.length = 8
  }
  return bits[0]
}

const KECCAK_ROUND_CONSTANTS = Array.from({ length: 24 }, (_, round) => {
  let constant = 0n
  for (let j = 0; j <= 6; j++) if (keccakRcBit(j + 7 * round) === 1) constant |= 1n << BigInt((1 << j) - 1)
  return constant
})

const KECCAK_ROTATIONS = (() => {
  const rotations = new Array(25).fill(0)
  let x = 1
  let y = 0
  for (let t = 0; t < 24; t++) {
    rotations[x + 5 * y] = ((t + 1) * (t + 2) / 2) % 64
    const nextY = (2 * x + 3 * y) % 5
    x = y
    y = nextY
  }
  return rotations
})()

function keccakRotl(value, bits) {
  if (bits === 0) return value
  const shift = BigInt(bits)
  return ((value << shift) | (value >> (64n - shift))) & UINT64_MASK
}

function keccakPermute(state) {
  for (let round = 0; round < 24; round++) {
    const columns = Array.from({ length: 5 }, (_, x) => state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20])
    const offsets = columns.map((_, x) => columns[(x + 4) % 5] ^ keccakRotl(columns[(x + 1) % 5], 1))
    for (let i = 0; i < 25; i++) state[i] ^= offsets[i % 5]
    const permuted = new Array(25)
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) permuted[y + 5 * ((2 * x + 3 * y) % 5)] = keccakRotl(state[x + 5 * y], KECCAK_ROTATIONS[x + 5 * y])
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) state[x + 5 * y] = permuted[x + 5 * y] ^ ((permuted[((x + 1) % 5) + 5 * y] ^ UINT64_MASK) & permuted[((x + 2) % 5) + 5 * y])
    }
    state[0] ^= KECCAK_ROUND_CONSTANTS[round]
  }
  return state
}

function keccakDigest(bytes, rate, domain, length) {
  const total = (Math.floor(bytes.length / rate) + 1) * rate
  const padded = new Uint8Array(total)
  padded.set(bytes)
  padded[bytes.length] ^= domain
  padded[total - 1] ^= 0x80
  const view = new DataView(padded.buffer)
  const state = new Array(25).fill(0n)
  for (let offset = 0; offset < total; offset += rate) {
    for (let i = 0; i < rate / 8; i++) state[i] ^= view.getBigUint64(offset + 8 * i, true)
    keccakPermute(state)
  }
  const output = new Uint8Array(length)
  for (let offset = 0; offset < length; offset += rate) {
    const lanes = new Uint8Array(200)
    const laneView = new DataView(lanes.buffer)
    state.forEach((lane, i) => laneView.setBigUint64(i * 8, lane, true))
    output.set(lanes.subarray(0, Math.min(rate, length - offset)), offset)
    if (offset + rate < length) keccakPermute(state)
  }
  return output
}

const RIPEMD_RHO = [7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8]

const RIPEMD_SHIFTS = [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5],
]

const RIPEMD_LEFT_K = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e]
const RIPEMD_RIGHT_K = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000]

function ripemdSchedule(first) {
  const groups = [first]
  for (let group = 1; group < 5; group++) groups.push(groups[group - 1].map((word) => RIPEMD_RHO[word]))
  return groups
}

const RIPEMD_LEFT_WORDS = ripemdSchedule(Array.from({ length: 16 }, (_, i) => i))
const RIPEMD_RIGHT_WORDS = ripemdSchedule(Array.from({ length: 16 }, (_, i) => (9 * i + 5) % 16))
const RIPEMD_LEFT_SHIFTS = RIPEMD_LEFT_WORDS.map((words, group) => words.map((word) => RIPEMD_SHIFTS[group][word]))
const RIPEMD_RIGHT_SHIFTS = RIPEMD_RIGHT_WORDS.map((words, group) => words.map((word) => RIPEMD_SHIFTS[group][word]))

function ripemdFunction(group, x, y, z) {
  if (group === 0) return x ^ y ^ z
  if (group === 1) return (x & y) | (~x & z)
  if (group === 2) return (x | ~y) ^ z
  if (group === 3) return (x & z) | (y & ~z)
  return x ^ (y | ~z)
}

function ripemd160Digest(bytes) {
  const blocks = padMessage(bytes, 64, 8, true)
  const view = new DataView(blocks.buffer)
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  for (let offset = 0; offset < blocks.length; offset += 64) {
    const x = Array.from({ length: 16 }, (_, i) => view.getUint32(offset + i * 4, true))
    let [al, bl, cl, dl, el] = state
    let [ar, br, cr, dr, er] = state
    for (let group = 0; group < 5; group++) {
      for (let step = 0; step < 16; step++) {
        let t = (rotl32((al + ripemdFunction(group, bl, cl, dl) + x[RIPEMD_LEFT_WORDS[group][step]] + RIPEMD_LEFT_K[group]) | 0, RIPEMD_LEFT_SHIFTS[group][step]) + el) | 0
        al = el
        el = dl
        dl = rotl32(cl, 10)
        cl = bl
        bl = t
        t = (rotl32((ar + ripemdFunction(4 - group, br, cr, dr) + x[RIPEMD_RIGHT_WORDS[group][step]] + RIPEMD_RIGHT_K[group]) | 0, RIPEMD_RIGHT_SHIFTS[group][step]) + er) | 0
        ar = er
        er = dr
        dr = rotl32(cr, 10)
        cr = br
        br = t
      }
    }
    const t = (state[1] + cl + dr) | 0
    state[1] = (state[2] + dl + er) | 0
    state[2] = (state[3] + el + ar) | 0
    state[3] = (state[4] + al + br) | 0
    state[4] = (state[0] + bl + cr) | 0
    state[0] = t
  }
  return wordsToBytes(state, true)
}

const BLAKE2_SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
]

function blake2Blocks(bytes, blockBytes) {
  const count = Math.max(1, Math.ceil(bytes.length / blockBytes))
  return Array.from({ length: count }, (_, index) => {
    const start = index * blockBytes
    const block = new Uint8Array(blockBytes)
    block.set(bytes.subarray(start, start + blockBytes))
    const last = index === count - 1
    return { block, counter: last ? bytes.length : start + blockBytes, last }
  })
}

function blake2bDigest(bytes, length) {
  const state = SHA512_INITIAL.slice()
  state[0] ^= 0x01010000n ^ BigInt(length)
  for (const { block, counter, last } of blake2Blocks(bytes, 128)) {
    const view = new DataView(block.buffer)
    const m = Array.from({ length: 16 }, (_, i) => view.getBigUint64(i * 8, true))
    const v = [...state, ...SHA512_INITIAL]
    v[12] ^= BigInt(counter)
    if (last) v[14] ^= UINT64_MASK
    const mix = (a, b, c, d, x, y) => {
      v[a] = (v[a] + v[b] + x) & UINT64_MASK
      v[d] = rotr64(v[d] ^ v[a], 32n)
      v[c] = (v[c] + v[d]) & UINT64_MASK
      v[b] = rotr64(v[b] ^ v[c], 24n)
      v[a] = (v[a] + v[b] + y) & UINT64_MASK
      v[d] = rotr64(v[d] ^ v[a], 16n)
      v[c] = (v[c] + v[d]) & UINT64_MASK
      v[b] = rotr64(v[b] ^ v[c], 63n)
    }
    for (let round = 0; round < 12; round++) {
      const s = BLAKE2_SIGMA[round % 10]
      mix(0, 4, 8, 12, m[s[0]], m[s[1]])
      mix(1, 5, 9, 13, m[s[2]], m[s[3]])
      mix(2, 6, 10, 14, m[s[4]], m[s[5]])
      mix(3, 7, 11, 15, m[s[6]], m[s[7]])
      mix(0, 5, 10, 15, m[s[8]], m[s[9]])
      mix(1, 6, 11, 12, m[s[10]], m[s[11]])
      mix(2, 7, 8, 13, m[s[12]], m[s[13]])
      mix(3, 4, 9, 14, m[s[14]], m[s[15]])
    }
    for (let i = 0; i < 8; i++) state[i] ^= v[i] ^ v[i + 8]
  }
  const out = new Uint8Array(64)
  const view = new DataView(out.buffer)
  state.forEach((word, i) => view.setBigUint64(i * 8, word, true))
  return out.slice(0, length)
}

function blake2sDigest(bytes, length) {
  const state = SHA256_INITIAL.slice()
  state[0] ^= 0x01010000 ^ length
  for (const { block, counter, last } of blake2Blocks(bytes, 64)) {
    const view = new DataView(block.buffer)
    const m = Array.from({ length: 16 }, (_, i) => view.getUint32(i * 4, true))
    const v = [...state, ...SHA256_INITIAL]
    v[12] ^= counter
    if (last) v[14] ^= 0xffffffff
    const mix = (a, b, c, d, x, y) => {
      v[a] = (v[a] + v[b] + x) | 0
      v[d] = rotr32(v[d] ^ v[a], 16)
      v[c] = (v[c] + v[d]) | 0
      v[b] = rotr32(v[b] ^ v[c], 12)
      v[a] = (v[a] + v[b] + y) | 0
      v[d] = rotr32(v[d] ^ v[a], 8)
      v[c] = (v[c] + v[d]) | 0
      v[b] = rotr32(v[b] ^ v[c], 7)
    }
    for (let round = 0; round < 10; round++) {
      const s = BLAKE2_SIGMA[round]
      mix(0, 4, 8, 12, m[s[0]], m[s[1]])
      mix(1, 5, 9, 13, m[s[2]], m[s[3]])
      mix(2, 6, 10, 14, m[s[4]], m[s[5]])
      mix(3, 7, 11, 15, m[s[6]], m[s[7]])
      mix(0, 5, 10, 15, m[s[8]], m[s[9]])
      mix(1, 6, 11, 12, m[s[10]], m[s[11]])
      mix(2, 7, 8, 13, m[s[12]], m[s[13]])
      mix(3, 4, 9, 14, m[s[14]], m[s[15]])
    }
    for (let i = 0; i < 8; i++) state[i] ^= v[i] ^ v[i + 8]
  }
  const out = new Uint8Array(32)
  const view = new DataView(out.buffer)
  state.forEach((word, i) => view.setUint32(i * 4, word, true))
  return out.slice(0, length)
}

const HASH_FUNCTIONS = {
  md5: md5Digest,
  sha1: sha1Digest,
  sha224: (bytes) => sha256Digest(bytes, SHA224_INITIAL, 28),
  sha256: sha256Digest,
  sha384: (bytes) => sha512Digest(bytes, SHA384_INITIAL, 48),
  sha512: sha512Digest,
  'sha512-224': (bytes) => sha512Digest(bytes, SHA512_224_INITIAL, 28),
  'sha512-256': (bytes) => sha512Digest(bytes, SHA512_256_INITIAL, 32),
  ripemd160: ripemd160Digest,
  blake2b512: (bytes) => blake2bDigest(bytes, 64),
  blake2s256: (bytes) => blake2sDigest(bytes, 32),
  'sha3-224': (bytes) => keccakDigest(bytes, 144, 0x06, 28),
  'sha3-256': (bytes) => keccakDigest(bytes, 136, 0x06, 32),
  'sha3-384': (bytes) => keccakDigest(bytes, 104, 0x06, 48),
  'sha3-512': (bytes) => keccakDigest(bytes, 72, 0x06, 64),
  shake128: (bytes, length = 16) => keccakDigest(bytes, 168, 0x1f, length),
  shake256: (bytes, length = 32) => keccakDigest(bytes, 136, 0x1f, length),
}

function concatBytes(chunks) {
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

function hashInput(data, inputEncoding) {
  if (typeof data === 'string') return Buffer.from(data, inputEncoding ?? 'utf8')
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  throw codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received type ' + typeof data + ' (' + String(data) + ')')
}

function hashFinalizedError() {
  const error = new Error('Digest already called')
  error.code = 'ERR_CRYPTO_HASH_FINALIZED'
  return error
}

class Hash {
  constructor(algorithm, outputLength) {
    this.algorithm = algorithm
    this.outputLength = outputLength
    this.chunks = []
    this.finalized = false
  }

  update(data, inputEncoding) {
    if (this.finalized) throw hashFinalizedError()
    this.chunks.push(hashInput(data, inputEncoding))
    return this
  }

  digest(encoding) {
    if (this.finalized) throw hashFinalizedError()
    this.finalized = true
    const buffer = Buffer.from(HASH_FUNCTIONS[this.algorithm](concatBytes(this.chunks), this.outputLength))
    return encoding === undefined || encoding === 'buffer' ? buffer : buffer.toString(encoding)
  }
}

function createHash(algorithm, options) {
  const name = String(algorithm).toLowerCase()
  const key = Object.keys(options ?? {}).find((option) => option !== 'outputLength')
  if (key !== undefined) throw gapError('crypto.createHash option ' + key)
  if (!Object.hasOwn(HASH_FUNCTIONS, name)) throw gapError('crypto.createHash ' + name)
  const outputLength = options?.outputLength
  if (outputLength !== undefined) {
    if (typeof outputLength !== 'number') throw codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "options.outputLength" property must be of type number. Received ' + describeReceived(outputLength))
    if (!Number.isInteger(outputLength)) throw outOfRangeError('options.outputLength', 'an integer', outputLength)
    if (outputLength < 0 || outputLength > 4294967295) throw outOfRangeError('options.outputLength', '>= 0 && <= 4294967295', outputLength)
    if (!name.startsWith('shake') && outputLength !== HASH_FUNCTIONS[name](new Uint8Array()).length) throw codedError(Error, 'ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH', 'error:030000B2:digital envelope routines::not XOF or invalid length')
  }
  return new Hash(name, name.startsWith('shake') ? outputLength : undefined)
}

const DEFLATE_LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const DEFLATE_LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DEFLATE_DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DEFLATE_DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function zlibError(message, code, errno) {
  const error = new Error(message)
  error.code = code
  error.errno = errno
  return error
}

const dataError = (message) => zlibError(message, 'Z_DATA_ERROR', -3)
const truncatedError = () => zlibError('unexpected end of file', 'Z_BUF_ERROR', -5)

function buildHuffman(lengths) {
  const counts = new Array(16).fill(0)
  for (const length of lengths) counts[length]++
  const offsets = new Array(16).fill(0)
  for (let length = 1; length < 15; length++) offsets[length + 1] = offsets[length] + counts[length]
  const symbols = new Array(lengths.length)
  lengths.forEach((length, symbol) => {
    if (length !== 0) symbols[offsets[length]++] = symbol
  })
  return { counts, symbols }
}

const FIXED_LITERAL = buildHuffman([...new Array(144).fill(8), ...new Array(112).fill(9), ...new Array(24).fill(7), ...new Array(8).fill(8)])
const FIXED_DISTANCE = buildHuffman(new Array(30).fill(5))

class InflateReader {
  constructor(bytes, position) {
    this.bytes = bytes
    this.position = position
    this.bitBuffer = 0
    this.bitCount = 0
  }

  byte() {
    if (this.position >= this.bytes.length) throw truncatedError()
    return this.bytes[this.position++]
  }

  bits(count) {
    let value = 0
    for (let i = 0; i < count; i++) {
      if (this.bitCount === 0) {
        this.bitBuffer = this.byte()
        this.bitCount = 8
      }
      value |= (this.bitBuffer & 1) << i
      this.bitBuffer >>>= 1
      this.bitCount--
    }
    return value
  }

  alignToByte() {
    this.bitBuffer = 0
    this.bitCount = 0
  }
}

class InflateSink {
  constructor() {
    this.bytes = new Uint8Array(4096)
    this.length = 0
  }

  push(byte) {
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2)
      grown.set(this.bytes)
      this.bytes = grown
    }
    this.bytes[this.length++] = byte
  }

  copyBack(distance, count) {
    for (let i = 0; i < count; i++) this.push(this.bytes[this.length - distance])
  }

  output() {
    return this.bytes.slice(0, this.length)
  }
}

function decodeSymbol(reader, huffman) {
  let code = 0
  let first = 0
  let index = 0
  for (let length = 1; length <= 15; length++) {
    code |= reader.bits(1)
    const count = huffman.counts[length]
    if (code - count < first) return huffman.symbols[index + (code - first)]
    index += count
    first += count
    first <<= 1
    code <<= 1
  }
  throw dataError('invalid code')
}

function readDynamicTables(reader) {
  const literalCount = reader.bits(5) + 257
  const distanceCount = reader.bits(5) + 1
  const codeLengthCount = reader.bits(4) + 4
  if (literalCount > 286 || distanceCount > 30) throw dataError('too many length or distance symbols')
  const codeLengths = new Array(19).fill(0)
  for (let i = 0; i < codeLengthCount; i++) codeLengths[CODE_LENGTH_ORDER[i]] = reader.bits(3)
  const codeLengthCode = buildHuffman(codeLengths)
  const lengths = []
  const repeat = (value, count) => {
    for (let i = 0; i < count; i++) lengths.push(value)
  }
  while (lengths.length < literalCount + distanceCount) {
    const symbol = decodeSymbol(reader, codeLengthCode)
    if (symbol < 16) {
      lengths.push(symbol)
    } else if (symbol === 16) {
      if (lengths.length === 0) throw dataError('invalid bit length repeat')
      repeat(lengths[lengths.length - 1], 3 + reader.bits(2))
    } else if (symbol === 17) {
      repeat(0, 3 + reader.bits(3))
    } else {
      repeat(0, 11 + reader.bits(7))
    }
  }
  if (lengths.length > literalCount + distanceCount) throw dataError('invalid bit length repeat')
  return {
    literal: buildHuffman(lengths.slice(0, literalCount)),
    distance: buildHuffman(lengths.slice(literalCount)),
  }
}

function inflateStored(reader, sink) {
  reader.alignToByte()
  const length = reader.byte() | (reader.byte() << 8)
  const complement = reader.byte() | (reader.byte() << 8)
  if ((length ^ 0xffff) !== complement) throw dataError('invalid stored block lengths')
  for (let i = 0; i < length; i++) sink.push(reader.byte())
}

function inflateCodes(reader, sink, literal, distance) {
  for (;;) {
    const symbol = decodeSymbol(reader, literal)
    if (symbol < 256) {
      sink.push(symbol)
    } else if (symbol === 256) {
      return
    } else {
      const lengthCode = symbol - 257
      if (lengthCode >= DEFLATE_LENGTH_BASE.length) throw dataError('invalid literal/length code')
      const length = DEFLATE_LENGTH_BASE[lengthCode] + reader.bits(DEFLATE_LENGTH_EXTRA[lengthCode])
      const distanceCode = decodeSymbol(reader, distance)
      if (distanceCode >= DEFLATE_DISTANCE_BASE.length) throw dataError('invalid distance code')
      const back = DEFLATE_DISTANCE_BASE[distanceCode] + reader.bits(DEFLATE_DISTANCE_EXTRA[distanceCode])
      if (back > sink.length) throw dataError('invalid distance too far back')
      sink.copyBack(back, length)
    }
  }
}

function inflateBlocks(reader, sink) {
  for (;;) {
    const last = reader.bits(1)
    const type = reader.bits(2)
    if (type === 0) {
      inflateStored(reader, sink)
    } else if (type === 1) {
      inflateCodes(reader, sink, FIXED_LITERAL, FIXED_DISTANCE)
    } else if (type === 2) {
      const tables = readDynamicTables(reader)
      inflateCodes(reader, sink, tables.literal, tables.distance)
    } else {
      throw dataError('invalid block type')
    }
    if (last) return
  }
}

function skipZeroTerminated(reader) {
  let byte
  do {
    byte = reader.byte()
  } while (byte !== 0)
}

function readUint32LittleEndian(reader) {
  return (reader.byte() | (reader.byte() << 8) | (reader.byte() << 16) | (reader.byte() << 24)) >>> 0
}

function gunzipMember(bytes, offset, sink) {
  if (bytes.length - offset < 2) throw truncatedError()
  if (bytes[offset] !== 0x1f || bytes[offset + 1] !== 0x8b) throw dataError('incorrect header check')
  const reader = new InflateReader(bytes, offset + 2)
  if (reader.byte() !== 8) throw dataError('unknown compression method')
  const flags = reader.byte()
  for (let i = 0; i < 6; i++) reader.byte()
  if (flags & 4) {
    const extraLength = reader.byte() | (reader.byte() << 8)
    for (let i = 0; i < extraLength; i++) reader.byte()
  }
  if (flags & 8) skipZeroTerminated(reader)
  if (flags & 16) skipZeroTerminated(reader)
  if (flags & 2) {
    const headerCrc = reader.byte() | (reader.byte() << 8)
    if (headerCrc !== (crc32(bytes.subarray(offset, reader.position - 2)) & 0xffff)) throw dataError('header crc mismatch')
  }
  const start = sink.length
  inflateBlocks(reader, sink)
  reader.alignToByte()
  const member = sink.bytes.subarray(start, sink.length)
  if (readUint32LittleEndian(reader) !== crc32(member)) throw dataError('incorrect data check')
  if (readUint32LittleEndian(reader) !== member.length) throw dataError('incorrect length check')
  return reader.position
}

function gunzipBytes(bytes) {
  const sink = new InflateSink()
  let offset = 0
  do {
    offset = gunzipMember(bytes, offset, sink)
  } while (offset < bytes.length)
  return sink.output()
}

function zlibInput(data) {
  if (typeof data === 'string') return Buffer.from(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  throw codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "chunk" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received type ' + typeof data + ' (' + String(data) + ')')
}

function gunzip(buffer, options, callback) {
  const done = typeof options === 'function' ? options : callback
  const input = zlibInput(buffer)
  let output
  let failure
  try {
    output = Buffer.from(gunzipBytes(input))
  } catch (error) {
    failure = error
  }
  setTimeout(() => (failure === undefined ? done(null, output) : done(failure)), 0)
}

const STORED_BLOCK_MAX = 0xffff

function writeUint32LittleEndian(bytes, position, value) {
  bytes[position] = value & 0xff
  bytes[position + 1] = (value >>> 8) & 0xff
  bytes[position + 2] = (value >>> 16) & 0xff
  bytes[position + 3] = (value >>> 24) & 0xff
}

function gzipBytes(bytes) {
  const blockCount = Math.max(1, Math.ceil(bytes.length / STORED_BLOCK_MAX))
  const output = new Uint8Array(10 + blockCount * 5 + bytes.length + 8)
  output.set([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3], 0)
  let position = 10
  for (let offset = 0; ; ) {
    const length = Math.min(STORED_BLOCK_MAX, bytes.length - offset)
    const final = offset + length === bytes.length
    output[position++] = final ? 1 : 0
    output[position++] = length & 0xff
    output[position++] = length >>> 8
    output[position++] = ~length & 0xff
    output[position++] = (~length >>> 8) & 0xff
    output.set(bytes.subarray(offset, offset + length), position)
    position += length
    offset += length
    if (final) break
  }
  writeUint32LittleEndian(output, position, crc32(bytes))
  writeUint32LittleEndian(output, position + 4, bytes.length)
  return output
}

function gzip(buffer, options, callback) {
  const done = typeof options === 'function' ? options : callback
  const output = Buffer.from(gzipBytes(zlibInput(buffer)))
  setTimeout(() => done(null, output), 0)
}

const DEFAULT_HIGH_WATER_MARK = 65536
const tickQueue = []
let tickPending = false

function runTicks() {
  try {
    while (tickQueue.length > 0) tickQueue.shift()()
  } finally {
    tickPending = tickQueue.length > 0
    if (tickPending) Promise.resolve().then(runTicks)
  }
}

function nextTick(callback) {
  tickQueue.push(callback)
  if (tickPending) return
  tickPending = true
  Promise.resolve().then(runTicks)
}

function lastListenerIndex(list, listener) {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const original = list[index].listener
    if (list[index] === listener || (original !== undefined && original === listener)) return index
  }
  return -1
}

class Emitter {
  #listeners = new Map()

  on(name, listener) {
    this.#listenersOf(name).push(listener)
    return this
  }

  once(name, listener) {
    const wrapped = (...args) => {
      Emitter.detach(this, name, wrapped)
      listener(...args)
    }
    wrapped.listener = listener
    return this.on(name, wrapped)
  }

  listenerCount(name) {
    return this.#listenersOf(name).length
  }

  addListener(name, listener) {
    return this.on(name, listener)
  }

  prependListener(name, listener) {
    this.#listenersOf(name).unshift(listener)
    return this
  }

  off(name, listener) {
    return this.removeListener(name, listener)
  }

  removeListener(name, listener) {
    const list = this.#listeners.get(name)
    if (list === undefined) return this
    const index = lastListenerIndex(list, listener)
    if (index === -1) return this
    const [entry] = list.splice(index, 1)
    if (list.length === 0) this.#listeners.delete(name)
    this.emit('removeListener', name, entry.listener ?? entry)
    return this
  }

  removeAllListeners(name) {
    if (name === undefined) {
      for (const key of [...this.#listeners.keys()]) {
        if (key !== 'removeListener') this.removeAllListeners(key)
      }
      return this.removeAllListeners('removeListener')
    }
    const list = this.#listeners.get(name)
    if (list !== undefined) for (const entry of [...list].reverse()) this.removeListener(name, entry)
    return this
  }

  listeners(name) {
    return (this.#listeners.get(name) ?? []).map((entry) => entry.listener ?? entry)
  }

  eventNames() {
    return [...this.#listeners].filter(([, list]) => list.length > 0).map(([name]) => name)
  }

  emit(name, ...args) {
    const list = this.#listenersOf(name)
    if (list.length === 0 && name === 'error') throw args[0]
    for (const listener of [...list]) listener(...args)
    return true
  }

  static prepend(emitter, name, listener) {
    emitter.#listenersOf(name).unshift(listener)
  }

  static detach(emitter, name, listener) {
    const list = emitter.#listeners.get(name)
    if (list === undefined) return
    const index = list.indexOf(listener)
    if (index !== -1) list.splice(index, 1)
    if (list.length === 0) emitter.#listeners.delete(name)
  }

  #listenersOf(name) {
    if (!this.#listeners.has(name)) this.#listeners.set(name, [])
    return this.#listeners.get(name)
  }
}

function assertNoOptions(name, options, allowed) {
  for (const key of Object.keys(options ?? {})) {
    if (!allowed.includes(key)) throw gapError(name + ' option ' + key)
  }
}

function inspectReceived(value) {
  return typeof value === 'string' ? "'" + value + "'" : String(value)
}

function invalidArgValue(property, value) {
  const received = inspectReceived(value)
  return codedError(TypeError, 'ERR_INVALID_ARG_VALUE', "The property '" + property + "' is invalid. Received " + received)
}

function highWaterMarkOf(options, fallback = DEFAULT_HIGH_WATER_MARK, property = 'highWaterMark') {
  const value = options?.highWaterMark
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 0) throw invalidArgValue('options.' + property, value)
  return value
}

function addNumericalSeparator(text) {
  const start = text[0] === '-' ? 1 : 0
  let end = text.length
  let grouped = ''
  for (; end >= start + 4; end -= 3) grouped = '_' + text.slice(end - 3, end) + grouped
  return text.slice(0, end) + grouped
}

function outOfRangeError(property, requirement, value) {
  const large = Number.isInteger(value) && Math.abs(value) > 2 ** 32
  const received = large ? addNumericalSeparator(String(value)) : inspectReceived(value)
  return codedError(RangeError, 'ERR_OUT_OF_RANGE', 'The value of "' + property + '" is out of range. It must be ' + requirement + '. Received ' + received)
}

function positionOf(property, value, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'number') throw codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "' + property + '" argument must be of type number. Received ' + describeReceived(value))
  if (!Number.isInteger(value)) throw outOfRangeError(property, 'an integer', value)
  if (value < 0 || value > Number.MAX_SAFE_INTEGER) throw outOfRangeError(property, '>= 0 && <= 9007199254740991', value)
  return value
}

function bytesOf(chunk, encoding = 'utf8') {
  return typeof chunk === 'string' ? Buffer.from(chunk, encoding) : chunk
}

function fsPathError(error, syscall, path) {
  if (error.code !== 'ENOENT') return error
  return Object.assign(new Error("ENOENT: no such file or directory, " + syscall + " '" + path + "'"), { errno: -2, code: 'ENOENT', syscall, path })
}

function destroyedError() {
  return codedError(Error, 'ERR_STREAM_DESTROYED', 'Cannot call write after a stream was destroyed')
}

class Writable extends Emitter {
  #queue = []
  #writing = null
  #length = 0
  #ending = false
  #prefinished = false
  #destroyed = false
  #needDrain = false
  #finishCallbacks = []
  #failure = null
  #corked = 0
  #defaultEncoding = 'utf8'
  #decodeStrings = true
  #objectMode = false
  #highWaterMark = DEFAULT_HIGH_WATER_MARK

  constructor(options) {
    super()
    assertNoOptions('stream.Writable', options, ['write', 'final', 'writev', 'decodeStrings', 'highWaterMark', 'objectMode'])
    if (options?.write !== undefined) this._write = options.write
    if (options?.final !== undefined) this._final = options.final
    if (options?.writev !== undefined) this._writev = options.writev
    if (options?.decodeStrings === false) this.#decodeStrings = false
    this.#objectMode = Boolean(options?.objectMode)
    this.#highWaterMark = highWaterMarkOf(options, this.#objectMode ? 16 : DEFAULT_HIGH_WATER_MARK)
  }

  get writable() {
    return !this.#ending && !this.#destroyed && this.#failure === null
  }

  get writableNeedDrain() {
    return !this.#ending && !this.#destroyed && this.#needDrain
  }

  get writableCorked() {
    return this.#corked
  }

  cork() {
    this.#corked += 1
  }

  uncork() {
    if (this.#corked === 0) return
    this.#corked -= 1
    this.#drain()
  }

  setDefaultEncoding(encoding) {
    encodingOf(encoding)
    this.#defaultEncoding = String(encoding).toLowerCase()
    return this
  }

  #entryOf(chunk, encoding, callback) {
    if (this.#objectMode) return { chunk, encoding: 'buffer', callback, length: 1 }
    if (typeof chunk !== 'string') return { chunk, encoding: 'buffer', callback, length: chunk.length }
    const enc = encoding || this.#defaultEncoding
    if (!this.#decodeStrings) return { chunk, encoding: enc, callback, length: chunk.length }
    const bytes = Buffer.from(chunk, enc)
    return { chunk: bytes, encoding: 'buffer', callback, length: bytes.length }
  }

  _write(chunk, encoding, callback) {
    callback(codedError(Error, 'ERR_METHOD_NOT_IMPLEMENTED', 'The _write() method is not implemented'))
  }

  _destroy(error, callback) {
    callback()
  }

  write(chunk, encoding, callback) {
    if (typeof encoding === 'function') {
      callback = encoding
      encoding = undefined
    }
    if (this.#ending) {
      const error = codedError(Error, 'ERR_STREAM_WRITE_AFTER_END', 'write after end')
      nextTick(() => callback?.(error))
      this.destroy(error)
      return false
    }
    if (this.#destroyed) {
      nextTick(() => callback?.(destroyedError()))
      return false
    }
    const entry = this.#entryOf(chunk, encoding, callback)
    this.#queue.push(entry)
    this.#length += entry.length
    const ok = this.#length < this.#highWaterMark
    if (!ok) this.#needDrain = true
    this.#drain()
    return ok && !this.#destroyed
  }

  end(chunk, encoding, callback) {
    if (typeof chunk === 'function') {
      callback = chunk
      chunk = undefined
    } else if (typeof encoding === 'function') {
      callback = encoding
      encoding = undefined
    }
    if (chunk !== undefined && chunk !== null) this.write(chunk, encoding)
    if (this.#corked > 0) {
      this.#corked = 0
      this.#drain()
    }
    if (callback !== undefined) this.#finishCallbacks.push(callback)
    if (!this.#ending) {
      this.#ending = true
      this.#prefinish()
    }
    return this
  }

  destroy(error) {
    if (this.#destroyed) return this
    this.#destroyed = true
    if (error !== undefined && error !== null) this.#failure = error
    this._destroy(error, () => {
      if (error !== undefined && error !== null) nextTick(() => this.emit('error', error))
      nextTick(() => this.emit('close'))
    })
    if (this.#writing === null) this.#failBuffered()
    return this
  }

  #drain() {
    if (this.#writing !== null || this.#queue.length === 0 || this.#destroyed || this.#corked > 0) return
    if (this.#queue.length > 1 && typeof this._writev === 'function') {
      const entries = this.#queue.splice(0)
      this.#writing = entries
      this._writev(entries.map(({ chunk, encoding }) => ({ chunk, encoding })), (error) => this.#written(entries, error))
      return
    }
    const entry = this.#queue.shift()
    this.#writing = [entry]
    this._write(entry.chunk, entry.encoding, (error) => this.#written([entry], error))
  }

  #written(entries, error) {
    this.#writing = null
    for (const entry of entries) this.#length -= entry.length
    if (error) {
      for (const entry of entries) nextTick(() => entry.callback?.(error))
      this.#failure = error
      this.#failBuffered()
      this.destroy(error)
      return
    }
    for (const entry of entries) nextTick(() => entry.callback?.())
    if (this.#destroyed) {
      this.#failBuffered()
      return
    }
    this.#drain()
    if (this.#needDrain && this.#length === 0 && !this.#ending && !this.#destroyed) {
      this.#needDrain = false
      nextTick(() => this.emit('drain'))
    }
    this.#prefinish()
  }

  #failBuffered() {
    const error = this.#failure ?? destroyedError()
    for (const entry of this.#queue.splice(0)) nextTick(() => entry.callback?.(error))
    this.#length = 0
  }

  #prefinish() {
    if (!this.#ending || this.#prefinished || this.#writing !== null || this.#queue.length > 0 || this.#destroyed) return
    this.#prefinished = true
    if (typeof this._final === 'function') {
      this._final((error) => {
        if (error) this.destroy(error)
        else this.#finish()
      })
    } else {
      this.#finish()
    }
  }

  #finish() {
    nextTick(() => {
      if (this.#destroyed) return
      for (const callback of this.#finishCallbacks.splice(0)) callback()
      this.emit('finish')
      this.destroy()
    })
  }
}

const kTransform = Symbol('transform')

class Readable extends Emitter {
  #buffer = []
  #length = 0
  #flowing = null
  #paused = null
  #ended = false
  #endEmitted = false
  #reading = false
  #sync = true
  #needReadable = false
  #emittedReadable = false
  #readableListening = false
  #resumeScheduled = false
  #readingMore = false
  #destroyed = false
  #closeEmitted = false
  #pipes = []
  #awaitDrain = new Set()
  #decoder = null
  #encoding = null
  #objectEncoding = false
  #readableEncoding = null
  #highWaterMark = DEFAULT_HIGH_WATER_MARK
  #objectMode = false

  constructor(options) {
    super()
    assertNoOptions('stream.Readable', options, ['read', 'highWaterMark', 'encoding', 'objectMode'])
    if (options?.read !== undefined) this._read = options.read
    if (options?.[kTransform] === true) this.#sync = false
    this.#objectMode = Boolean(options?.objectMode)
    this.#highWaterMark = highWaterMarkOf(options, this.#objectMode ? 16 : DEFAULT_HIGH_WATER_MARK)
    if (options?.encoding !== undefined && options.encoding !== null) {
      if (this.#objectMode) {
        encodingOf(options.encoding)
        this.#objectEncoding = true
      }
      else this.setEncoding(options.encoding)
      this.#readableEncoding = options.encoding
    }
  }

  _read() {
    this.destroy(codedError(Error, 'ERR_METHOD_NOT_IMPLEMENTED', 'The _read() method is not implemented'))
  }

  _destroy(error, callback) {
    callback()
  }

  _afterEnd() {
    this.destroy()
  }

  on(name, listener) {
    super.on(name, listener)
    if (name === 'data') {
      this.#readableListening = this.listenerCount('readable') > 0
      if (this.#flowing !== false) this.resume()
    } else if (name === 'readable' && !this.#endEmitted && !this.#readableListening) {
      this.#readableListening = true
      this.#needReadable = true
      this.#flowing = false
      this.#emittedReadable = false
      if (this.#length > 0) this.#emitReadable()
      else if (!this.#reading) nextTick(() => this.read(0))
    }
    return this
  }

  removeListener(name, listener) {
    super.removeListener(name, listener)
    if (name === 'readable') nextTick(() => this.#updateReadableListening())
    return this
  }

  removeAllListeners(name) {
    super.removeAllListeners(name)
    if (name === 'readable' || name === undefined) nextTick(() => this.#updateReadableListening())
    return this
  }

  #updateReadableListening() {
    this.#readableListening = this.listenerCount('readable') > 0
    if (this.#resumeScheduled && this.#paused === false) this.#flowing = true
    else if (this.listenerCount('data') > 0) this.resume()
    else if (!this.#readableListening) this.#flowing = null
  }

  get readableFlowing() {
    return this.#flowing
  }

  get readableEnded() {
    return this.#endEmitted
  }

  get readableLength() {
    return this.#length
  }

  get destroyed() {
    return this.#destroyed
  }

  isPaused() {
    return this.#paused === true || (this.#paused !== false && this.#flowing === false)
  }

  pause() {
    if (this.#flowing !== false) {
      this.#flowing = false
      this.emit('pause')
    }
    this.#paused = true
    return this
  }

  resume() {
    if (this.#flowing !== true) {
      this.#flowing = !this.#readableListening
      this.#scheduleResume()
    }
    this.#paused = false
    return this
  }

  pipe(destination, options) {
    const source = this
    const doEnd = options?.end !== false
    let ondrain = null
    let cleanedUp = false
    const unpipe = () => source.#unpipe(destination)
    const onend = () => destination.end()
    const endFn = doEnd ? onend : unpipe
    const ondata = (chunk) => {
      if (destination.write(chunk) === false) pause()
    }
    const onunpipe = (readable) => {
      if (readable === source) cleanup()
    }
    const onerror = (error) => {
      unpipe()
      Emitter.detach(destination, 'error', onerror)
      if (destination.listenerCount('error') === 0) destination.emit('error', error)
    }
    const onclose = () => {
      Emitter.detach(destination, 'finish', onfinish)
      unpipe()
    }
    const onfinish = () => {
      Emitter.detach(destination, 'close', onclose)
      unpipe()
    }
    const pause = () => {
      if (!cleanedUp) {
        source.#awaitDrain.add(destination)
        source.pause()
      }
      if (ondrain === null) {
        ondrain = () => {
          source.#awaitDrain.delete(destination)
          if (source.#awaitDrain.size === 0 && source.listenerCount('data') > 0) source.resume()
        }
        destination.on('drain', ondrain)
      }
    }
    const cleanup = () => {
      Emitter.detach(destination, 'close', onclose)
      Emitter.detach(destination, 'finish', onfinish)
      Emitter.detach(destination, 'unpipe', onunpipe)
      Emitter.detach(destination, 'error', onerror)
      if (ondrain !== null) Emitter.detach(destination, 'drain', ondrain)
      Emitter.detach(source, 'end', endFn)
      Emitter.detach(source, 'data', ondata)
      cleanedUp = true
      if (ondrain !== null && source.#awaitDrain.has(destination)) ondrain()
    }
    this.#pipes.push(destination)
    if (this.#endEmitted) nextTick(endFn)
    else source.on('end', endFn)
    destination.on('unpipe', onunpipe)
    source.on('data', ondata)
    Emitter.prepend(destination, 'error', onerror)
    destination.on('close', onclose)
    destination.on('finish', onfinish)
    destination.emit('pipe', source)
    if (destination.writableNeedDrain === true) {
      if (this.#flowing === true) pause()
    } else if (this.#flowing !== true) {
      this.resume()
    }
    return destination
  }

  unshift(chunk, encoding) {
    if (this.#endEmitted) {
      this.destroy(codedError(Error, 'ERR_STREAM_UNSHIFT_AFTER_END_EVENT', 'stream.unshift() after end event'))
      return false
    }
    if (this.#destroyed) return false
    if (this.#objectMode) {
      this.#addChunk(chunk, true)
      return !this.#ended && (this.#length < this.#highWaterMark || this.#length === 0)
    }
    let data = chunk
    if (typeof chunk === 'string') {
      const from = encodingOf(encoding)
      if (this.#decoder === null) data = Buffer.from(chunk, from)
      else data = from === this.#encoding ? chunk : Buffer.from(chunk, from).toString(this.#encoding)
    }
    if (data.length > 0) this.#addChunk(data, true)
    return !this.#ended && (this.#length < this.#highWaterMark || this.#length === 0)
  }

  wrap(stream) {
    let paused = false
    stream.on('data', (chunk) => {
      if (!this.push(chunk) && typeof stream.pause === 'function') {
        paused = true
        stream.pause()
      }
    })
    stream.on('end', () => this.push(null))
    stream.on('error', (error) => this.destroy(error))
    stream.on('close', () => this.destroy())
    this._read = () => {
      if (paused && typeof stream.resume === 'function') {
        paused = false
        stream.resume()
      }
    }
    for (const key in stream) {
      if (this[key] === undefined && typeof stream[key] === 'function') this[key] = (...args) => stream[key](...args)
    }
    return this
  }

  get readableEncoding() {
    return this.#readableEncoding
  }

  setEncoding(encoding) {
    const name = encodingOf(encoding)
    const decoder = new StringDecoder(name)
    let content = ''
    for (const chunk of this.#buffer) content += typeof chunk === 'string' ? chunk : decoder.write(chunk)
    this.#decoder = decoder
    this.#encoding = name
    this.#readableEncoding = name
    this.#buffer = content === '' ? [] : [content]
    this.#length = content.length
    return this
  }

  push(chunk, encoding) {
    if (this.#destroyed) return false
    if (chunk === null) {
      this.#reading = false
      this.#onEof()
      return false
    }
    if (this.#ended) {
      this.destroy(codedError(Error, 'ERR_STREAM_PUSH_AFTER_EOF', 'stream.push() after EOF'))
      return false
    }
    if (this.#objectMode) {
      if (this.#objectEncoding && typeof chunk !== 'string') throw invalidBufferArg(chunk)
      this.#reading = false
      this.#addChunk(chunk)
      return !this.#ended && (this.#length < this.#highWaterMark || this.#length === 0)
    }
    const bytes = bytesOf(chunk, encoding)
    this.#reading = false
    const data = this.#decoder === null ? Buffer.from(bytes) : this.#decoder.write(bytes)
    if (data.length > 0) this.#addChunk(data)
    else this.#maybeReadMore()
    return !this.#ended && (this.#length < this.#highWaterMark || this.#length === 0)
  }

  read(n) {
    if (n === undefined) n = NaN
    else if (!Number.isInteger(n)) n = Number.parseInt(n, 10)
    const requested = n
    if (n !== 0) this.#emittedReadable = false
    if (n === 0 && this.#needReadable && (this.#length >= this.#highWaterMark || this.#ended)) {
      if (this.#length === 0 && this.#ended) this.#endReadable()
      else this.#emitReadable()
      return null
    }
    n = this.#howMuchToRead(n)
    if (n === 0 && this.#ended) {
      if (this.#length === 0) this.#endReadable()
      return null
    }
    let doRead = this.#needReadable
    if (this.#length === 0 || this.#length - n < this.#highWaterMark) doRead = true
    if (this.#ended || this.#reading || this.#destroyed) doRead = false
    else if (doRead) {
      this.#reading = true
      this.#sync = true
      if (this.#length === 0) this.#needReadable = true
      this._read(this.#highWaterMark)
      this.#sync = false
      if (!this.#reading) n = this.#howMuchToRead(requested)
    }
    const ret = n > 0 ? this.#fromList(n) : null
    if (ret === null) {
      this.#needReadable = this.#length <= this.#highWaterMark
      n = 0
    } else {
      this.#length -= n
      this.#awaitDrain.clear()
    }
    if (this.#length === 0) {
      if (!this.#ended) this.#needReadable = true
      if (requested !== n && this.#ended) this.#endReadable()
    }
    if (ret !== null && !this.#closeEmitted) this.emit('data', ret)
    return ret
  }

  destroy(error) {
    if (this.#destroyed) return this
    this.#destroyed = true
    this._destroy(error, () => {
      if (error !== undefined && error !== null) nextTick(() => this.emit('error', error))
      nextTick(() => {
        this.#closeEmitted = true
        this.emit('close')
      })
    })
    return this
  }

  #addChunk(bytes, addToFront = false) {
    if (this.#flowing === true && this.#length === 0 && !this.#sync && this.listenerCount('data') > 0) {
      this.emit('data', bytes)
    } else {
      this.#length += this.#objectMode ? 1 : bytes.length
      if (addToFront) this.#buffer.unshift(bytes)
      else this.#buffer.push(bytes)
      if (this.#needReadable) this.#emitReadable()
    }
    this.#maybeReadMore()
  }

  #onEof() {
    if (this.#ended) return
    if (this.#decoder !== null) {
      const rest = this.#decoder.end()
      if (rest.length > 0) {
        this.#buffer.push(rest)
        this.#length += rest.length
      }
    }
    this.#ended = true
    if (this.#sync) {
      this.#emitReadable()
    } else {
      this.#needReadable = false
      this.#emittedReadable = true
      this.#emitReadableNT()
    }
  }

  #emitReadable() {
    this.#needReadable = false
    if (!this.#emittedReadable) {
      this.#emittedReadable = true
      nextTick(() => this.#emitReadableNT())
    }
  }

  #emitReadableNT() {
    if (!this.#destroyed && (this.#length > 0 || this.#ended)) {
      this.emit('readable')
      this.#emittedReadable = false
    }
    this.#needReadable = this.#flowing !== true && !this.#ended && this.#length <= this.#highWaterMark
    this.#flow()
  }

  #flow() {
    while (this.#flowing === true && this.read() !== null);
  }

  #scheduleResume() {
    if (this.#resumeScheduled) return
    this.#resumeScheduled = true
    nextTick(() => this.#resumeNT())
  }

  #resumeNT() {
    if (!this.#reading) this.read(0)
    this.#resumeScheduled = false
    this.emit('resume')
    this.#flow()
    if (this.#flowing === true && !this.#reading) this.read(0)
  }

  #maybeReadMore() {
    if (this.#readingMore) return
    this.#readingMore = true
    nextTick(() => this.#maybeReadMoreNT())
  }

  #maybeReadMoreNT() {
    while (!this.#reading && !this.#ended && (this.#length < this.#highWaterMark || (this.#flowing === true && this.#length === 0))) {
      const length = this.#length
      this.read(0)
      if (length === this.#length) break
    }
    this.#readingMore = false
  }

  #howMuchToRead(n) {
    if (n <= 0 || (this.#length === 0 && this.#ended)) return 0
    if (this.#objectMode) return this.#length > 0 ? 1 : 0
    if (Number.isNaN(n)) {
      if (this.#flowing === true && this.#length > 0) return this.#buffer[0].length
      return this.#length
    }
    if (n <= this.#length) return n
    return this.#ended ? this.#length : 0
  }

  #fromList(n) {
    if (this.#length === 0) return null
    if (this.#objectMode) return this.#buffer.shift()
    if (this.#decoder !== null) return this.#fromStrings(n)
    if (n >= this.#length) {
      const all = this.#buffer.length === 1 ? this.#buffer[0] : Buffer.concat(this.#buffer, this.#length)
      this.#buffer = []
      return all
    }
    const parts = []
    let need = n
    while (need > 0) {
      const head = this.#buffer[0]
      if (need >= head.length) {
        parts.push(this.#buffer.shift())
        need -= head.length
      } else {
        parts.push(head.subarray(0, need))
        this.#buffer[0] = head.subarray(need)
        need = 0
      }
    }
    return Buffer.concat(parts, n)
  }

  #fromStrings(n) {
    const text = this.#buffer.join('')
    this.#buffer = text.length > n ? [text.slice(n)] : []
    return text.slice(0, n)
  }

  #endReadable() {
    if (this.#endEmitted) return
    this.#ended = true
    nextTick(() => this.#endReadableNT())
  }

  #endReadableNT() {
    if (!this.#destroyed && !this.#endEmitted && this.#length === 0) {
      this.#endEmitted = true
      this.emit('end')
      this._afterEnd()
    }
  }

  unpipe(destination) {
    if (destination === undefined) {
      if (this.#pipes.length === 0) return this
      const destinations = this.#pipes
      this.#pipes = []
      this.pause()
      for (const piped of destinations) piped.emit('unpipe', this)
      return this
    }
    this.#unpipe(destination)
    return this
  }

  #unpipe(destination) {
    const index = this.#pipes.indexOf(destination)
    if (index === -1) return
    this.#pipes.splice(index, 1)
    if (this.#pipes.length === 0) this.pause()
    destination.emit('unpipe', this)
  }
}

class PassThrough extends Readable {
  #writable
  #readEnded = false
  #writeFinished = false

  constructor(options) {
    highWaterMarkOf(options, DEFAULT_HIGH_WATER_MARK, 'readableHighWaterMark')
    super({ read() {}, [kTransform]: true, highWaterMark: options?.highWaterMark, encoding: options?.encoding, objectMode: options?.objectMode })
    assertNoOptions('stream.PassThrough', options, ['highWaterMark', 'encoding', 'objectMode'])
    this.#writable = new Writable({
      highWaterMark: options?.highWaterMark,
      objectMode: options?.objectMode,
      write: (chunk, encoding, callback) => {
        this.push(chunk)
        callback()
      },
      final: (callback) => {
        this.push(null)
        callback()
      },
    })
    this.#writable.on('finish', () => {
      this.#writeFinished = true
      this.emit('finish')
      this.#closeWhenDone()
    })
  }

  get writableNeedDrain() {
    return this.#writable.writableNeedDrain
  }

  write(chunk, encoding, callback) {
    return this.#writable.write(chunk, encoding, callback)
  }

  end(chunk, encoding, callback) {
    this.#writable.end(chunk, encoding, callback)
    return this
  }

  _afterEnd() {
    this.#readEnded = true
    this.#closeWhenDone()
  }

  #closeWhenDone() {
    if (this.#readEnded && this.#writeFinished) this.destroy()
  }
}

function pipeline(...streams) {
  const callback = streams.pop()
  let failure
  let open = streams.length
  const fail = (error) => {
    if (failure === undefined) failure = error
    for (const stream of streams) stream.destroy()
  }
  for (const stream of streams) {
    stream.on('error', fail)
    stream.on('close', () => {
      open -= 1
      if (open === 0) callback(failure)
    })
  }
  for (let index = 0; index < streams.length - 1; index += 1) streams[index].pipe(streams[index + 1])
  return streams[streams.length - 1]
}

const NODE_ALLOCATION_CEILING = 2 ** 35

function memoryError() {
  return codedError(RangeError, 'ERR_MEMORY_ALLOCATION_FAILED', 'Failed to allocate memory')
}

function checkedBlockSize(size) {
  if (!Number.isSafeInteger(size)) throw outOfRangeError('size', '>= 0 && <= 9007199254740991', size)
  if (size > NODE_ALLOCATION_CEILING) throw memoryError()
  return size
}

function fileBlock(size) {
  checkedBlockSize(size)
  try {
    return new Uint8Array(size)
  } catch {
    throw memoryError()
  }
}

class FileReadStream extends Readable {
  #handle
  #opening
  #closing = false
  #block
  #skip
  #remaining
  #fileBytes = Infinity
  #autoClose

  constructor(path, options) {
    super({ read: () => this.#readBlock(), highWaterMark: options.highWaterMark, encoding: options.encoding })
    this.#autoClose = options.autoClose
    if (options.signal !== undefined) this.#watchAbort(options.signal)
    this.#block = options.highWaterMark
    this.#skip = options.start
    this.#remaining = options.end === undefined ? Infinity : options.end - options.start + 1
    this.#opening = tjs.open(path, options.flags).then(
      async (handle) => {
        this.#handle = handle
        this.#fileBytes = await tjs.stat(path).then((stat) => Math.max(0, stat.size - options.start), () => Infinity)
        this.emit('open', handle.fileno())
        this.emit('ready')
      },
      (error) => (this.#autoClose ? this.destroy(fsPathError(error, 'open', path)) : nextTick(() => this.emit('error', fsPathError(error, 'open', path)))),
    )
  }

  #watchAbort(signal) {
    if (signal.aborted) nextTick(() => this.destroy(abortError(signal)))
    else signal.addEventListener('abort', () => this.destroy(abortError(signal)), { once: true })
  }

  _afterEnd() {
    if (this.#autoClose) super._afterEnd()
  }

  _destroy(error, callback) {
    this.#closing = true
    this.#opening.then(() => this.#handle?.close()).then(() => callback(), () => callback())
  }

  #readBlock() {
    this.#opening
      .then(async () => {
        if (this.#handle === undefined || this.#closing) return
        const block = checkedBlockSize(this.#block)
        while (this.#skip > 0) {
          const skipped = await this.#handle.read(new Uint8Array(Math.min(block, this.#skip)))
          if (skipped <= 0) return this.push(null)
          this.#skip -= skipped
        }
        const length = block | 0
        if (length < 0) return
        const size = Math.min(length, this.#remaining)
        if (size <= 0) return this.push(null)
        const buffer = fileBlock(Math.min(size, Math.max(this.#fileBytes, 1)))
        const count = await this.#handle.read(buffer)
        this.#remaining -= count
        this.push(count > 0 ? buffer.subarray(0, count) : null)
      })
      .catch((error) => this.destroy(error))
  }
}

const READ_STREAM_FLAGS = ['r', 'r+', 'w', 'wx', 'rs', 'rs+', 'w+', 'wx+', 'a', 'ax', 'a+', 'ax+', 'as', 'as+']

function describeReceived(value) {
  if (value === null) return 'null'
  if (typeof value === 'function') return 'function ' + value.name
  if (typeof value === 'object') return 'an instance of ' + (value.constructor?.name ?? 'Object')
  if (typeof value === 'string') return "type string ('" + value.slice(0, 25) + "')"
  return 'type ' + typeof value + ' (' + String(value) + ')'
}

function invalidArgType(property, value, expected) {
  return codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "' + property + '" property must be an instance of ' + expected + '. Received ' + describeReceived(value))
}

function invalidBufferArg(value) {
  return codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "buf" argument must be an instance of Buffer, TypedArray, or DataView. Received ' + describeReceived(value))
}

function invalidFlagStream(flags) {
  const stream = new Readable({ read() {} })
  nextTick(() => stream.destroy(codedError(TypeError, 'ERR_INVALID_ARG_VALUE', "The argument 'flags' is invalid. Received '" + String(flags) + "'")))
  return stream
}

function createReadStream(path, options) {
  const opts = typeof options === 'string' ? { encoding: options } : options ?? {}
  assertNoOptions('fs.createReadStream', opts, ['encoding', 'start', 'end', 'highWaterMark', 'signal', 'flags', 'mode', 'autoClose'])
  const signalLike = opts.signal !== null && typeof opts.signal === 'object' && 'aborted' in opts.signal
  if (opts.signal !== undefined && !signalLike) throw invalidArgType('options.signal', opts.signal, 'AbortSignal')
  if (opts.signal !== undefined && !opts.signal.aborted && typeof opts.signal.addEventListener !== 'function') throw new TypeError('signal.addEventListener is not a function')
  const flags = opts.flags ?? 'r'
  if (!READ_STREAM_FLAGS.includes(flags)) return invalidFlagStream(flags)
  const autoClose = opts.autoClose ?? true
  if (typeof autoClose !== 'boolean') throw gapError('fs.createReadStream autoClose ' + String(autoClose))
  if (opts.encoding !== undefined && opts.encoding !== null && !ENCODINGS.has(String(opts.encoding).toLowerCase())) {
    throw codedError(TypeError, 'ERR_INVALID_ARG_VALUE', "The argument 'encoding' is invalid encoding. Received '" + String(opts.encoding) + "'")
  }
  const start = positionOf('start', opts.start, 0)
  const end = opts.end === Infinity ? undefined : positionOf('end', opts.end, undefined)
  if (end !== undefined && end < start) throw outOfRangeError('start', '<= "end" (here: ' + end + ')', start)
  const highWaterMark = highWaterMarkOf(opts)
  const stream = new FileReadStream(path, { start, end, highWaterMark, signal: opts.signal, flags, autoClose, encoding: opts.encoding })
  return stream
}

function execFileArguments(args, options, callback) {
  if (typeof args === 'function') return { argv: [], opts: {}, done: args }
  if (!Array.isArray(args)) return { argv: [], opts: args ?? {}, done: options }
  if (typeof options === 'function') return { argv: args, opts: {}, done: options }
  return { argv: args, opts: options ?? {}, done: callback }
}

function spawnError(file, argv, code) {
  return Object.assign(new Error('spawn ' + file + ' ' + code), { code, syscall: 'spawn ' + file, path: file, spawnargs: argv })
}

function exitFailure(cmd, stderr, status, killed) {
  if (status.term_signal === null && status.exit_status === 0) return null
  const error = new Error('Command failed: ' + cmd + '\n' + Buffer.from(stderr).toString('utf8'))
  const cause = status.term_signal === null ? { code: status.exit_status, signal: null } : { code: null, signal: status.term_signal }
  return Object.assign(error, cause, { killed, cmd })
}

const ASYNC_SPAWN_ERRORS = ['ENOENT', 'EACCES', 'EAGAIN', 'EMFILE', 'ENFILE']

const KILL_SIGNALS = ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGUSR1', 'SIGUSR2', 'SIGQUIT', 'SIGALRM', 'SIGPIPE', 'SIGABRT']

const LINUX_SIGNAL_NUMBERS = { 1: 'SIGHUP', 2: 'SIGINT', 3: 'SIGQUIT', 6: 'SIGABRT', 9: 'SIGKILL', 10: 'SIGUSR1', 12: 'SIGUSR2', 13: 'SIGPIPE', 14: 'SIGALRM', 15: 'SIGTERM' }

function killSignalOf(opts) {
  const requested = opts.killSignal ?? 'SIGTERM'
  if (typeof requested === 'number' && (!Number.isInteger(requested) || requested < 1 || requested > 31)) throw codedError(TypeError, 'ERR_UNKNOWN_SIGNAL', 'Unknown signal: ' + requested)
  const signal = typeof requested === 'number' && osPlatform === 'linux' ? LINUX_SIGNAL_NUMBERS[requested] : requested
  if (!KILL_SIGNALS.includes(signal)) throw gapError('child-process killSignal ' + String(requested))
  return signal
}

function maxBufferOf(opts) {
  const value = opts.maxBuffer ?? 1024 * 1024
  if (typeof value !== 'number' || !(value >= 0)) throw outOfRangeError('options.maxBuffer', 'a positive number', value)
  return value
}

function signalOf(opts) {
  const value = opts.signal
  if (value !== undefined && typeof value?.addEventListener !== 'function') throw invalidArgType('options.signal', value, 'AbortSignal')
  return value
}

function windowsHideChecked(opts) {
  const value = opts.windowsHide
  if (value != null && typeof value !== 'boolean') throw codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "options.windowsHide" property must be of type boolean. Received ' + describeReceived(value))
}

function maxBufferError(stream) {
  const error = new RangeError(stream + ' maxBuffer length exceeded')
  error.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
  return error
}

function signalChild(child, signal) {
  try {
    child.kill(signal)
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

async function readCapped(stream, limit, onOverflow) {
  const reader = stream.getReader()
  const chunks = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return { bytes: concatBytes(chunks), overflowed: false }
    chunks.push(value)
    length += value.length
    if (length > limit) {
      onOverflow()
      reader.cancel().catch(() => {})
      return { bytes: concatBytes(chunks).subarray(0, limit), overflowed: true }
    }
  }
}

function timeoutOf(opts) {
  const timeout = opts.timeout ?? 0
  if (typeof timeout !== 'number' || timeout < 0) throw gapError('child-process timeout ' + String(timeout))
  return timeout
}

function idOption(opts, key) {
  const value = opts[key]
  if (value !== undefined && typeof value !== 'number') throw codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "options.' + key + '" property must be int32. Received ' + describeReceived(value))
  return value
}

function stdioOf(opts) {
  const stdio = opts.stdio ?? 'pipe'
  if (typeof stdio === 'string' && !['pipe', 'overlapped', 'inherit', 'ignore'].includes(stdio)) throw codedError(TypeError, 'ERR_INVALID_ARG_VALUE', "The argument 'stdio' is invalid. Received '" + stdio + "'")
  const list = typeof stdio === 'string' ? [stdio, stdio, stdio] : stdio
  if (!Array.isArray(list) || list.length !== 3 || list.some((kind) => kind !== 'pipe' && kind !== 'inherit' && kind !== 'ignore')) throw gapError('child-process stdio ' + String(stdio))
  return list
}

function shellArguments(file, argv, shell) {
  if (shell === undefined || shell === false) return { file, argv }
  if (shell !== true) throw gapError('child-process shell ' + String(shell))
  return { file: '/bin/sh', argv: ['-c', [file, ...argv].join(' ')] }
}

function processEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))
}

function startProcess(file, argv, { cwd, env, uid, gid, stdio = ['pipe', 'pipe', 'pipe'], stdin = false } = {}) {
  const options = { stdout: stdio[1], stderr: stdio[2] }
  if (stdin) options.stdin = stdio[0]
  if (cwd !== undefined) options.cwd = cwd
  if (env !== undefined) options.env = processEnv(env)
  if (uid !== undefined) options.uid = uid
  if (gid !== undefined) options.gid = gid
  try {
    return { process: tjs.spawn([file, ...argv], options) }
  } catch (error) {
    if (!ASYNC_SPAWN_ERRORS.includes(error.code)) throw Object.assign(new Error('spawn ' + error.code), { code: error.code, syscall: 'spawn' })
    return { error: spawnError(file, argv, error.code) }
  }
}

async function captureExecFile({ process: child, error }, cmd, { timeout, killSignal, maxBuffer, signal }) {
  if (child === undefined) return { error: Object.assign(error, { cmd }), stdout: new Uint8Array(), stderr: new Uint8Array() }
  let killed = false
  let aborted = false
  const stop = () => signalChild(child, killSignal)
  const timer = timeout > 0 ? setTimeout(() => { killed = true; stop() }, timeout) : undefined
  const onAbort = () => { aborted = true; stop() }
  signal?.addEventListener('abort', onAbort, { once: true })
  const [out, err, status] = await Promise.all([readCapped(child.stdout, maxBuffer, stop), readCapped(child.stderr, maxBuffer, stop), child.wait()])
  clearTimeout(timer)
  signal?.removeEventListener('abort', onAbort)
  const overflow = out.overflowed ? 'stdout' : err.overflowed ? 'stderr' : undefined
  const failure = aborted ? abortError(signal) : overflow === undefined ? exitFailure(cmd, err.bytes, status, killed) : maxBufferError(overflow)
  return { error: failure, stdout: out.bytes, stderr: err.bytes }
}

function decodeExecOutput(bytes, encoding) {
  const buffer = Buffer.from(bytes)
  return encoding === null || encoding === 'buffer' ? buffer : buffer.toString(encoding)
}

function execFile(file, args, options, callback) {
  const { argv, opts, done } = execFileArguments(args, options, callback)
  for (const key of Object.keys(opts)) {
    if (key !== 'encoding' && key !== 'cwd' && key !== 'env' && key !== 'timeout' && key !== 'killSignal' && key !== 'shell' && key !== 'uid' && key !== 'gid' && key !== 'maxBuffer' && key !== 'signal' && key !== 'windowsHide' && key !== 'stdio') throw gapError('child-process.execFile option ' + key)
  }
  const encoding = opts.encoding === undefined ? 'utf8' : opts.encoding
  const cmd = [file, ...argv].join(' ')
  const timeout = timeoutOf(opts)
  const killSignal = killSignalOf(opts)
  const maxBuffer = maxBufferOf(opts)
  const signal = signalOf(opts)
  const shelled = shellArguments(file, argv, opts.shell)
  captureExecFile(signal?.aborted ? { error: abortError(signal) } : startProcess(shelled.file, shelled.argv, { cwd: opts.cwd, env: opts.env, uid: idOption(opts, 'uid'), gid: idOption(opts, 'gid') }), cmd, { timeout, killSignal, maxBuffer, signal }).then(({ error, stdout, stderr }) => {
    if (done !== undefined) done(error ?? null, decodeExecOutput(stdout, encoding), decodeExecOutput(stderr, encoding))
  })
}

function spawnArguments(args, options) {
  if (!Array.isArray(args)) return { argv: [], opts: args ?? {} }
  return { argv: args, opts: options ?? {} }
}

function openPipe(stream) {
  let release = null
  const readable = new Readable({
    read: () => {
      const resume = release
      release = null
      resume?.()
    },
  })
  const ended = new Promise((resolve) => readable.once('end', resolve))
  const reader = stream.getReader()
  const pump = async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const drained = new Promise((resolve) => {
        release = resolve
      })
      if (!readable.push(Buffer.from(value)) && readable.readableFlowing !== null) await drained
    }
    readable.push(null)
  }
  pump().catch((error) => readable.destroy(error))
  return { readable, ended }
}

function closedPipe() {
  const readable = new Readable({ read() {} })
  readable.push(null)
  return { readable, ended: Promise.resolve() }
}

function openWritable(stream) {
  const writer = stream.getWriter()
  const writable = new Writable({
    write(chunk, encoding, callback) {
      writer.write(chunk).then(() => callback(), callback)
    },
    final(callback) {
      writer.close().then(() => callback(), callback)
    },
  })
  writable._destroy = (error, callback) => {
    writer.close().then(() => callback(), () => callback())
  }
  return writable
}

function discardingWritable() {
  return new Writable({ write(chunk, encoding, callback) { callback() } })
}

class ChildProcess extends Emitter {
  #process
  #exited = false
  #stdin
  #stdout
  #stderr
  #timer
  #signal
  #onAbort
  killed = false

  constructor(file, argv, options) {
    super()
    const started = startProcess(file, argv, { ...options, stdin: true })
    const [noStdin, noStdout, noStderr] = options.stdio.map((kind) => kind !== 'pipe')
    if (started.error !== undefined) {
      this.#stdin = noStdin ? null : discardingWritable()
      this.#stdout = noStdout ? null : closedPipe()
      this.#stderr = noStderr ? null : closedPipe()
      setTimeout(() => this.#fail(started.error), 0)
      return
    }
    this.#process = started.process
    this.#stdin = noStdin ? null : openWritable(started.process.stdin)
    this.#stdout = noStdout ? null : openPipe(started.process.stdout)
    this.#stderr = noStderr ? null : openPipe(started.process.stderr)
    if (options.timeout > 0) this.#timer = setTimeout(() => this.kill(options.killSignal), options.timeout)
    if (options.signal !== undefined) this.#watchAbort(options.signal, options.killSignal)
    setTimeout(() => this.#spawned(), 0)
  }

  #watchAbort(signal, killSignal) {
    this.#signal = signal
    this.#onAbort = () => {
      this.emit('error', abortError(signal))
      this.kill(killSignal)
    }
    if (signal.aborted) {
      this.kill(killSignal)
      setTimeout(() => this.emit('error', abortError(signal)), 0)
    } else {
      signal.addEventListener('abort', this.#onAbort, { once: true })
    }
  }

  get pid() {
    return this.#process?.pid
  }

  get stdin() {
    return this.#stdin
  }

  get stdout() {
    return this.#stdout === null ? null : this.#stdout.readable
  }

  get stderr() {
    return this.#stderr === null ? null : this.#stderr.readable
  }

  kill(signal = 'SIGTERM') {
    if (this.#process === undefined || this.#exited) return false
    try {
      this.#process.kill(signal)
    } catch (error) {
      if (error instanceof RangeError) throw gapError('child-process.spawn kill with signal ' + signal)
      throw error
    }
    this.killed = true
    return true
  }

  #spawned() {
    this.emit('spawn')
    this.#reap()
  }

  async #reap() {
    const status = await this.#process.wait()
    clearTimeout(this.#timer)
    this.#signal?.removeEventListener('abort', this.#onAbort)
    this.#exited = true
    const [code, signal] = status.term_signal === null ? [status.exit_status, null] : [null, status.term_signal]
    this.emit('exit', code, signal)
    const pipes = [this.#stdout, this.#stderr].filter((pipe) => pipe !== null)
    for (const pipe of pipes) {
      if (pipe.readable.readableFlowing === null) pipe.readable.resume()
    }
    await Promise.all(pipes.map((pipe) => pipe.ended))
    this.emit('close', code, signal)
  }

  #fail(error) {
    this.emit('error', error)
    this.emit('close', -2, null)
  }
}

function spawn(file, args, options) {
  const { argv, opts } = spawnArguments(args, options)
  const key = Object.keys(opts).find((name) => name !== 'cwd' && name !== 'env' && name !== 'timeout' && name !== 'killSignal' && name !== 'shell' && name !== 'uid' && name !== 'gid' && name !== 'stdio' && name !== 'signal' && name !== 'windowsHide')
  if (key !== undefined) throw gapError('child-process.spawn option ' + key)
  windowsHideChecked(opts)
  const shelled = shellArguments(file, argv, opts.shell)
  return new ChildProcess(shelled.file, shelled.argv, { ...opts, timeout: timeoutOf(opts), killSignal: killSignalOf(opts), uid: idOption(opts, 'uid'), gid: idOption(opts, 'gid'), stdio: stdioOf(opts), signal: signalOf(opts) })
}

export const txikiRuntime = {
  fs: withGaps('fs', { ...gapFunctions('fs', FS_SYNC_NAMES), constants: fsConstants, createReadStream, unwatchFile, watchFile }),
  fsPromises,
  path: tjsPath,
  crypto: withGaps('crypto', {
    createHash,
    randomBytes,
    randomUUID: () => webCrypto.randomUUID(),
  }),
  stream: withGaps('stream', {
    PassThrough,
    Readable,
    Writable,
    pipeline,
  }),
  buffer: withGaps('buffer', { Buffer, constants: withGaps('buffer.constants', { MAX_LENGTH: 9007199254740991, MAX_STRING_LENGTH: 536870888 }) }),
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
  childProcess: withGaps('child_process', { execFile, spawn, ...gapFunctions('child_process', ['execFileSync', 'spawnSync']) }),
  os: withGaps('os', {
    availableParallelism,
    constants: withGaps('os.constants', {}),
    homedir: () => tjs.homeDir,
    tmpdir: () => tjs.tmpDir,
    networkInterfaces,
    platform: osPlatform === undefined ? gapFunction('os.platform') : () => osPlatform,
    release: osRelease === undefined ? gapFunction('os.release') : () => osRelease,
  }),
  workerThreads: withGaps('worker_threads', {
    MessageChannel: globalThis.MessageChannel,
    Worker: gapClass('worker_threads.Worker'),
    parentPort: withGaps('worker_threads.parentPort', {}),
    workerData: withGaps('worker_threads.workerData', {}),
  }),
  asyncHooks: withGaps('async_hooks', { AsyncLocalStorage: gapClass('async_hooks.AsyncLocalStorage') }),
  vm: withGaps('vm', { Script: gapClass('vm.Script'), ...gapFunctions('vm', ['createContext', 'runInContext']) }),
  http: withGaps('http', { validateHeaderValue, ...gapFunctions('http', ['createServer']) }),
  https: withGaps('https', {}),
  zlib: withGaps('zlib', {
    constants: withGaps('zlib.constants', {}),
    gzip,
    gunzip,
    ...gapFunctions('zlib', ['brotliCompress', 'createZstdDecompress', 'zstdCompress', 'zstdDecompress', 'zstdDecompressSync']),
  }),
  inspector: withGaps('inspector', { Session: gapClass('inspector.Session') }),
  stringDecoder: withGaps('string_decoder', { StringDecoder }),
  perfHooks: withGaps('perf_hooks', { performance: globalThis.performance }),
  timersPromises: withGaps('timers/promises', { scheduler, setTimeout: delay }),
  net: withGaps('net', { isIP }),
  dnsPromises: withGaps('dns/promises', {}),
  process: processObject,
}
