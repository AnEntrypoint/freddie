import tjsPath from 'tjs:path'
import tjsIpaddr from 'tjs:ipaddr'
import { inspect as tjsInspect } from 'tjs:utils'

const tjs = globalThis.tjs
const webCrypto = globalThis.crypto
const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder('utf-8', { ignoreBOM: true })
const utf16leDecoder = new TextDecoder('utf-16le')
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

const CODECS = {
  utf8: { encode: (text) => utf8Encoder.encode(text), decode: (bytes) => utf8Decoder.decode(bytes) },
  hex: { encode: hexBytes, decode: hexText },
  base64: { encode: base64Bytes, decode: (bytes) => base64Text(bytes, false) },
  base64url: { encode: base64Bytes, decode: (bytes) => base64Text(bytes, true) },
  latin1: { encode: latin1Bytes, decode: (bytes) => latin1Text(bytes, 0xff) },
  ascii: { encode: latin1Bytes, decode: (bytes) => latin1Text(bytes, 0x7f) },
  utf16le: { encode: utf16leBytes, decode: (bytes) => utf16leDecoder.decode(bytes) },
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

  static isView(value) {
    return ArrayBuffer.isView(value)
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
  if (options?.flag !== undefined && options.flag !== 'w') throw gapError('fs.promises.writeFile with flag ' + options.flag)
  if (options?.mode !== undefined) throw gapError('fs.promises.writeFile with mode')
  const bytes = typeof data === 'string' ? CODECS[encodingOf(encoding)].encode(data) : data
  await tjs.writeFile(path, bytes)
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
  opendir: gapFunction('fs.promises.opendir'),
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
  if (callback !== undefined) throw gapError('crypto.randomBytes with a callback')
  const bytes = new Uint8Array(size)
  for (let start = 0; start < size; start += RANDOM_CHUNK) {
    webCrypto.getRandomValues(bytes.subarray(start, start + RANDOM_CHUNK))
  }
  return viewOf(bytes)
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

function delay(milliseconds, value, options) {
  if (options?.signal !== undefined) throw gapError('timers/promises setTimeout with an AbortSignal')
  return new Promise((resolve) => globalThis.setTimeout(() => resolve(value), milliseconds))
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
    ...gapFunctions('util', ['isDeepStrictEqual', 'parseArgs', 'parseEnv']),
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
    ...gapFunctions('os', ['networkInterfaces', 'platform', 'release']),
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
    ...gapFunctions('zlib', ['brotliCompress', 'createZstdDecompress', 'gzip', 'zstdCompress', 'zstdDecompress', 'zstdDecompressSync']),
  }),
  inspector: withGaps('inspector', { Session: gapClass('inspector.Session') }),
  stringDecoder: withGaps('string_decoder', { StringDecoder }),
  perfHooks: withGaps('perf_hooks', { performance: globalThis.performance }),
  timersPromises: withGaps('timers/promises', { scheduler, setTimeout: delay }),
  net: withGaps('net', { isIP }),
  dnsPromises: withGaps('dns/promises', {}),
  process: processObject,
}
