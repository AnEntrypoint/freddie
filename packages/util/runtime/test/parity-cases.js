import { subpaths as s } from './subpaths.js'

const { Buffer } = s.buffer
const { StringDecoder } = s['string-decoder']
const fsp = s['fs-promises']
const proc = s.process.process

const canon = (value) => {
  if (Array.isArray(value)) return value.map(canon)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canon(value[key])]))
  }
  return value
}

const byName = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)

async function fsScenario() {
  const dir = await fsp.mkdtemp('/tmp/parity-')
  const out = {}
  await fsp.writeFile(dir + '/a.txt', 'hello')
  out.text = await fsp.readFile(dir + '/a.txt', 'utf8')
  out.bytes = (await fsp.readFile(dir + '/a.txt')).length
  const st = await fsp.stat(dir + '/a.txt')
  out.stat = [st.isFile(), st.isDirectory(), st.size, typeof st.mtimeMs]
  await fsp.mkdir(dir + '/x/y', { recursive: true })
  out.dirIsDir = (await fsp.stat(dir + '/x/y')).isDirectory()
  out.entries = (await fsp.readdir(dir, { withFileTypes: true })).map((e) => [e.name, e.isFile()]).sort(byName)
  await fsp.cp(dir + '/x', dir + '/z', { recursive: true })
  out.copied = (await fsp.stat(dir + '/z/y')).isDirectory()
  await fsp.rm(dir + '/z', { recursive: true })
  out.removed = await fsp.access(dir + '/z').then(() => 'present', (error) => error.code)
  await fsp.rename(dir + '/a.txt', dir + '/b.txt')
  out.renamed = (await fsp.readdir(dir)).sort()
  out.realpathEndsWith = (await fsp.realpath(dir + '/b.txt')).endsWith('/b.txt')
  await fsp.truncate(dir + '/b.txt', 2)
  out.truncated = await fsp.readFile(dir + '/b.txt', 'utf8')
  await fsp.unlink(dir + '/b.txt')
  out.afterUnlink = (await fsp.readdir(dir)).sort()
  out.missingRead = await fsp.readFile(dir + '/nope').then(() => 'ok', (error) => error.code)
  out.missingAccess = await fsp.access(dir + '/nope').then(() => 'ok', (error) => error.code)
  out.accessOk = await fsp.access(dir).then(() => 'ok')
  await fsp.rm(dir + '/none', { force: true })
  out.forceRmMissing = 'resolved'
  await fsp.writeFile(dir + '/c.txt', 'abc')
  const handle = await fsp.open(dir + '/c.txt', 'r')
  out.handleSize = (await handle.stat()).size
  await handle.close()
  await fsp.writeFile(dir + '/bin', Buffer.from([0, 1, 2, 255]))
  out.binary = Array.from(await fsp.readFile(dir + '/bin'))
  await fsp.rm(dir, { recursive: true, force: true })
  out.afterRm = await fsp.access(dir).then(() => 'present', (error) => error.code)
  return out
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export const sharedCases = [
  { name: 'path.join', run: () => s.path.join('/a', 'b', '../c.txt'), expected: '/a/c.txt' },
  { name: 'path.basename', run: () => s.path.basename('/x/y/z.md', '.md'), expected: 'z' },
  { name: 'path.dirname', run: () => s.path.dirname('/x/y/z.md'), expected: '/x/y' },
  { name: 'path.extname', run: () => s.path.extname('a.tar.gz'), expected: '.gz' },
  { name: 'path.relative', run: () => s.path.relative('/a/b', '/a/c/d'), expected: '../c/d' },
  { name: 'path.normalize', run: () => s.path.normalize('/a//b/./c/..'), expected: '/a/b' },
  { name: 'path.isAbsolute', run: () => [s.path.isAbsolute('/x'), s.path.isAbsolute('x')], expected: [true, false] },
  { name: 'path.resolve', run: () => s.path.resolve('/a', 'b'), expected: '/a/b' },
  { name: 'path.sep and delimiter', run: () => [s.path.sep, s.path.delimiter], expected: ['/', ':'] },
  { name: 'path.parse', run: () => s.path.parse('/a/b.txt'), expected: { root: '/', dir: '/a', base: 'b.txt', ext: '.txt', name: 'b' } },
  { name: 'url.pathToFileURL encodes a space and percent', run: () => s.url.pathToFileURL('/tmp/a b%.txt').href, expected: 'file:///tmp/a%20b%25.txt' },
  { name: 'url round trip', run: () => s.url.fileURLToPath(s.url.pathToFileURL('/tmp/a b%.txt').href), expected: '/tmp/a b%.txt' },
  { name: 'url encodes hash and query', run: () => s.url.pathToFileURL('/x#y?').href, expected: 'file:///x%23y%3F' },
  { name: 'buffer utf8 base64', run: () => Buffer.from('héllo').toString('base64'), expected: 'aMOpbGxv' },
  { name: 'buffer base64 decode', run: () => Buffer.from('aGk=', 'base64').toString(), expected: 'hi' },
  { name: 'buffer base64url', run: () => Buffer.from('??>>').toString('base64url'), expected: 'Pz8-Pg' },
  { name: 'buffer hex both ways', run: () => [Buffer.from('ab', 'hex').toString('hex'), Buffer.from([1, 2, 255]).toString('hex')], expected: ['ab', '0102ff'] },
  { name: 'buffer latin1 encode', run: () => Array.from(Buffer.from('é', 'latin1')), expected: [233] },
  { name: 'buffer utf16le', run: () => [Array.from(Buffer.from('hi', 'utf16le')), Buffer.from('hi', 'utf16le').toString('utf16le')], expected: [[104, 0, 105, 0], 'hi'] },
  { name: 'buffer ascii decode strips the high bit', run: () => Buffer.from([0xe9]).toString('ascii'), expected: 'i' },
  { name: 'buffer alloc with a string fill', run: () => Buffer.alloc(5, 'ab').toString(), expected: 'ababa' },
  { name: 'buffer concat with and without total', run: () => [Buffer.concat([Buffer.from('ab'), Buffer.from('cd')], 3).toString(), Buffer.concat([Buffer.from('ab'), Buffer.from('cd')]).toString()], expected: ['abc', 'abcd'] },
  { name: 'buffer byteLength', run: () => Buffer.byteLength('é'), expected: 2 },
  { name: 'buffer equals and compare', run: () => [Buffer.from('a').equals(Buffer.from('a')), Buffer.from('a').compare(Buffer.from('b'))], expected: [true, -1] },
  { name: 'buffer copy', run: () => { const t = Buffer.alloc(4); const n = Buffer.from('xyz').copy(t, 1); return [n, t.toString('hex')] }, expected: [3, '0078797a'] },
  { name: 'buffer write at an offset', run: () => { const b = Buffer.alloc(6); const n = b.write('hi', 2); return [n, b.toString('hex')] }, expected: [2, '000068690000'] },
  { name: 'buffer slice shares memory', run: () => { const b = Buffer.from('abcd'); const v = b.slice(1, 3); v[0] = 0x5a; return b.toString() }, expected: 'aZcd' },
  { name: 'buffer integer accessors', run: () => { const b = Buffer.alloc(6); b.writeUInt16BE(0x1234, 0); b.writeUInt32LE(7, 2); return [b.readUInt16BE(0), b.readUInt32LE(2), b.toString('hex')] }, expected: [4660, 7, '123407000000'] },
  { name: 'buffer readUInt BE and LE of n bytes', run: () => [Buffer.from([1, 2, 3]).readUIntBE(0, 3), Buffer.from([1, 2, 3]).readUIntLE(0, 3)], expected: [66051, 197121] },
  { name: 'buffer toJSON', run: () => JSON.stringify(Buffer.from('ok')), expected: '{"type":"Buffer","data":[111,107]}' },
  { name: 'buffer isBuffer, with ArrayBuffer.isView for views', run: () => [ArrayBuffer.isView(new Uint8Array(1)), Buffer.isBuffer(Buffer.alloc(1)), Buffer.isBuffer(new Uint8Array(1))], expected: [true, true, false] },
  { name: 'buffer from a typed array copies its values', run: () => Array.from(Buffer.from(new Uint8Array([9, 8]))), expected: [9, 8] },
  { name: 'buffer from an ArrayBuffer', run: () => Buffer.from(new ArrayBuffer(3)).length, expected: 3 },
  { name: 'buffer has no static isView, as in Node', run: () => typeof Buffer.isView, expected: 'undefined' },
  { name: 'string_decoder keeps a split character', run: () => { const d = new StringDecoder('utf8'); return [d.write(Buffer.from([0xe2, 0x82])), d.end(Buffer.from([0xac]))] }, expected: ['', '€'] },
  { name: 'util.promisify resolves', run: () => s.util.promisify((a, cb) => cb(null, a * 2))(21), expected: 42 },
  { name: 'util.promisify rejects', run: () => s.util.promisify((cb) => cb(new Error('boom')))().then(() => 'resolved', (error) => error.message), expected: 'boom' },
  { name: 'util.types.isPromise', run: () => [s['util-types'].isPromise(Promise.resolve(1)), s['util-types'].isPromise({})], expected: [true, false] },
  { name: 'util.TextDecoder decodes utf8', run: () => new s.util.TextDecoder().decode(Uint8Array.of(104, 105)), expected: 'hi' },
  { name: 'timers-promises setTimeout resolves its value', run: () => s['timers-promises'].setTimeout(5, 'ok'), expected: 'ok' },
  { name: 'perf_hooks.performance.now', run: () => typeof s['perf-hooks'].performance.now(), expected: 'number' },
  { name: 'crypto.randomUUID is a v4 UUID', run: () => UUID_V4.test(s.crypto.randomUUID()), expected: true },
  { name: 'crypto.randomBytes length', run: () => s.crypto.randomBytes(8).length, expected: 8 },
  { name: 'net.isIP', run: () => [s.net.isIP('10.0.0.1'), s.net.isIP('::1'), s.net.isIP('nope')], expected: [4, 6, 0] },
  { name: 'os values', run: () => [typeof s.os.homedir(), typeof s.os.tmpdir(), s.os.availableParallelism() > 0], expected: ['string', 'string', true] },
  { name: 'process basics', run: () => [typeof proc.env, typeof proc.cwd(), typeof proc.pid, Array.isArray(proc.argv), typeof proc.kill, typeof proc.exit], expected: ['object', 'string', 'number', true, 'function', 'function'] },
  { name: 'fs.promises scenario in a scratch directory', run: fsScenario, expected: {
    text: 'hello', bytes: 5, stat: [true, false, 5, 'number'], dirIsDir: true,
    entries: [['a.txt', true], ['x', false]], copied: true, removed: 'ENOENT',
    renamed: ['b.txt', 'x'], realpathEndsWith: true, truncated: 'he', afterUnlink: ['x'],
    missingRead: 'ENOENT', missingAccess: 'ENOENT', accessOk: 'ok', forceRmMissing: 'resolved',
    handleSize: 3, binary: [0, 1, 2, 255], afterRm: 'ENOENT',
  } },
]

const BT = String.fromCharCode(96)

const EQUALITY_PROBES = [
  ['primitives', () => [1, 1], true],
  ['strings', () => ['a', 'b'], false],
  ['NaN', () => [NaN, NaN], true],
  ['signed zero', () => [0, -0], false],
  ['nested objects', () => [{ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }], true],
  ['nested difference', () => [{ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] }], false],
  ['array length', () => [[1, 2], [1, 2, 3]], false],
  ['prototype', () => [{}, Object.create(null)], false],
  ['undefined key', () => [{ a: undefined }, {}], false],
  ['key order', () => [{ a: 1, b: 2 }, { b: 2, a: 1 }], true],
  ['cyclic', () => { const x = { name: 'a' }; x.self = x; const y = { name: 'a' }; y.self = y; return [x, y] }, true],
  ['equal dates', () => [new Date(5), new Date(5)], true],
  ['different dates', () => [new Date(5), new Date(6)], false],
  ['equal regexes', () => [/a/gi, /a/gi], true],
  ['regex flags', () => [/a/g, /a/i], false],
  ['equal maps', () => [new Map([['k', { v: 1 }]]), new Map([['k', { v: 1 }]])], true],
  ['different maps', () => [new Map([['k', 1]]), new Map([['k', 2]])], false],
  ['equal sets', () => [new Set([1, 'x']), new Set([1, 'x'])], true],
  ['different sets', () => [new Set([1]), new Set([2])], false],
  ['equal typed arrays', () => [new Uint8Array([1, 2]), new Uint8Array([1, 2])], true],
  ['different typed arrays', () => [new Uint8Array([1, 2]), new Uint8Array([1, 3])], false],
  ['typed array against array', () => [new Uint8Array([1]), [1]], false],
  ['boxed against primitive', () => [new Number(1), 1], false],
  ['equal boxed', () => [new Number(1), new Number(1)], true],
  ['equal errors', () => [new Error('x'), new Error('x')], true],
  ['different errors', () => [new Error('x'), new Error('y')], false],
  ['equal array buffers', () => [new Uint8Array([7]).buffer, new Uint8Array([7]).buffer], true],
  ['symbol keys', () => [{ [Symbol.for('s')]: 1 }, { [Symbol.for('s')]: 2 }], false],
  ['null against object', () => [null, {}], false],
  ['same function', () => { const fn = () => 1; return [fn, fn] }, true],
  ['different functions', () => [() => 1, () => 1], false],
]

const ENV_PROBES = [
  ['plain pairs', 'A=1\nB=two', { A: '1', B: 'two' }],
  ['comments and blank lines', '\n\n# comment\nA=1\n\n', { A: '1' }],
  ['surrounding whitespace', '  A  =  x  ', { A: 'x' }],
  ['quote styles', 'A="quoted value"\nB=\'single $x\'\nC=' + BT + 'tick' + BT, { A: 'quoted value', B: 'single $x', C: 'tick' }],
  ['escaped newline in double quotes', 'A="line1\\nline2"', { A: 'line1\nline2' }],
  ['multi-line double quotes', 'A="multi\nline"', { A: 'multi\nline' }],
  ['inline comments', 'A=1 # trailing\nB="x" # trailing', { A: '1', B: 'x' }],
  ['export prefix', 'export A=1', { A: '1' }],
  ['empty values', 'A=\nEMPTY=""', { A: '', EMPTY: '' }],
  ['key without equals', 'A', {}],
  ['equals inside value', 'A=1=2', { A: '1=2' }],
  ['CRLF line endings', 'A=a\r\nB=b', { A: 'a', B: 'b' }],
  ['duplicate keys keep the last', 'A=1\nA=2', { A: '2' }],
]

sharedCases.push(...EQUALITY_PROBES.map(([name, pair, expected]) => ({
  name: 'util.isDeepStrictEqual ' + name,
  run: () => { const [left, right] = pair(); return s.util.isDeepStrictEqual(left, right) },
  expected,
})))

sharedCases.push(...ENV_PROBES.map(([name, input, expected]) => ({
  name: 'util.parseEnv ' + name,
  run: () => s.util.parseEnv(input),
  expected,
})))

sharedCases.push(
  { name: 'crypto.randomBytes callback gets a Buffer of the size with a null error', run: () => new Promise((resolve) => { s.crypto.randomBytes(8, (error, buffer) => resolve([error, buffer.length, Buffer.isBuffer(buffer)])) }), expected: [null, 8, true] },
  { name: 'crypto.randomBytes callback runs after the synchronous code and returns undefined', run: () => new Promise((resolve) => { const seq = []; const returned = s.crypto.randomBytes(1, () => seq.push('cb')); seq.push('sync'); globalThis.setTimeout(() => resolve([returned === undefined, seq]), 20) }), expected: [true, ['sync', 'cb']] },
  { name: 'crypto.randomBytes without a callback returns a Buffer', run: () => Buffer.isBuffer(s.crypto.randomBytes(3)), expected: true },
  { name: 'timers-promises setTimeout rejects with AbortError when the signal is already aborted', run: () => s['timers-promises'].setTimeout(10, 'v', { signal: AbortSignal.abort() }).then(() => 'resolved', (error) => [error.name, error.code, error.message]), expected: ['AbortError', 'ABORT_ERR', 'The operation was aborted'] },
  { name: 'timers-promises setTimeout rejects a pending wait when its signal aborts', run: () => { const controller = new AbortController(); const pending = s['timers-promises'].setTimeout(1000, 'v', { signal: controller.signal }); controller.abort(); return pending.then(() => 'resolved', (error) => [error.name, error.code, error.message]) }, expected: ['AbortError', 'ABORT_ERR', 'The operation was aborted'] },
  { name: 'timers-promises abort error carries the signal reason as its cause', run: () => { const reason = new Error('custom'); const controller = new AbortController(); const pending = s['timers-promises'].setTimeout(1000, 'v', { signal: controller.signal }); controller.abort(reason); return pending.then(() => 'resolved', (error) => error.cause === reason) }, expected: true },
  { name: 'timers-promises setTimeout resolves when its signal never aborts', run: () => s['timers-promises'].setTimeout(5, 'ok', { signal: new AbortController().signal }), expected: 'ok' },
)

async function opendirScenario() {
  const root = await fsp.mkdtemp('/tmp/opendir-')
  await fsp.writeFile(root + '/a.txt', 'x')
  await fsp.mkdir(root + '/sub')
  const dir = await fsp.opendir(root)
  const out = { className: dir.constructor.name, pathMatches: dir.path === root }
  const entries = []
  for (let entry = await dir.read(); entry !== null; entry = await dir.read()) entries.push([entry.name, entry.isFile(), entry.isDirectory()])
  out.entries = entries.sort(byName)
  out.afterEnd = await dir.read()
  await dir.close()
  out.closeAgain = await dir.close().then(() => 'resolved', (error) => [error.name, error.code, error.message])
  out.readAfterClose = await dir.read().then(() => 'resolved', (error) => error.code)
  await fsp.rm(root, { recursive: true, force: true })
  return out
}

async function opendirIterateScenario() {
  const root = await fsp.mkdtemp('/tmp/opendir-')
  await fsp.writeFile(root + '/b.txt', 'x')
  await fsp.mkdir(root + '/d')
  const dir = await fsp.opendir(root)
  const names = []
  for await (const entry of dir) names.push([entry.name, entry.isDirectory()])
  const afterEnd = await dir.read().then(() => 'open', (error) => error.code)
  const early = await fsp.opendir(root)
  for await (const entry of early) break
  const afterBreak = await early.read().then(() => 'open', (error) => error.code)
  await fsp.rm(root, { recursive: true, force: true })
  return { names: names.sort(byName), afterEnd, afterBreak }
}

sharedCases.push(
  { name: 'fs.promises.opendir Dir reads Dirents then null, and closes', run: opendirScenario, expected: {
    className: 'Dir', pathMatches: true, entries: [['a.txt', true, false], ['sub', false, true]], afterEnd: null,
    closeAgain: ['Error', 'ERR_DIR_CLOSED', 'Directory handle was closed'], readAfterClose: 'ERR_DIR_CLOSED',
  } },
  { name: 'fs.promises.opendir async iterator yields every entry and closes at the end', run: opendirIterateScenario, expected: {
    names: [['b.txt', false], ['d', true]], afterEnd: 'ERR_DIR_CLOSED', afterBreak: 'ERR_DIR_CLOSED',
  } },
  { name: 'fs.promises.opendir rejects a missing path with ENOENT', run: () => fsp.opendir('/tmp/no-such-dir-for-parity').then(() => 'resolved', (error) => error.code), expected: 'ENOENT' },
  { name: 'fs.promises.opendir rejects a file with ENOTDIR', run: async () => { const root = await fsp.mkdtemp('/tmp/opendir-'); await fsp.writeFile(root + '/f', 'x'); const code = await fsp.opendir(root + '/f').then(() => 'resolved', (error) => error.code); await fsp.rm(root, { recursive: true, force: true }); return code }, expected: 'ENOTDIR' },
)

const zlibGzip = (input) => new Promise((resolve, reject) => s.zlib.gzip(input, (error, output) => (error ? reject(error) : resolve(output))))
const zlibGunzip = (input) => new Promise((resolve, reject) => s.zlib.gunzip(input, (error, output) => (error ? reject(error) : resolve(output))))

sharedCases.push(
  { name: 'zlib.gzip then gunzip round-trips a string', run: async () => (await zlibGunzip(await zlibGzip(Buffer.from('hello hello')))).toString(), expected: 'hello hello', gap: 'zlib.gzip' },
  { name: 'zlib.gzip header bytes match Node (magic, deflate, zero mtime, XFL 0, OS 3)', run: async () => Array.from((await zlibGzip(Buffer.from('hello hello'))).subarray(0, 10)), expected: [31, 139, 8, 0, 0, 0, 0, 0, 0, 3], gap: 'zlib.gzip' },
  { name: 'zlib.gzip trailer records the input length', run: async () => Array.from((await zlibGzip(Buffer.from('abc'))).subarray(-4)), expected: [3, 0, 0, 0], gap: 'zlib.gzip' },
  { name: 'zlib.gzip of empty input is 20 bytes and gunzips to empty', run: async () => [(await zlibGzip(Buffer.alloc(0))).length, (await zlibGunzip(await zlibGzip(Buffer.alloc(0)))).length], expected: [20, 0], gap: 'zlib.gzip' },
  { name: 'zlib.gunzip rejects bytes that are not gzip', run: () => zlibGunzip(Buffer.from('nope')), expected: 'threw: incorrect header check' },
)

async function withScratch(run) {
  const dir = await fsp.mkdtemp('/tmp/append-')
  try {
    return await run(dir)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
}

sharedCases.push(
  { name: 'fs.promises.writeFile flag a creates a missing file', run: () => withScratch(async (dir) => { await fsp.writeFile(dir + '/new.txt', 'one', { flag: 'a' }); return fsp.readFile(dir + '/new.txt', 'utf8') }), expected: 'one' },
  { name: 'fs.promises.writeFile flag a appends to an existing file', run: () => withScratch(async (dir) => { await fsp.writeFile(dir + '/exist.txt', 'abc'); await fsp.writeFile(dir + '/exist.txt', 'DEF', { flag: 'a' }); return fsp.readFile(dir + '/exist.txt', 'utf8') }), expected: 'abcDEF' },
  { name: 'fs.promises.writeFile flag a appends bytes unchanged', run: () => withScratch(async (dir) => { await fsp.writeFile(dir + '/bin', Buffer.from([1])); await fsp.writeFile(dir + '/bin', Buffer.from([2, 3]), { flag: 'a' }); return Array.from(await fsp.readFile(dir + '/bin')) }), expected: [1, 2, 3] },
  { name: 'fs.promises.writeFile flag a appends a large buffer in full', run: () => withScratch(async (dir) => { await fsp.writeFile(dir + '/big', 'abc'); await fsp.writeFile(dir + '/big', Buffer.alloc(200000, 65), { flag: 'a' }); const bytes = await fsp.readFile(dir + '/big'); return [bytes.length, bytes[bytes.length - 1]] }), expected: [200003, 65] },
  { name: 'fs.promises.writeFile default flag still overwrites', run: () => withScratch(async (dir) => { await fsp.writeFile(dir + '/w.txt', 'abc'); await fsp.writeFile(dir + '/w.txt', 'X'); return fsp.readFile(dir + '/w.txt', 'utf8') }), expected: 'X' },
)

function parseArgsOutcome(config) {
  try {
    const result = s.util.parseArgs(config)
    return { values: result.values, positionals: result.positionals, tokens: result.tokens }
  } catch (error) {
    return { error: [error.name, error.code, error.message] }
  }
}

const BOOL_F = { foo: { type: 'boolean', short: 'f' } }
const STR_BAR = { bar: { type: 'string', short: 'b' } }
const ERR_UNKNOWN = 'ERR_PARSE_ARGS_UNKNOWN_OPTION'
const ERR_VALUE = 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE'
const ERR_POSITIONAL = 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL'

function loopbackEntries(ni) {
  return Object.values(ni).flat().filter((entry) => entry.internal)
}

sharedCases.push(
  { name: 'util.parseArgs short flag', run: () => parseArgsOutcome({ args: ['-f'], options: BOOL_F }), expected: { values: { foo: true }, positionals: [] } },
  { name: 'util.parseArgs long flag', run: () => parseArgsOutcome({ args: ['--foo'], options: BOOL_F }), expected: { values: { foo: true }, positionals: [] } },
  { name: 'util.parseArgs long value as the next argument', run: () => parseArgsOutcome({ args: ['--bar', 'x'], options: STR_BAR }), expected: { values: { bar: 'x' }, positionals: [] } },
  { name: 'util.parseArgs long value with equals', run: () => parseArgsOutcome({ args: ['--bar=x'], options: STR_BAR }), expected: { values: { bar: 'x' }, positionals: [] } },
  { name: 'util.parseArgs short value as the next argument', run: () => parseArgsOutcome({ args: ['-b', 'x'], options: STR_BAR }), expected: { values: { bar: 'x' }, positionals: [] } },
  { name: 'util.parseArgs short value attached', run: () => parseArgsOutcome({ args: ['-bx'], options: STR_BAR }), expected: { values: { bar: 'x' }, positionals: [] } },
  { name: 'util.parseArgs combined short flags', run: () => parseArgsOutcome({ args: ['-ab'], options: { a: { type: 'boolean', short: 'a' }, b: { type: 'boolean', short: 'b' } } }), expected: { values: { a: true, b: true }, positionals: [] } },
  { name: 'util.parseArgs negation with allowNegative', run: () => parseArgsOutcome({ args: ['--no-color'], options: { color: { type: 'boolean' } }, allowNegative: true }), expected: { values: { color: false }, positionals: [] } },
  { name: 'util.parseArgs negation rejected without allowNegative', run: () => parseArgsOutcome({ args: ['--no-color'], options: { color: { type: 'boolean' } } }), expected: { error: ['TypeError', ERR_UNKNOWN, "Unknown option '--no-color'"] } },
  { name: 'util.parseArgs negation rejected for a string option', run: () => parseArgsOutcome({ args: ['--no-x'], options: { x: { type: 'string' } }, allowNegative: true }), expected: { error: ['TypeError', ERR_UNKNOWN, "Unknown option '--no-x'"] } },
  { name: 'util.parseArgs positionals around options', run: () => parseArgsOutcome({ args: ['a', '-f', 'b'], options: BOOL_F, allowPositionals: true }), expected: { values: { foo: true }, positionals: ['a', 'b'] } },
  { name: 'util.parseArgs positional rejected in strict mode', run: () => parseArgsOutcome({ args: ['a'], options: {} }), expected: { error: ['TypeError', ERR_POSITIONAL, "Unexpected argument 'a'. This command does not take positional arguments"] } },
  { name: 'util.parseArgs terminator makes the rest positional', run: () => parseArgsOutcome({ args: ['--', '-f'], options: BOOL_F, allowPositionals: true }), expected: { values: {}, positionals: ['-f'] } },
  { name: 'util.parseArgs bare dash is a positional', run: () => parseArgsOutcome({ args: ['-'], options: {}, allowPositionals: true }), expected: { values: {}, positionals: ['-'] } },
  { name: 'util.parseArgs multiple collects every value', run: () => parseArgsOutcome({ args: ['--x', '1', '--x', '2'], options: { x: { type: 'string', multiple: true } } }), expected: { values: { x: ['1', '2'] }, positionals: [] } },
  { name: 'util.parseArgs string repeated keeps the last value', run: () => parseArgsOutcome({ args: ['--x', '1', '--x', '2'], options: { x: { type: 'string' } } }), expected: { values: { x: '2' }, positionals: [] } },
  { name: 'util.parseArgs repeated boolean stays true', run: () => parseArgsOutcome({ args: ['--f', '--f'], options: { f: { type: 'boolean' } } }), expected: { values: { f: true }, positionals: [] } },
  { name: 'util.parseArgs default applies when absent', run: () => parseArgsOutcome({ args: [], options: { x: { type: 'string', default: 'd' } } }), expected: { values: { x: 'd' }, positionals: [] } },
  { name: 'util.parseArgs default does not override a given value', run: () => parseArgsOutcome({ args: ['--x', 'v'], options: { x: { type: 'string', default: 'd' } } }), expected: { values: { x: 'v' }, positionals: [] } },
  { name: 'util.parseArgs boolean default', run: () => parseArgsOutcome({ args: [], options: { f: { type: 'boolean', default: true } } }), expected: { values: { f: true }, positionals: [] } },
  { name: 'util.parseArgs empty arguments', run: () => parseArgsOutcome({ args: [], options: {} }), expected: { values: {}, positionals: [] } },
  { name: 'util.parseArgs unknown long option in strict mode', run: () => parseArgsOutcome({ args: ['--nope'], options: {} }), expected: { error: ['TypeError', ERR_UNKNOWN, "Unknown option '--nope'"] } },
  { name: 'util.parseArgs unknown long option hints at the terminator when positionals are allowed', run: () => parseArgsOutcome({ args: ['--nope'], options: {}, allowPositionals: true }), expected: { error: ['TypeError', ERR_UNKNOWN, "Unknown option '--nope'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"--nope\""] } },
  { name: 'util.parseArgs unknown short option in strict mode', run: () => parseArgsOutcome({ args: ['-z'], options: {} }), expected: { error: ['TypeError', ERR_UNKNOWN, "Unknown option '-z'"] } },
  { name: 'util.parseArgs unknown short option hints when positionals are allowed', run: () => parseArgsOutcome({ args: ['-z'], options: {}, allowPositionals: true }), expected: { error: ['TypeError', ERR_UNKNOWN, "Unknown option '-z'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"-z\""] } },
  { name: 'util.parseArgs unknown options are kept when not strict', run: () => parseArgsOutcome({ args: ['--nope', 'v'], options: {}, strict: false }), expected: { values: { nope: true }, positionals: ['v'] } },
  { name: 'util.parseArgs missing long value in strict mode', run: () => parseArgsOutcome({ args: ['--bar'], options: STR_BAR }), expected: { error: ['TypeError', ERR_VALUE, "Option '-b, --bar <value>' argument missing"] } },
  { name: 'util.parseArgs missing short value in strict mode', run: () => parseArgsOutcome({ args: ['-b'], options: STR_BAR }), expected: { error: ['TypeError', ERR_VALUE, "Option '-b, --bar <value>' argument missing"] } },
  { name: 'util.parseArgs boolean rejects an inline value in strict mode', run: () => parseArgsOutcome({ args: ['--foo=1'], options: BOOL_F }), expected: { error: ['TypeError', ERR_VALUE, "Option '-f, --foo' does not take an argument"] } },
  { name: 'util.parseArgs ambiguous long value in strict mode', run: () => parseArgsOutcome({ args: ['--bar', '-x'], options: STR_BAR }), expected: { error: ['TypeError', ERR_VALUE, "Option '--bar' argument is ambiguous.\nDid you forget to specify the option argument for '--bar'?\nTo specify an option argument starting with a dash use '--bar=-XYZ'."] } },
  { name: 'util.parseArgs ambiguous short value in strict mode', run: () => parseArgsOutcome({ args: ['-b', '-x'], options: STR_BAR }), expected: { error: ['TypeError', ERR_VALUE, "Option '-b' argument is ambiguous.\nDid you forget to specify the option argument for '-b'?\nTo specify an option argument starting with a dash use '--bar=-XYZ' or '-b-XYZ'."] } },
  { name: 'util.parseArgs short boolean followed by an unknown character', run: () => parseArgsOutcome({ args: ['-f=1'], options: BOOL_F }), expected: { error: ['TypeError', ERR_UNKNOWN, "Unknown option '-='"] } },
  { name: 'util.parseArgs a dash value is taken when not strict', run: () => parseArgsOutcome({ args: ['--bar', '-x'], options: STR_BAR, strict: false }), expected: { values: { bar: '-x' }, positionals: [] } },
  { name: 'util.parseArgs missing value is true when not strict', run: () => parseArgsOutcome({ args: ['--bar'], options: STR_BAR, strict: false }), expected: { values: { bar: true }, positionals: [] } },
  { name: 'util.parseArgs inline value on a boolean is kept when not strict', run: () => parseArgsOutcome({ args: ['--foo=1'], options: BOOL_F, strict: false }), expected: { values: { foo: '1' }, positionals: [] } },
  { name: 'util.parseArgs positional rejected when allowPositionals is false outside strict mode', run: () => parseArgsOutcome({ args: ['a'], options: {}, strict: false, allowPositionals: false }), expected: { error: ['TypeError', ERR_POSITIONAL, "Unexpected argument 'a'. This command does not take positional arguments"] } },
  { name: 'util.parseArgs short boolean among positionals', run: () => parseArgsOutcome({ args: ['-f', 'x'], options: BOOL_F, allowPositionals: true }), expected: { values: { foo: true }, positionals: ['x'] } },
  { name: 'util.parseArgs token shape for a value and a positional', run: () => parseArgsOutcome({ args: ['--bar', 'x', 'p'], options: STR_BAR, allowPositionals: true, tokens: true }), expected: { values: { bar: 'x' }, positionals: ['p'], tokens: [{ kind: 'option', name: 'bar', rawName: '--bar', index: 0, value: 'x', inlineValue: false }, { kind: 'positional', index: 2, value: 'p' }] } },
  { name: 'util.parseArgs token shape for the terminator', run: () => parseArgsOutcome({ args: ['--', '-f'], options: BOOL_F, allowPositionals: true, tokens: true }), expected: { values: {}, positionals: ['-f'], tokens: [{ kind: 'option-terminator', index: 0 }, { kind: 'positional', index: 1, value: '-f' }] } },
  { name: 'util.parseArgs token shape for a negation', run: () => parseArgsOutcome({ args: ['--no-color'], options: { color: { type: 'boolean' } }, allowNegative: true, tokens: true }), expected: { values: { color: false }, positionals: [], tokens: [{ kind: 'option', name: 'color', rawName: '--no-color', index: 0 }] } },
  { name: 'util.parseArgs token shape for an attached short value', run: () => parseArgsOutcome({ args: ['-bx'], options: STR_BAR, tokens: true }), expected: { values: { bar: 'x' }, positionals: [], tokens: [{ kind: 'option', name: 'bar', rawName: '-b', index: 0, value: 'x', inlineValue: true }] } },
)

sharedCases.push(
  { name: 'os.networkInterfaces loopback entries carry address, family, cidr and netmask', run: () => loopbackEntries(s.os.networkInterfaces()).map((entry) => [entry.address, entry.family, entry.cidr, entry.netmask]), expected: [['127.0.0.1', 'IPv4', '127.0.0.1/8', '255.0.0.0'], ['::1', 'IPv6', '::1/128', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff']] },
  { name: 'os.networkInterfaces entry keys for IPv4 and IPv6 differ only by scopeid', run: () => { const [v4, v6] = s.os.networkInterfaces().lo; return [Object.keys(v4).sort(), Object.keys(v6).sort()] }, expected: [['address', 'cidr', 'family', 'internal', 'mac', 'netmask'], ['address', 'cidr', 'family', 'internal', 'mac', 'netmask', 'scopeid']] },
  { name: 'os.networkInterfaces loopback mac and scopeid values', run: () => { const [v4, v6] = s.os.networkInterfaces().lo; return [v4.mac, v6.mac, v6.scopeid] }, expected: ['00:00:00:00:00:00', '00:00:00:00:00:00', 0] },
  { name: 'os.networkInterfaces names the loopback interface lo and marks it internal', run: () => { const ni = s.os.networkInterfaces(); return [Object.keys(ni).includes('lo'), ni.lo.every((entry) => entry.internal === true)] }, expected: [true, true] },
  { name: 'os.networkInterfaces groups IPv4 before IPv6 under one name', run: () => s.os.networkInterfaces().lo.map((entry) => entry.family), expected: ['IPv4', 'IPv6'] },
  { name: 'os.networkInterfaces every entry has a string address and family and a boolean internal', run: () => Object.values(s.os.networkInterfaces()).flat().every((entry) => typeof entry.address === 'string' && typeof entry.family === 'string' && typeof entry.internal === 'boolean'), expected: true },
)

function headerValueOutcome(name, value) {
  try {
    s.http.validateHeaderValue(name, value)
    return 'valid'
  } catch (error) {
    return [error.name, error.code, error.message]
  }
}

const UNDEFINED_VALUE = ['TypeError', 'ERR_HTTP_INVALID_HEADER_VALUE', 'Invalid value "undefined" for header "x-test"']
const INVALID_CHAR = ['TypeError', 'ERR_INVALID_CHAR', 'Invalid character in header content ["x-test"]']

sharedCases.push(
  { name: 'http.validateHeaderValue accepts printable ASCII', run: () => headerValueOutcome('x-test', 'value'), expected: 'valid' },
  { name: 'http.validateHeaderValue accepts a horizontal tab', run: () => headerValueOutcome('x-test', 'a\tb'), expected: 'valid' },
  { name: 'http.validateHeaderValue accepts obs-text above 0x7f up to 0xff', run: () => headerValueOutcome('x-test', 'caf\xe9'), expected: 'valid' },
  { name: 'http.validateHeaderValue accepts an empty string', run: () => headerValueOutcome('x-test', ''), expected: 'valid' },
  { name: 'http.validateHeaderValue accepts null because only undefined is rejected', run: () => headerValueOutcome('x-test', null), expected: 'valid' },
  { name: 'http.validateHeaderValue coerces numbers and objects before checking', run: () => [headerValueOutcome('x-test', 5), headerValueOutcome('x-test', {})], expected: ['valid', 'valid'] },
  { name: 'http.validateHeaderValue rejects undefined with ERR_HTTP_INVALID_HEADER_VALUE', run: () => headerValueOutcome('x-test', undefined), expected: UNDEFINED_VALUE },
  { name: 'http.validateHeaderValue rejects a line feed with ERR_INVALID_CHAR', run: () => headerValueOutcome('x-test', 'a\nb'), expected: INVALID_CHAR },
  { name: 'http.validateHeaderValue rejects a carriage return with ERR_INVALID_CHAR', run: () => headerValueOutcome('x-test', 'a\rb'), expected: INVALID_CHAR },
  { name: 'http.validateHeaderValue rejects a NUL byte with ERR_INVALID_CHAR', run: () => headerValueOutcome('x-test', 'a\x00b'), expected: INVALID_CHAR },
  { name: 'http.validateHeaderValue rejects DEL with ERR_INVALID_CHAR', run: () => headerValueOutcome('x-test', 'a\x7fb'), expected: INVALID_CHAR },
  { name: 'http.validateHeaderValue rejects a code point above 0xff with ERR_INVALID_CHAR', run: () => headerValueOutcome('x-test', 'aĀb'), expected: INVALID_CHAR },
  { name: 'http.validateHeaderValue does not check the header name', run: () => [headerValueOutcome('bad name', 'ok'), headerValueOutcome('', 'x')], expected: ['valid', 'valid'] },
)

sharedCases.push(
  { name: 'os.release equals the kernel release file with its newline removed', run: async () => s.os.release() === (await fsp.readFile('/proc/sys/kernel/osrelease', 'utf8')).trimEnd(), expected: true },
  { name: 'os.release is one line of printable text without spaces', run: () => /^[\x21-\x7e]+$/.test(s.os.release()), expected: true },
  { name: 'os.release starts with a kernel version number', run: () => /^\d+\.\d+/.test(s.os.release()), expected: true },
  { name: 'os.release returns the same value on every call', run: () => s.os.release() === s.os.release(), expected: true },
)

const WATCH_INTERVAL_MS = 20
const WATCH_DEADLINE_MS = 2000
const STAT_NUMBER_FIELDS = ['dev', 'mode', 'nlink', 'uid', 'gid', 'rdev', 'blksize', 'ino', 'size', 'blocks', 'atimeMs', 'mtimeMs', 'ctimeMs', 'birthtimeMs']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function untilEvents(events, count) {
  const deadline = performance.now() + WATCH_DEADLINE_MS
  while (events.length < count) {
    if (performance.now() > deadline) throw new Error(events.length + ' of ' + count + ' watchFile events within ' + WATCH_DEADLINE_MS + ' ms')
    await sleep(5)
  }
  return events
}

async function watchFor(file, body) {
  const events = []
  const listener = (curr, prev) => events.push({ curr, prev })
  s.fs.watchFile(file, { interval: WATCH_INTERVAL_MS }, listener)
  try {
    return await body(events)
  } finally {
    s.fs.unwatchFile(file, listener)
  }
}

async function replaceFile(file, content) {
  await fsp.writeFile(file + '.next', content)
  await fsp.rename(file + '.next', file)
}

async function withTempDir(body) {
  const dir = await fsp.mkdtemp('/tmp/watch-')
  try {
    return await body(dir)
  } finally {
    await fsp.rm(dir, { recursive: true })
  }
}

const statShape = (stats) => ({
  numbers: STAT_NUMBER_FIELDS.every((field) => typeof stats[field] === 'number'),
  dates: [stats.atime, stats.mtime, stats.ctime, stats.birthtime].every((date) => date instanceof Date),
  isFile: typeof stats.isFile === 'function',
})

sharedCases.push(
  {
    name: 'fs.watchFile reports Node-shaped current and previous stats after a change',
    run: () => withTempDir(async (dir) => {
      const file = dir + '/a.txt'
      await fsp.writeFile(file, 'one')
      return watchFor(file, async (events) => {
        await sleep(WATCH_INTERVAL_MS * 4)
        await replaceFile(file, 'longer content')
        const [{ curr, prev }] = await untilEvents(events, 1)
        const onDisk = await fsp.stat(file)
        return {
          curr: statShape(curr),
          prev: statShape(prev),
          currSize: curr.size,
          prevSize: prev.size,
          currIsFile: curr.isFile(),
          prevIsFile: prev.isFile(),
          currIno: curr.ino === onDisk.ino,
          currMode: curr.mode === onDisk.mode,
        }
      })
    }),
    expected: {
      curr: { numbers: true, dates: true, isFile: true },
      prev: { numbers: true, dates: true, isFile: true },
      currSize: 14,
      prevSize: 3,
      currIsFile: true,
      prevIsFile: true,
      currIno: true,
      currMode: true,
    },
  },
  {
    name: 'fs.unwatchFile stops further watchFile events',
    run: () => withTempDir(async (dir) => {
      const file = dir + '/a.txt'
      await fsp.writeFile(file, 'one')
      const events = []
      const listener = (curr) => events.push(curr)
      s.fs.watchFile(file, { interval: WATCH_INTERVAL_MS }, listener)
      try {
        await sleep(WATCH_INTERVAL_MS * 4)
        await replaceFile(file, 'two two')
        await untilEvents(events, 1)
      } finally {
        s.fs.unwatchFile(file, listener)
      }
      const beforeLater = events.length
      await replaceFile(file, 'three three three')
      await sleep(WATCH_INTERVAL_MS * 8)
      return { beforeLater, afterLater: events.length }
    }),
    expected: { beforeLater: 1, afterLater: 1 },
  },
  {
    name: 'fs.watchFile on a missing path reports one zeroed event, as Node does',
    run: () => withTempDir((dir) => watchFor(dir + '/nope.txt', async (events) => {
      await untilEvents(events, 1)
      await sleep(WATCH_INTERVAL_MS * 4)
      const [{ curr, prev }] = events
      return {
        count: events.length,
        currSize: curr.size,
        currMtimeMs: curr.mtimeMs,
        currNlink: curr.nlink,
        currIno: curr.ino,
        currIsFile: curr.isFile(),
        currMtimeIsEpoch: curr.mtime.getTime() === 0,
        prevSize: prev.size,
        prevIsFile: prev.isFile(),
      }
    })),
    expected: { count: 1, currSize: 0, currMtimeMs: 0, currNlink: 0, currIno: 0, currIsFile: false, currMtimeIsEpoch: true, prevSize: 0, prevIsFile: false },
  },
  {
    name: 'fs.watchFile reports a path once it appears after being missing',
    run: () => withTempDir((dir) => {
      const file = dir + '/late.txt'
      return watchFor(file, async (events) => {
        await untilEvents(events, 1)
        await replaceFile(file, 'hello')
        await untilEvents(events, 2)
        const [, { curr, prev }] = events
        return { count: events.length, currSize: curr.size, currIsFile: curr.isFile(), prevSize: prev.size, prevIsFile: prev.isFile() }
      })
    }),
    expected: { count: 2, currSize: 5, currIsFile: true, prevSize: 0, prevIsFile: false },
  },
  {
    name: 'fs.watchFile stays silent while the file is unchanged',
    run: () => withTempDir(async (dir) => {
      const file = dir + '/a.txt'
      await fsp.writeFile(file, 'one')
      return watchFor(file, async (events) => {
        await sleep(WATCH_INTERVAL_MS * 8)
        return events.length
      })
    }),
    expected: 0,
  },
)

sharedCases.push(
  { name: "crypto.createHash md5 digest of empty", run: () => s.crypto.createHash('md5').update('').digest('hex'), expected: "d41d8cd98f00b204e9800998ecf8427e" },
  { name: "crypto.createHash md5 digest of abc", run: () => s.crypto.createHash('md5').update('abc').digest('hex'), expected: "900150983cd24fb0d6963f7d28e17f72" },
  { name: "crypto.createHash md5 digest of long", run: () => s.crypto.createHash('md5').update('x'.repeat(200)).digest('hex'), expected: "30a83621ce5422fbdfdd539777458c78" },
  { name: "crypto.createHash md5 digest of utf8", run: () => s.crypto.createHash('md5').update('héllo ✓').digest('hex'), expected: "21b1ae5bc147bb564254200a4731e337" },
  { name: "crypto.createHash sha1 digest of empty", run: () => s.crypto.createHash('sha1').update('').digest('hex'), expected: "da39a3ee5e6b4b0d3255bfef95601890afd80709" },
  { name: "crypto.createHash sha1 digest of abc", run: () => s.crypto.createHash('sha1').update('abc').digest('hex'), expected: "a9993e364706816aba3e25717850c26c9cd0d89d" },
  { name: "crypto.createHash sha1 digest of long", run: () => s.crypto.createHash('sha1').update('x'.repeat(200)).digest('hex'), expected: "94218caae9904e93a3d7bf578bf4791926fc5e82" },
  { name: "crypto.createHash sha1 digest of utf8", run: () => s.crypto.createHash('sha1').update('héllo ✓').digest('hex'), expected: "b7c2a1aa52961195ac19331417a20a8b4f202ddb" },
  { name: "crypto.createHash sha256 digest of empty", run: () => s.crypto.createHash('sha256').update('').digest('hex'), expected: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  { name: "crypto.createHash sha256 digest of abc", run: () => s.crypto.createHash('sha256').update('abc').digest('hex'), expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
  { name: "crypto.createHash sha256 digest of long", run: () => s.crypto.createHash('sha256').update('x'.repeat(200)).digest('hex'), expected: "aa20c23e3201834050679e1d88941b9a6fed0557c9a705cb2c315e2e63fd486d" },
  { name: "crypto.createHash sha256 digest of utf8", run: () => s.crypto.createHash('sha256').update('héllo ✓').digest('hex'), expected: "5657cdef8a85a584e0e961e6f8247cf5d3f8ed21496ed6fdbcfd43a761e94245" },
  { name: "crypto.createHash sha512 digest of empty", run: () => s.crypto.createHash('sha512').update('').digest('hex'), expected: "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e" },
  { name: "crypto.createHash sha512 digest of abc", run: () => s.crypto.createHash('sha512').update('abc').digest('hex'), expected: "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f" },
  { name: "crypto.createHash sha512 digest of long", run: () => s.crypto.createHash('sha512').update('x'.repeat(200)).digest('hex'), expected: "ef978e23dc520404ae16fd17bde9ee5945610d671551d6863a5ffbc99433fc726726e51f989b886191be9325b8f8b03b1a63fe3e5eff23d126c2f41f07d2bf87" },
  { name: "crypto.createHash sha512 digest of utf8", run: () => s.crypto.createHash('sha512').update('héllo ✓').digest('hex'), expected: "5a8dbb6169e8fd30480c55d8b9f6e77d7bf79e4930c77ffcdec87eede5e5fa7faa79deba6a3fdf6532681ac3b079f29e7270cf11bd45bf143be032c4518d1496" },
  { name: "crypto.createHash digests chunked updates like one update", run: () => s.crypto.createHash('sha256').update('ab').update('c').digest('hex'), expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
  { name: "crypto.createHash digests a Buffer input", run: () => s.crypto.createHash('sha1').update(Buffer.from([0, 255, 16])).digest('hex'), expected: "a14c2fba17201c1ead45b6c4af4409fbfc16ba8a" },
  { name: "crypto.createHash base64 digest", run: () => s.crypto.createHash('sha256').update('abc').digest('base64'), expected: "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=" },
  { name: "crypto.createHash latin1 digest length", run: () => s.crypto.createHash('md5').update('abc').digest('latin1').length, expected: 16 },
  { name: "crypto.createHash default digest is a Buffer", run: () => Buffer.isBuffer(s.crypto.createHash('sha256').update('abc').digest()), expected: true },
  { name: "crypto.createHash hex input encoding", run: () => s.crypto.createHash('sha256').update('616263', 'hex').digest('hex'), expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
  { name: "crypto.createHash accepts an upper-case algorithm name", run: () => s.crypto.createHash('SHA256').update('abc').digest('hex'), expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
  { name: "crypto.createHash update rejects a number", run: () => s.crypto.createHash('sha256').update(5), expected: "threw: The \"data\" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received type number (5)" },
  { name: "crypto.createHash digest twice throws", run: () => (() => { const h = s.crypto.createHash('sha256'); h.digest(); return h.digest('hex') })(), expected: "threw: Digest already called" },
  { name: "crypto.createHash update after digest throws", run: () => (() => { const h = s.crypto.createHash('sha256'); h.digest(); return h.update('x') })(), expected: "threw: Digest already called" },
)

const gunzipOutcome = (hex) => new Promise((resolve) => {
  s.zlib.gunzip(Buffer.from(hex, 'hex'), (error, output) => resolve(error ? { code: error.code, message: error.message } : output.toString('hex')))
})

const FIXED_GZIP_HEX = '1f8b08000000000002034b4c4a4e842100342a6e5a0c000000'

sharedCases.push(
  { name: "zlib.gunzip stored block", run: () => gunzipOutcome('1f8b0800000000000403011400ebff73746f72656420626c6f636b207061796c6f6164bb40115b14000000'), expected: "73746f72656420626c6f636b207061796c6f6164" },
  { name: "zlib.gunzip fixed-Huffman block", run: () => gunzipOutcome('1f8b08000000000002034b4c4a4e842100342a6e5a0c000000'), expected: "616263616263616263616263" },
  { name: "zlib.gunzip dynamic-Huffman block", run: () => gunzipOutcome('1f8b08000000000002038d57db8ee33008fd95fe5ab2134dad6dda68662c45fefa958381c3c59d7d689af882e1c001dcb69fe5b63c8efb726bfdb51edfe5f17adefabb4e9de5f673ef9f7bbd95970c3f967dfde08f8fed2113f4fcbb1cc7b5f759c7c8e7b2efcb10852be97994be78ed93eb382c2eba66869ca58e37d0e99a3f4ba6dbb38249db30747cf1999b15a48faffb8b5ea24a2d1f86d5431952569501ac514f301144d3c077f9dcedc86b2f7fbeba1463d0b5b189f643019546be616f9324d4612315f583263b0ac14603b5f87a8c2a82b84fa269ac92b01bffcfccf50009ff60e8280148e75bfd0c0ec227ededc1a527a8a6a80ac2761623840d999c814e202cfc3a927d58a9724835cef67a23c609539185f49e2940ca45951c946c2822ae3eb741d9a3a7ff0c380e38cb38b5c6c711873d7d112dc824c6860c8008b15b687a738187661c05130b5071afe3283a968e7076880803bd70649c6e70dfabcbafb3678c3e1b74d6d0e854c004ed45c6b6e83d7b066d2479e016067fc84a8c37c95413b90d46b4b07fcf4a86e019c118245884b9ac791f42e6756f2e55f34ac298a63a31b678a0d7ad627c033847b1ac504d028ed1e067a5f9679d151ceb9ab6fd1a474e7c9a78189549221b00863a35cb21696dc5291bbb24ac874b1249022a1e8305321469c860130ed0fb39982f9c8e0512c74d79e7d6057383e96968ff51c60a545802e39ee39976446e10f2479623d7b4fead4a32e8a884123613c2abcd102010adb7b9e05a74894020d3c6c22b88fd13f91c45080e59da9a3d3b05c5e7b61e012757df38293d62d7855abee11906d3808689b4d76912c250876e316f02e52c9e6e23812431c239eb3fca8f0dab98a97c4d7dc3f6abc6470184c1ecb640e3d515bb59c2b6abbbbfc579483d40f72c3179d2d2a634c9b5a665d1705692ff916a1a88daaffbea7214d59a940c7e1aad7aec3b43db36cdf3122f8d8bf4754acce29e9812b0228e3368246b3794b9f6be318ef1d57c816473357d340f9fc24b5b300d1da5ab2eb75b77a1e23c95b553b1058b84cfef45c11d6b1e4e285b1ba1788a67dbac13e2f9d3a7ae8e1d898d95cd7935bd8bf81e085dae73595d7777706380f4d86f0ade0828b93f3571d9597ef14d34f27d8b09b9f63a405acefc661b055030fc036a0600766f110000'), expected: "7a65746120616c706861207a65746120757073696c6f6e206574612065746120616c706861207869207468657461206d7520696f746120616c706861206c616d62646120616c7068612064656c746120616c70686120616c706861206b61707061207869206e7520616c7068612067616d6d6120746865746120616c70686120616c70686120616c70686120706920786920626574612062657461206d7520616c70686120616c70686120616c70686120626574612067616d6d61207461752067616d6d6120696f746120616c7068612062657461207869206c616d62646120616c7068612064656c7461206e752065746120616c70686120657073696c6f6e20616c7068612065746120626574612065746120616c7068612062657461206265746120626574612072686f206265746120616c70686120616c70686120616c706861207a65746120616c70686120616c70686120616c706861206265746120616c706861206c616d6264612067616d6d612064656c7461206e7520657073696c6f6e2065746120616c7068612064656c746120626574612067616d6d61207a65746120616c7068612067616d6d61207369676d6120616c7068612067616d6d61206f6d6963726f6e20657073696c6f6e20616c706861207a657461207a6574612062657461206c616d6264612065746120616c706861206b6170706120757073696c6f6e2067616d6d6120616c7068612064656c746120657461206e752064656c74612065746120616c7068612072686f20616c70686120616c7068612062657461206c616d62646120616c706861206e7520616c706861206c616d6264612062657461206265746120616c70686120616c706861207468657461206d75206c616d62646120757073696c6f6e20657073696c6f6e206e7520616c70686120616c70686120616c7068612067616d6d61207a65746120657461206574612067616d6d61207a6574612070692065746120616c7068612064656c746120616c70686120657461206265746120616c7068612065746120616c706861206265746120616c70686120616c70686120616c7068612064656c746120746175206574612067616d6d61206d75206c616d62646120616c7068612067616d6d612067616d6d6120616c70686120786920616c70686120616c70686120657073696c6f6e206265746120616c70686120616c70686120616c70686120616c706861206b617070612074686574612065746120616c70686120616c7068612067616d6d6120706920616c70686120616c70686120786920616c70686120757073696c6f6e20616c70686120616c7068612064656c74612074617520616c70686120746865746120616c706861206c616d62646120616c7068612067616d6d612074686574612067616d6d61206574612065746120616c70686120616c706861206b6170706120616c70686120616c7068612067616d6d61206265746120616c7068612065746120657073696c6f6e2064656c746120616c7068612062657461206265746120657073696c6f6e20616c7068612072686f2072686f20657073696c6f6e206265746120786920616c70686120616c706861206265746120626574612072686f2074617520616c7068612062657461206265746120616c706861206f6d6963726f6e20616c706861207369676d6120746865746120757073696c6f6e206b617070612067616d6d61207a657461206f6d6963726f6e20616c706861206b6170706120657073696c6f6e20657073696c6f6e2064656c746120616c70686120706920696f746120616c706861207a65746120616c706861206d75207468657461207369676d612067616d6d6120786920616c70686120616c70686120616c706861207069206c616d62646120616c70686120616c706861206e75206b61707061206574612065746120616c706861206d75206d7520696f746120616c70686120616c70686120616c70686120616c70686120616c7068612067616d6d612067616d6d6120616c70686120616c70686120657073696c6f6e206f6d6963726f6e20616c70686120616c70686120616c706861206b617070612067616d6d61207a6574612064656c746120616c706861206c616d6264612062657461207a65746120657073696c6f6e20616c70686120616c70686120657073696c6f6e2064656c7461206b61707061206265746120616c70686120757073696c6f6e206c616d626461206c616d62646120616c70686120616c706861206574612072686f20626574612067616d6d6120746175206574612067616d6d61206574612067616d6d612067616d6d612065746120746865746120616c70686120616c70686120616c70686120616c706861206e752067616d6d6120616c70686120616c70686120616c70686120746175206c616d62646120657073696c6f6e20746175206b61707061207468657461206d7520746175207a6574612065746120616c706861206c616d62646120616c706861207a6574612067616d6d61206f6d6963726f6e2067616d6d6120616c7068612065746120616c70686120616c70686120757073696c6f6e2062657461206265746120616c706861207069206265746120657073696c6f6e20746175206b61707061206b61707061206265746120616c70686120746865746120616c70686120616c706861206e752062657461206e75207a65746120616c70686120616c70686120616c70686120657073696c6f6e2064656c7461207a65746120616c70686120616c70686120616c70686120616c70686120616c70686120616c70686120616c706861206e7520616c7068612067616d6d6120706920616c7068612065746120657461206265746120616c70686120616c70686120616c70686120657461206d75207a65746120616c7068612067616d6d6120616c706861206b6170706120616c70686120616c70686120616c70686120626574612062657461206265746120616c70686120616c706861206f6d6963726f6e20616c7068612067616d6d612072686f206c616d62646120616c70686120616c70686120616c706861207069206b6170706120616c706861207369676d6120616c70686120616c70686120616c706861207a6574612067616d6d6120626574612067616d6d61207a6574612064656c746120616c7068612064656c746120786920696f746120786920616c7068612067616d6d6120616c7068612064656c746120616c7068612067616d6d61206c616d6264612067616d6d612062657461206d75207369676d612067616d6d6120626574612062657461206d752064656c7461207069207369676d61207369676d6120616c70686120657073696c6f6e20746865746120616c7068612067616d6d6120616c706861206d7520616c70686120616c70686120616c706861206d7520616c70686120616c70686120696f746120616c706861206f6d6963726f6e20616c706861207369676d61206265746120616c706861206265746120616c70686120626574612074686574612067616d6d6120696f7461207a6574612065746120706920696f746120616c70686120696f746120616c70686120657073696c6f6e20616c706861206265746120616c706861207369676d612067616d6d61206c616d626461206c616d626461206265746120696f74612064656c746120616c7068612072686f20616c70686120616c7068612062657461206265746120616c70686120626574612067616d6d612064656c7461206b617070612064656c746120616c706861206d7520616c70686120657073696c6f6e20616c70686120616c70686120616c70686120616c70686120616c70686120616c706861207461752064656c7461207869206265746120786920616c706861206b617070612062657461206265746120616c706861206b6170706120706920616c70686120657073696c6f6e20616c706861207a6574612067616d6d612064656c746120616c70686120616c70686120616c706861206e7520616c70686120616c7068612064656c7461206c616d626461206d75207a657461206d7520616c706861206c616d62646120616c706861207a657461206b6170706120616c7068612064656c74612062657461206f6d6963726f6e20657073696c6f6e20616c706861206e7520616c706861206f6d6963726f6e207a657461206e7520696f746120616c706861206f6d6963726f6e20757073696c6f6e20696f746120616c70686120616c70686120616c70686120616c70686120616c706861206f6d6963726f6e20616c70686120746865746120616c70686120616c70686120657073696c6f6e20657073696c6f6e20626574612062657461206265746120616c70686120616c7068612072686f20746865746120616c70686120616c70686120657461206d752067616d6d6120746865746120616c70686120616c7068612067616d6d6120757073696c6f6e206f6d6963726f6e206c616d62646120616c706861207a6574612067616d6d612067616d6d6120757073696c6f6e2074617520706920616c706861207369676d6120616c706861207a657461206b61707061207869207a65746120616c70686120616c706861207369676d61207a65746120746865746120746865746120616c70686120616c70686120657461207369676d6120657073696c6f6e20626574612062657461206f6d6963726f6e206f6d6963726f6e2074686574612067616d6d6120616c70686120746175207a65746120626574612067616d6d6120616c7068612065746120706920706920616c706861206b6170706120696f746120616c70686120616c7068612064656c746120657073696c6f6e206265746120616c7068612067616d6d61206265746120616c70686120616c7068612067616d6d6120706920616c70686120657461206e7520616c706861207a6574612072686f20696f7461206b6170706120616c70686120616c706861206265746120616c7068612062657461206d7520616c70686120706920616c70686120786920696f74612064656c7461206b617070612064656c746120746175207869206265746120616c70686120616c70686120616c70686120616c706861206b6170706120616c70686120746865746120616c706861207a65746120616c70686120746865746120657073696c6f6e2072686f20616c706861207a6574612067616d6d6120616c70686120616c70686120746175207468657461206c616d6264612062657461207069206d752078692074686574612067616d6d61206f6d6963726f6e2065746120696f7461206f6d6963726f6e20616c70686120616c7068612067616d6d612067616d6d6120616c7068612064656c746120616c70686120616c706861206c616d62646120616c706861206e7520616c7068612067616d6d61206265746120616c706861206265746120746865746120616c70686120616c7068612067616d6d6120616c7068612067616d6d61206574612064656c746120616c70686120616c70686120657073696c6f6e20657073696c6f6e2067616d6d6120616c70686120616c70686120616c70686120657073696c6f6e20786920616c70686120657073696c6f6e2072686f2064656c74612064656c746120616c7068612067616d6d6120616c70686120706920616c70686120616c70686120616c70686120786920616c70686120616c7068612065746120616c7068612064656c7461206b6170706120616c70686120657461206f6d6963726f6e20616c7068612067616d6d6120657073696c6f6e20616c70686120657073696c6f6e2067616d6d61206d7520746865746120616c70686120616c70686120616c706861206d7520616c7068612064656c746120746865746120657461207a65746120696f74612078692067616d6d6120616c7068612064656c746120616c70686120616c70686120616c7068612067616d6d6120616c70686120746865746120616c70686120616c70686120616c70686120616c7068612064656c7461206265746120696f7461206e752067616d6d612065746120616c70686120616c70686120746865746120616c70686120616c70686120616c706861206c616d626461" },
  { name: "zlib.gunzip dynamic-Huffman block over a larger input", run: () => gunzipOutcome('1f8b0800000000000003955bed6edc380c7c95bcdae6ba688c8b5da3ad80859ffe604b226738a493fb51d76bcb12c5cf21a91ccfbf8fb7c7e7fef1783bcedbb6ff593e7f6d6fe7bdbf7a2d6f7f3fce9f6b7b5b7ed9e3cfc7fafe63fef8f1fcb417fdfaef63dfaf6fb7369efc7caceb634c8523fb755fcec1efe7cbf7b1980ebade8c791e6ddc014dd7fbd792d1b635d8d2736c74fc9a6b3e7922bffcfef8d56f94a4237f0ca307319d582706788d74c21661eafee0cff273e527bfd6e59fdfe72cb4a1ebc3c3a81f04f86c5d3653da7d26a4e1d949f41ffde5c905d923b1da643d9e3a07f13bd3a631cad46efcbf65a20796cc7ff0685f849141b6fe530484d7feeda95cbe82538aa420db5e0b4d323752ac8142e8bc88e3fadc3bcf6a8b341276a41b799c582a5a61bfcf08e8c42949819573a3c87197392be5a93de73f624e601c5b9cef26ead154fbfeab9b45dfd2e44ddf0068087fd25f3f83e2e136f6051d0b98e2dac6527dd9be44d8874d41ac371b19ab13dfd716fc6b7555ed63a5e38daa508127b85fb4d843a5c76bf40ffb7c2096c9fc3157b27972a6eec859197187e7ef2a64183f9519c3081e66b993f2f3115ade29cd4773bf9258cce1344ddee28291b686fa0dccd917b60aa744f8a81bde5a7fbfb52ae0b0688a41373c4c1dcfe44ae1c80603254e553e248dadf88a75b74f76aa4ba249c6545c0603245e418431bea20df4fbd7b07cb3690d90f89cc2fb842ee81b08d3f4eff7658c40824d313e727ea688283c04ff91f9486078bcc58870cd6226c19e106ed943c084b87bf605d7a06b0a64640a2c2281889fbacc710ae343e6b6aaeb698226738e47609340487feae6a1a80ba9bcb13354a6c19a69486bc0503039aa3aa0c51c04da5af3f5311c48a223d3677d23fcb05aa9a78a31f5c6daaf18af13741e54d9427fde42b0ab1c368f3ee56dc243d303eebe16759e7de8e1669253dd87e9c62791f37f34355744c7eb31baec8b53dd8914390da8aeb853605be9e74d5f8e19a4af55d48b47c33485b5e9a60755633d373a6dadd2305c11190d6219a8796cd7ddc711d9e7eced9fa01bda979374cb6e434235fd5406a71482a9c1e7799188e33d57279cdb8190ae12adad4242f3fd2bbaae93777d5a8d6c41aa788d094f08a1284205df63439c83d3060c63df04bca150963f1d26b2d7f2856c7493f710137cedb58041cef85135cd50869495ec569128c7e213fe4114d75da5be8339ef46082a9844745f19ec2a4dcb619e5395428054b3ee3b60d0e89eef22e529e40cf681186e3889bae740e62c107c272b2fcc34a68235ca48cb028175149193fc6924288f1642cafc0e1c33ee96644f04e6608b8346d7ddf32deb8ce6f3fdbb4e1a3ad4a8b5c23add119947a40cf0b9137197eb65ae0409474c11f58f61cabe8070040fccb0f715c3f725cf4e472db20f025d7317c6ace62c126772f70d9461c055afbe7aed11402e3ffa3f5e2a6a956d71a2d99de27d272842d62e1318363dde910a200484991a1b8b22de14af9ac5462c23816220d9b686577074813afa3a934e6d45538bae065cbc45b3db7c1ac9eef712eab15cfb5a546da2f9767e880682bef61179aac4b234b565f1db632f95e5a2d6c45e39ceca1912631c8ea9b7e4a2d5152ccba32b3318369184072b6b9a91eb22ec91538b8fc531fd5c2a40b10e59d46b446142fdb5200bdce9da40c5b1c407cac995d78b0f8575be162eebaf59f23c85dea79dbee0de8b691a9d8493591d64ddc24f759118537207993bcfd702b5cf90342b9195bf9110299d247361a3f21978ab9bba44b42f81df6b53477a6e6363e4de147361323eb2e9478bc84fad3e6f3108b3d52ae338e068eeae381e901f37e6662d98a09fc11238f94fbfc09660dc62cb001385bd2a9d893e8b120a2c576132ec4128f73402546c6681ce6c3a8a5aa1a291291583d146b828a27281022e09e488389dc28ed41f703153b1374b2934cb92c4616d528203d1f6354155e136839b112f9bc19302f21eee13df2872f10b59dd8113b4acb7864903b32c6fb9c53c49c8402ea0d9e27d84f29ab988026c14ffaa1edf50905ed9a2b981c268cfdfa8b4ce76a050c805340a980567e0415610c07bd29544d5262b22e0afaeb3bd1755899ab268496be3a871518d1dd7221b60aec43305a2a0b30461c95f31ed08931715a24ed1cbdce3c3fef9bedca723856618c011eb602da5b41c7d1702c7b4955435cfb2be543081900b671a8b6e52de430a33e5128abae80b3de9e584cafa6e38750454793c637e3d5a507aadfac7c43b9ac333ed526944c9fccb962fef4b065f82edb6dc6f63628047b2da17a245f8ce2455ab71155d74d564fc1ec9aaa6ba7f9e769bee27e95299a7510acbf3648d38e43d7b4eafd2be9e9da01250eeca9ba6665c6d45bbc58a51c850600b542ebd6f489a8fb375bd1b099693c93ee089dca6e720db4d4fea921349c15128b6322f6c9e50651bfc0cee1a2a4cb1462e0703d44c51083230742beed00a791b863e5ac0043ecea15977128645af4841b6ae594fb093c2136422dbf5d6d23c28ed133cff2a6332adf23159c264a2573f0f21049a5d5a697f86c2ab761bb1b164027e71010b00776220f92fa893dd967feebd5f7dbc2b5bdb32bbfb74273bf62034928fd5833e2302df77d5264833b7159405e50a6150c233278db8da6cd0f59d4ffd040c515454a2ed167d6fe08a201ece01bf6ac5e2333b12172081e72cd022c98a844ef7c6fdd18b5e3ade01781a3b7fc1de63b9ca03d368e0188bb8695529359cf54391540ac945a7c263413754d0d0cc7a53a4cb47459d01d56aa8ad379dc7b9331c0e3a77e8a2b29969dd27fbefdae44eb3355495780e16e5d130e48974e2c6032893536ea87e588ed5a86b732506b391034ee0c55dc4f5698cca6b26952878b132ca8ae68f578456fd9b4c96c949c5fb124bb56df7754c28362f38a81690c371052f605d2214b1f06c94a531c641e3e47d82e23e99353b550cd23ce0ba107e8080529d4ad63ff600a4dbdf98715f85d2739280cb329c4d62d6c6a128e02898683be4acb8da5fb25409a3f268e553cc722a8c4dd5354d8c36056b1cc28a9caa55e82d667b9676ae4db183735dcd78156f8bda95342f088ad1b9dcf9e704f1d3ecfcad0946190315ee9668a0015373fce8f2156ff627989067e5aacd8fcc79facf950f6ced4a188d869de4caac287589d00fcc8a930c0df2eafaed83e9bcc9ac1e720cc392a4643042b13f6277d8fd4e7152cf73c3ed8ac71268fc3cf09049301e00152f9b79ca7759c23742c5660111d22ac34379964633699cefe3c4fdb3adcdf65ecc9e87f77bb4083d3522cb29442ceb16a7aa93338f49a710e4241d4fb3670f9a370d44c661f03aaa425ab608c90814ace9efe9c07af4b4bf310296f1e3ed7a4acead04ed3103271aa82297e438446c91b2702447f4eaaa02810a5d87b328ee9cf7a49f91654fbd001d9e806388c080ec544e3d50017de8bc06e3c83e303f08c6fdc13909d7eb2b9464c68d0fa767892847bbe35fa1638eeef34f0130bfc499b33cd30300ae6e0a59a4c4b0f9d71234736b217ecfed921f861930808636985327a7fba04dfd0ca5dd005d544d1dea6691312d4117dd10fa830f3e09230e2b9cbeb93df1213a9884127713ec604ae3464706ac2caa28551686c73f63c7232b0022d6ad8fcd3b73fc4873b1a7a8dc24839922830e243d7c3f40f05a52f71ce09a088c21a0bf4d0b30a6890818cb136555cef092aec4edb18783797b4dbd277fa811b84b465acd9d38ee04abe25fa75ae527b6d940118e400ad77e0de60497aae82efe6d9be769dac5f777a26cc5f53f5dba3ef363410000'), expected: "7a65746120616c706861207a65746120757073696c6f6e206574612065746120616c706861207869207468657461206d7520696f746120616c706861206c616d62646120616c7068612064656c746120616c70686120616c706861206b61707061207869206e7520616c7068612067616d6d6120746865746120616c70686120616c70686120616c70686120706920786920626574612062657461206d7520616c70686120616c70686120616c70686120626574612067616d6d61207461752067616d6d6120696f746120616c7068612062657461207869206c616d62646120616c7068612064656c7461206e752065746120616c70686120657073696c6f6e20616c7068612065746120626574612065746120616c7068612062657461206265746120626574612072686f206265746120616c70686120616c70686120616c706861207a65746120616c70686120616c70686120616c706861206265746120616c706861206c616d6264612067616d6d612064656c7461206e7520657073696c6f6e2065746120616c7068612064656c746120626574612067616d6d61207a65746120616c7068612067616d6d61207369676d6120616c7068612067616d6d61206f6d6963726f6e20657073696c6f6e20616c706861207a657461207a6574612062657461206c616d6264612065746120616c706861206b6170706120757073696c6f6e2067616d6d6120616c7068612064656c746120657461206e752064656c74612065746120616c7068612072686f20616c70686120616c7068612062657461206c616d62646120616c706861206e7520616c706861206c616d6264612062657461206265746120616c70686120616c706861207468657461206d75206c616d62646120757073696c6f6e20657073696c6f6e206e7520616c70686120616c70686120616c7068612067616d6d61207a65746120657461206574612067616d6d61207a6574612070692065746120616c7068612064656c746120616c70686120657461206265746120616c7068612065746120616c706861206265746120616c70686120616c70686120616c7068612064656c746120746175206574612067616d6d61206d75206c616d62646120616c7068612067616d6d612067616d6d6120616c70686120786920616c70686120616c70686120657073696c6f6e206265746120616c70686120616c70686120616c70686120616c706861206b617070612074686574612065746120616c70686120616c7068612067616d6d6120706920616c70686120616c70686120786920616c70686120757073696c6f6e20616c70686120616c7068612064656c74612074617520616c70686120746865746120616c706861206c616d62646120616c7068612067616d6d612074686574612067616d6d61206574612065746120616c70686120616c706861206b6170706120616c70686120616c7068612067616d6d61206265746120616c7068612065746120657073696c6f6e2064656c746120616c7068612062657461206265746120657073696c6f6e20616c7068612072686f2072686f20657073696c6f6e206265746120786920616c70686120616c706861206265746120626574612072686f2074617520616c7068612062657461206265746120616c706861206f6d6963726f6e20616c706861207369676d6120746865746120757073696c6f6e206b617070612067616d6d61207a657461206f6d6963726f6e20616c706861206b6170706120657073696c6f6e20657073696c6f6e2064656c746120616c70686120706920696f746120616c706861207a65746120616c706861206d75207468657461207369676d612067616d6d6120786920616c70686120616c70686120616c706861207069206c616d62646120616c70686120616c706861206e75206b61707061206574612065746120616c706861206d75206d7520696f746120616c70686120616c70686120616c70686120616c70686120616c7068612067616d6d612067616d6d6120616c70686120616c70686120657073696c6f6e206f6d6963726f6e20616c70686120616c70686120616c706861206b617070612067616d6d61207a6574612064656c746120616c706861206c616d6264612062657461207a65746120657073696c6f6e20616c70686120616c70686120657073696c6f6e2064656c7461206b61707061206265746120616c70686120757073696c6f6e206c616d626461206c616d62646120616c70686120616c706861206574612072686f20626574612067616d6d6120746175206574612067616d6d61206574612067616d6d612067616d6d612065746120746865746120616c70686120616c70686120616c70686120616c706861206e752067616d6d6120616c70686120616c70686120616c70686120746175206c616d62646120657073696c6f6e20746175206b61707061207468657461206d7520746175207a6574612065746120616c706861206c616d62646120616c706861207a6574612067616d6d61206f6d6963726f6e2067616d6d6120616c7068612065746120616c70686120616c70686120757073696c6f6e2062657461206265746120616c706861207069206265746120657073696c6f6e20746175206b61707061206b61707061206265746120616c70686120746865746120616c70686120616c706861206e752062657461206e75207a65746120616c70686120616c70686120616c70686120657073696c6f6e2064656c7461207a65746120616c70686120616c70686120616c70686120616c70686120616c70686120616c70686120616c706861206e7520616c7068612067616d6d6120706920616c7068612065746120657461206265746120616c70686120616c70686120616c70686120657461206d75207a65746120616c7068612067616d6d6120616c706861206b6170706120616c70686120616c70686120616c70686120626574612062657461206265746120616c70686120616c706861206f6d6963726f6e20616c7068612067616d6d612072686f206c616d62646120616c70686120616c70686120616c706861207069206b6170706120616c706861207369676d6120616c70686120616c70686120616c706861207a6574612067616d6d6120626574612067616d6d61207a6574612064656c746120616c7068612064656c746120786920696f746120786920616c7068612067616d6d6120616c7068612064656c746120616c7068612067616d6d61206c616d6264612067616d6d612062657461206d75207369676d612067616d6d6120626574612062657461206d752064656c7461207069207369676d61207369676d6120616c70686120657073696c6f6e20746865746120616c7068612067616d6d6120616c706861206d7520616c70686120616c70686120616c706861206d7520616c70686120616c70686120696f746120616c706861206f6d6963726f6e20616c706861207369676d61206265746120616c706861206265746120616c70686120626574612074686574612067616d6d6120696f7461207a6574612065746120706920696f746120616c70686120696f746120616c70686120657073696c6f6e20616c706861206265746120616c706861207369676d612067616d6d61206c616d626461206c616d626461206265746120696f74612064656c746120616c7068612072686f20616c70686120616c7068612062657461206265746120616c70686120626574612067616d6d612064656c7461206b617070612064656c746120616c706861206d7520616c70686120657073696c6f6e20616c70686120616c70686120616c70686120616c70686120616c70686120616c706861207461752064656c7461207869206265746120786920616c706861206b617070612062657461206265746120616c706861206b6170706120706920616c70686120657073696c6f6e20616c706861207a6574612067616d6d612064656c746120616c70686120616c70686120616c706861206e7520616c70686120616c7068612064656c7461206c616d626461206d75207a657461206d7520616c706861206c616d62646120616c706861207a657461206b6170706120616c7068612064656c74612062657461206f6d6963726f6e20657073696c6f6e20616c706861206e7520616c706861206f6d6963726f6e207a657461206e7520696f746120616c706861206f6d6963726f6e20757073696c6f6e20696f746120616c70686120616c70686120616c70686120616c70686120616c706861206f6d6963726f6e20616c70686120746865746120616c70686120616c70686120657073696c6f6e20657073696c6f6e20626574612062657461206265746120616c70686120616c7068612072686f20746865746120616c70686120616c70686120657461206d752067616d6d6120746865746120616c70686120616c7068612067616d6d6120757073696c6f6e206f6d6963726f6e206c616d62646120616c706861207a6574612067616d6d612067616d6d6120757073696c6f6e2074617520706920616c706861207369676d6120616c706861207a657461206b61707061207869207a65746120616c70686120616c706861207369676d61207a65746120746865746120746865746120616c70686120616c70686120657461207369676d6120657073696c6f6e20626574612062657461206f6d6963726f6e206f6d6963726f6e2074686574612067616d6d6120616c70686120746175207a65746120626574612067616d6d6120616c7068612065746120706920706920616c706861206b6170706120696f746120616c70686120616c7068612064656c746120657073696c6f6e206265746120616c7068612067616d6d61206265746120616c70686120616c7068612067616d6d6120706920616c70686120657461206e7520616c706861207a6574612072686f20696f7461206b6170706120616c70686120616c706861206265746120616c7068612062657461206d7520616c70686120706920616c70686120786920696f74612064656c7461206b617070612064656c746120746175207869206265746120616c70686120616c70686120616c70686120616c706861206b6170706120616c70686120746865746120616c706861207a65746120616c70686120746865746120657073696c6f6e2072686f20616c706861207a6574612067616d6d6120616c70686120616c70686120746175207468657461206c616d6264612062657461207069206d752078692074686574612067616d6d61206f6d6963726f6e2065746120696f7461206f6d6963726f6e20616c70686120616c7068612067616d6d612067616d6d6120616c7068612064656c746120616c70686120616c706861206c616d62646120616c706861206e7520616c7068612067616d6d61206265746120616c706861206265746120746865746120616c70686120616c7068612067616d6d6120616c7068612067616d6d61206574612064656c746120616c70686120616c70686120657073696c6f6e20657073696c6f6e2067616d6d6120616c70686120616c70686120616c70686120657073696c6f6e20786920616c70686120657073696c6f6e2072686f2064656c74612064656c746120616c7068612067616d6d6120616c70686120706920616c70686120616c70686120616c70686120786920616c70686120616c7068612065746120616c7068612064656c7461206b6170706120616c70686120657461206f6d6963726f6e20616c7068612067616d6d6120657073696c6f6e20616c70686120657073696c6f6e2067616d6d61206d7520746865746120616c70686120616c70686120616c706861206d7520616c7068612064656c746120746865746120657461207a65746120696f74612078692067616d6d6120616c7068612064656c746120616c70686120616c70686120616c7068612067616d6d6120616c70686120746865746120616c70686120616c70686120616c70686120616c7068612064656c7461206265746120696f7461206e752067616d6d612065746120616c70686120616c70686120746865746120616c70686120616c70686120616c706861206c616d62646120706920616c70686120616c70686120616c70686120616c706861206f6d6963726f6e2067616d6d6120616c7068612062657461207a657461206e752062657461207369676d6120626574612064656c746120616c70686120616c70686120626574612067616d6d6120616c70686120657461206f6d6963726f6e20616c7068612064656c746120746175206265746120616c70686120696f746120616c70686120657073696c6f6e2062657461207a65746120616c706861207a657461206e7520616c70686120616c70686120616c706861206265746120616c7068612072686f206b6170706120706920616c70686120616c70686120616c706861206b61707061207369676d61206d75207a65746120616c706861207a657461206265746120696f74612065746120616c70686120657073696c6f6e206c616d6264612064656c7461206265746120706920616c70686120616c70686120616c70686120616c706861206b6170706120616c70686120696f7461207a65746120706920657073696c6f6e206265746120616c70686120616c70686120616c70686120616c70686120616c7068612067616d6d61206265746120616c70686120696f746120616c706861207a65746120657073696c6f6e20616c70686120616c70686120616c7068612067616d6d6120616c70686120786920616c706861206e7520616c70686120616c706861206f6d6963726f6e207a657461206265746120616c70686120757073696c6f6e206b6170706120746175207369676d6120657073696c6f6e206f6d6963726f6e20696f7461206b61707061206b6170706120616c7068612067616d6d6120616c70686120657073696c6f6e20616c7068612064656c746120616c7068612072686f20616c7068612064656c746120657073696c6f6e2074686574612072686f206f6d6963726f6e20616c7068612062657461206265746120657073696c6f6e2064656c7461207369676d61206c616d626461206265746120616c7068612062657461207a65746120616c70686120696f746120616c70686120746175207369676d6120657073696c6f6e20616c706861206c616d6264612072686f20616c7068612064656c7461207a6574612064656c7461206265746120626574612067616d6d6120616c70686120616c70686120616c7068612074617520616c70686120657073696c6f6e2067616d6d612065746120657073696c6f6e2067616d6d61207468657461207a65746120616c706861207a6574612065746120626574612062657461207069207a6574612062657461207a65746120616c70686120616c7068612062657461206d752067616d6d6120616c70686120657073696c6f6e20616c7068612064656c7461207069206e752067616d6d6120616c70686120616c706861206e75206574612064656c74612067616d6d612062657461207a65746120696f746120657073696c6f6e2064656c7461206265746120616c70686120706920616c70686120616c7068612072686f2064656c746120616c7068612062657461206b617070612064656c74612064656c746120616c7068612067616d6d61206d7520657073696c6f6e206b61707061206265746120657073696c6f6e206b6170706120616c70686120616c70686120616c70686120616c706861206f6d6963726f6e2067616d6d6120616c70686120616c7068612072686f20616c70686120616c706861206e75207a657461206d75207069206265746120616c7068612064656c7461206f6d6963726f6e20657073696c6f6e207468657461206265746120616c706861206e752062657461207a657461207a65746120616c70686120616c70686120616c70686120616c706861206d752062657461206e7520616c7068612070692062657461206265746120616c7068612067616d6d6120616c706861206265746120616c70686120616c70686120657073696c6f6e207369676d6120746865746120616c706861207a65746120616c7068612064656c7461206e7520616c706861206b617070612065746120616c7068612067616d6d6120616c70686120616c70686120616c70686120616c70686120657073696c6f6e2072686f20616c706861207461752072686f206f6d6963726f6e206265746120616c70686120696f746120626574612064656c74612078692067616d6d61206b6170706120616c70686120616c70686120616c706861206265746120746865746120616c70686120746865746120786920616c70686120657073696c6f6e2062657461206c616d6264612078692064656c746120616c706861206265746120616c7068612062657461207a657461207369676d612064656c7461206265746120616c7068612067616d6d612062657461207369676d61206b617070612062657461206265746120616c706861206265746120616c706861206e7520706920616c7068612064656c7461206f6d6963726f6e20706920616c706861207069206c616d6264612065746120616c70686120616c70686120616c706861207369676d6120616c70686120616c7068612067616d6d6120616c70686120616c706861206f6d6963726f6e2067616d6d61206d7520616c70686120616c7068612067616d6d6120616c706861207369676d61207369676d6120696f74612064656c746120616c70686120616c70686120616c70686120616c70686120616c7068612062657461206b6170706120616c7068612065746120616c70686120657073696c6f6e207069206c616d62646120657073696c6f6e20616c70686120616c70686120626574612072686f2065746120696f746120616c70686120616c70686120616c7068612064656c746120657073696c6f6e20616c70686120706920616c70686120616c7068612067616d6d612067616d6d612065746120616c70686120616c7068612064656c74612064656c7461207a65746120616c706861207069206c616d62646120616c706861207a65746120616c7068612067616d6d6120616c70686120786920616c70686120657073696c6f6e2074617520616c706861206265746120657073696c6f6e20616c70686120706920616c706861207468657461207a657461206d752072686f20616c70686120626574612067616d6d6120746865746120616c706861206b6170706120657073696c6f6e20696f74612067616d6d6120616c706861206265746120616c7068612078692070692065746120616c706861206d7520616c70686120616c7068612064656c7461206f6d6963726f6e206b61707061206d752062657461206b6170706120616c70686120616c70686120616c70686120616c706861206b6170706120616c7068612064656c746120616c70686120616c70686120616c706861207468657461206d7520616c706861206f6d6963726f6e206b6170706120616c706861206b6170706120616c70686120616c706861207a65746120616c706861207a65746120616c70686120616c7068612072686f20616c7068612067616d6d6120616c70686120616c7068612072686f207869206574612067616d6d612062657461206265746120626574612064656c746120616c70686120616c7068612067616d6d6120616c70686120616c70686120616c70686120626574612067616d6d6120616c7068612067616d6d61207a65746120616c706861206e7520616c706861206d752074617520616c706861206d7520616c706861206b6170706120616c70686120616c70686120696f74612070692064656c7461206f6d6963726f6e206d75206265746120616c70686120616c7068612072686f206e7520746865746120616c70686120757073696c6f6e206265746120616c70686120757073696c6f6e207461752074686574612074617520696f74612065746120616c70686120616c706861207369676d6120616c7068612064656c746120616c7068612062657461206265746120616c706861207a65746120616c7068612065746120616c70686120657073696c6f6e206265746120616c706861207a65746120626574612064656c7461206265746120616c706861206265746120616c70686120657073696c6f6e207369676d6120616c70686120616c706861206574612067616d6d6120757073696c6f6e20616c70686120616c706861206d7520616c70686120616c7068612072686f20616c7068612062657461206f6d6963726f6e20746865746120616c706861206d7520616c70686120616c70686120657073696c6f6e206574612062657461206265746120616c70686120757073696c6f6e20616c706861206c616d62646120657461206e7520616c7068612067616d6d6120616c70686120746865746120616c706861206b6170706120616c70686120657461207a657461206e7520626574612067616d6d612064656c7461206d7520786920746865746120696f746120626574612067616d6d612065746120616c70686120616c7068612065746120696f746120657073696c6f6e20657461207a6574612067616d6d61206265746120616c706861206f6d6963726f6e206b61707061206b61707061206b6170706120616c706861206b6170706120696f7461206d75206265746120616c70686120616c706861206f6d6963726f6e20616c70686120757073696c6f6e2064656c746120696f746120616c706861207a657461206d752062657461206e7520616c70686120616c7068612072686f20746865746120616c70686120696f74612067616d6d6120616c70686120616c70686120616c70686120616c706861206265746120616c70686120616c706861207468657461206c616d626461206c616d626461206b6170706120616c7068612067616d6d6120757073696c6f6e20616c706861206265746120616c70686120657461207a65746120657073696c6f6e20616c706861206d75206f6d6963726f6e20757073696c6f6e206c616d626461206574612074686574612064656c746120626574612064656c7461206265746120657073696c6f6e20616c7068612064656c7461207a6574612064656c7461206265746120616c706861206e752062657461206f6d6963726f6e206c616d626461206c616d62646120746865746120616c70686120616c70686120616c70686120616c70686120616c70686120616c7068612065746120616c70686120616c70686120696f746120657073696c6f6e2067616d6d6120616c706861206265746120706920616c70686120657073696c6f6e2064656c746120616c706861206c616d626461206265746120757073696c6f6e20616c70686120696f746120616c706861207a65746120616c706861207a657461206265746120616c70686120616c70686120616c70686120696f746120616c7068612064656c7461207369676d6120616c706861207369676d6120616c7068612062657461207a65746120616c706861206c616d626461206265746120616c70686120616c70686120616c7068612062657461206e7520616c706861206265746120786920616c70686120616c70686120616c70686120706920616c7068612074617520786920616c706861206c616d62646120616c70686120696f74612062657461206265746120616c70686120696f746120616c70686120616c70686120616c70686120616c70686120616c706861206d7520696f7461206265746120616c70686120616c706861207869206265746120616c7068612065746120616c70686120786920616c70686120616c70686120696f746120616c70686120616c70686120696f7461206f6d6963726f6e20616c7068612064656c746120616c7068612064656c74612062657461206f6d6963726f6e206265746120657073696c6f6e20616c70686120626574612078692072686f20616c70686120616c70686120616c70686120616c70686120616c70686120616c706861207461752065746120616c70686120616c70686120657461207a657461206f6d6963726f6e206b6170706120616c706861206d7520757073696c6f6e206265746120696f7461207468657461207369676d61207a65746120616c70686120616c70686120616c706861207869206265746120616c70686120757073696c6f6e20657073696c6f6e2067616d6d6120616c7068612062657461206d75207a657461207a65746120657461207a65746120616c70686120616c70686120616c706861206d752074617520696f7461207369676d6120616c706861206265746120616c70686120616c7068612072686f206b6170706120616c7068612065746120616c70686120657073696c6f6e207369676d612070692067616d6d6120616c706861206265746120616c70686120616c70686120696f746120616c70686120616c70686120616c706861206b61707061206d7520616c706861207a65746120616c706861206e7520616c7068612062657461207369676d61206c616d62646120616c7068612074686574612067616d6d612067616d6d61206d7520616c70686120616c70686120616c706861207369676d6120616c70686120616c70686120616c70686120657073696c6f6e20746865746120616c70686120616c70686120616c706861207069206d752067616d6d6120616c706861206265746120616c70686120616c70686120786920616c7068612067616d6d61206265746120616c70686120616c7068612062657461207468657461206d75207a6574612072686f20616c706861207a6574612074686574612064656c74612072686f2064656c74612072686f20616c70686120746175206d75207369676d6120616c70686120616c7068612067616d6d61206265746120626574612067616d6d612065746120616c70686120616c706861206c616d62646120616c7068612074617520657073696c6f6e20616c70686120746865746120746865746120616c7068612072686f2064656c746120616c7068612072686f20616c70686120616c70686120657461206b617070612064656c746120616c70686120616c70686120616c70686120746865746120616c706861206265746120786920616c706861206e7520657073696c6f6e20616c7068612074686574612072686f2064656c746120657461206265746120616c706861207369676d612067616d6d6120616c70686120616c70686120616c706861206574612064656c74612064656c7461207869206e7520616c70686120757073696c6f6e20746865746120616c70686120616c70686120616c7068612067616d6d6120746865746120657073696c6f6e20616c7068612067616d6d6120616c70686120616c70686120616c7068612067616d6d61206f6d6963726f6e20616c706861207a65746120616c706861207468657461206d7520626574612064656c74612064656c746120616c70686120616c70686120616c7068612067616d6d6120616c70686120616c70686120616c7068612067616d6d6120616c70686120657073696c6f6e20657073696c6f6e206265746120616c70686120616c7068612067616d6d6120616c70686120616c706861206b617070612072686f2072686f20616c70686120616c70686120696f746120616c70686120626574612072686f20657073696c6f6e20746865746120746175206b61707061207a65746120616c706861207069206e7520616c70686120616c7068612064656c7461206e752064656c746120626574612067616d6d6120616c7068612064656c74612072686f207069206c616d62646120616c706861207a657461207a657461206e7520616c7068612067616d6d612067616d6d612064656c74612067616d6d61207468657461206d7520616c70686120616c70686120696f7461206c616d6264612064656c74612067616d6d612064656c746120616c70686120616c70686120616c70686120616c706861206d7520657461207a657461206c616d626461206d752067616d6d61206265746120657073696c6f6e20616c7068612067616d6d61206f6d6963726f6e206c616d626461206265746120616c70686120616c7068612062657461206f6d6963726f6e206e7520616c706861207869207069206c616d62646120616c7068612067616d6d6120616c70686120786920616c706861206b6170706120616c7068612067616d6d612074617520696f7461206b61707061206d752067616d6d6120616c70686120616c70686120786920616c7068612067616d6d612064656c746120616c70686120746865746120626574612067616d6d6120616c706861206574612067616d6d6120626574612067616d6d6120616c70686120616c7068612074686574612067616d6d612067616d6d6120626574612067616d6d6120616c706861206d7520746865746120616c706861207a657461206265746120616c70686120616c70686120616c70686120616c706861206c616d62646120757073696c6f6e20616c7068612074617520616c70686120657073696c6f6e20616c706861206265746120757073696c6f6e207869207a65746120616c70686120616c70686120616c70686120626574612064656c74612072686f20616c706861207a657461206f6d6963726f6e20657073696c6f6e20616c70686120616c70686120616c7068612062657461206e752065746120616c70686120696f746120616c7068612064656c746120616c706861206f6d6963726f6e20616c706861206e7520757073696c6f6e20616c70686120616c706861206e7520616c70686120616c70686120616c70686120657461207a657461206265746120616c70686120657073696c6f6e20616c7068612067616d6d61207a6574612062657461206f6d6963726f6e20746865746120616c706861206b61707061206d75207369676d6120616c70686120616c706861206265746120746865746120657073696c6f6e207869206f6d6963726f6e207a6574612062657461206574612064656c74612067616d6d61206b6170706120616c7068612074686574612064656c746120746865746120616c706861206d7520786920616c7068612064656c74612064656c7461207a657461206265746120657073696c6f6e20616c70686120657073696c6f6e20616c70686120657073696c6f6e206b61707061206265746120696f746120616c70686120616c70686120616c7068612064656c746120616c7068612067616d6d6120616c70686120616c70686120616c706861206f6d6963726f6e20616c70686120616c70686120616c70686120616c70686120657073696c6f6e20616c7068612064656c7461206d752067616d6d6120616c70686120616c70686120616c70686120616c70686120786920616c706861206b61707061206265746120696f746120616c70686120616c70686120657073696c6f6e20626574612067616d6d6120616c706861206b6170706120746175206d752067616d6d6120616c70686120746865746120616c70686120616c7068612078692062657461206d7520616c706861206e7520616c70686120616c706861207369676d6120616c706861206e7520657073696c6f6e206c616d62646120616c70686120746175206b6170706120696f7461206d7520616c70686120746865746120696f7461206e752064656c746120757073696c6f6e207a65746120746865746120626574612064656c746120616c70686120616c70686120616c706861207a6574612062657461206b6170706120616c70686120616c706861206265746120696f746120616c7068612067616d6d6120616c70686120626574612067616d6d6120757073696c6f6e2067616d6d6120616c70686120616c70686120616c70686120657073696c6f6e20616c70686120616c7068612072686f20626574612065746120616c70686120626574612062657461207a657461206c616d6264612072686f2064656c746120657073696c6f6e20616c706861207a6574612062657461206e7520616c7068612064656c746120696f746120757073696c6f6e20696f746120696f746120746865746120696f746120616c7068612065746120616c7068612064656c74612072686f20616c7068612067616d6d61207a657461207a657461207369676d6120657461206b6170706120757073696c6f6e206b6170706120616c70686120616c70686120616c7068612064656c74612067616d6d612074617520657073696c6f6e207a65746120616c70686120616c70686120616c70686120616c70686120696f74612070692064656c746120616c70686120616c70686120616c7068612062657461207369676d612062657461206265746120616c706861207369676d61206e752062657461206d7520616c70686120616c70686120616c70686120746865746120757073696c6f6e20616c706861206574612064656c746120616c70686120616c70686120616c706861206d7520616c706861206e7520706920616c70686120616c70686120616c70686120616c70686120657073696c6f6e206d7520616c706861206e752074686574612062657461207a65746120757073696c6f6e20616c70686120616c7068612062657461207369676d61206f6d6963726f6e2072686f2067616d6d6120657073696c6f6e20616c70686120657073696c6f6e20616c70686120657461207369676d61206d752064656c746120616c70686120616c706861207869207a65746120616c70686120696f746120616c706861206f6d6963726f6e20616c70686120616c706861207468657461206c616d6264612072686f20616c706861206c616d62646120696f74612064656c7461206f6d6963726f6e2062657461207369676d6120616c70686120616c706861207369676d6120616c706861207a65746120616c7068612064656c746120616c7068612072686f2064656c746120626574612067616d6d61207a657461206b6170706120616c70686120657073696c6f6e20786920626574612062657461206f6d6963726f6e20616c70686120616c7068612067616d6d6120616c7068612067616d6d6120616c70686120616c706861206265746120616c706861206f6d6963726f6e20616c7068612062657461206d7520616c7068612067616d6d61207a6574612062657461206b61707061206b61707061206b6170706120696f7461206c616d62646120616c70686120757073696c6f6e20616c70686120616c706861206c616d62646120616c70686120616c70686120746865746120616c70686120616c70686120616c70686120616c70686120657461206b6170706120616c70686120657073696c6f6e20616c706861207461752062657461206d7520616c706861207369676d61207369676d6120657461207a6574612062657461206265746120616c70686120616c70686120616c7068612074617520616c70686120616c70686120657073696c6f6e207468657461207869206c616d62646120696f746120616c706861206265746120616c706861207869206574612065746120657073696c6f6e207369676d6120696f7461206265746120746175207468657461206e752067616d6d612067616d6d6120616c70686120616c70686120657073696c6f6e20616c70686120706920657073696c6f6e2064656c74612067616d6d6120616c706861206c616d6264612062657461206b6170706120616c70686120616c706861207369676d6120657073696c6f6e20616c706861206b617070612074617520616c70686120616c70686120616c706861206e7520616c706861207369676d6120616c70686120616c706861206f6d6963726f6e20616c70686120616c7068612074617520757073696c6f6e20616c706861207468657461206d7520616c70686120616c706861206c616d62646120616c706861207369676d6120746865746120616c70686120616c70686120616c70686120626574612078692072686f2067616d6d6120746865746120616c706861207869207461752067616d6d61206b617070612064656c746120616c70686120616c7068612064656c74612067616d6d6120616c706861206d75206b61707061207468657461206b6170706120696f746120616c7068612064656c7461206f6d6963726f6e20616c706861206574612062657461207369676d6120616c706861206e7520616c70686120616c70686120616c70686120757073696c6f6e2067616d6d61206265746120616c70686120616c7068612067616d6d6120757073696c6f6e20616c7068612067616d6d61207a6574612065746120616c7068612074686574612064656c7461207869206d7520626574612067616d6d6120616c70686120616c706861207461752067616d6d6120616c7068612067616d6d61206d7520706920616c70686120616c7068612067616d6d612067616d6d612074617520616c706861206d7520616c706861206265746120657073696c6f6e206c616d6264612067616d6d612072686f207461752067616d6d612074617520616c706861207369676d6120616c70686120657073696c6f6e20616c70686120786920616c70686120616c70686120616c706861207a6574612067616d6d6120757073696c6f6e20616c706861206b61707061206d75207369676d61206e752074686574612065746120757073696c6f6e2067616d6d61206b6170706120616c7068612067616d6d61207869206e7520616c70686120657073696c6f6e2067616d6d6120616c706861206e7520786920626574612064656c7461206574612072686f20616c706861207461752062657461206c616d62646120616c70686120616c70686120696f746120696f746120616c706861206265746120657073696c6f6e206265746120616c706861206f6d6963726f6e20616c706861206f6d6963726f6e20616c7068612064656c746120616c706861207461752064656c74612062657461206b61707061206b617070612064656c7461206e7520616c70686120616c70686120616c70686120616c70686120616c706861207a65746120616c70686120616c70686120616c70686120616c70686120616c70686120616c706861206574612072686f20616c70686120657073696c6f6e20616c706861207468657461207a657461207869206f6d6963726f6e20616c706861206e75206c616d626461206f6d6963726f6e207a65746120626574612064656c74612064656c7461206265746120616c706861207069207a65746120616c706861206c616d6264612067616d6d6120626574612067616d6d612062657461206d752062657461207a65746120616c706861206c616d626461206e75207a65746120657073696c6f6e2067616d6d6120616c706861206f6d6963726f6e206f6d6963726f6e20616c706861206265746120616c70686120616c70686120616c70686120657073696c6f6e206265746120616c706861206c616d626461207a65746120626574612074617520786920616c70686120616c7068612062657461207369676d612064656c746120616c70686120626574612064656c7461206b617070612074617520696f746120616c706861206f6d6963726f6e206d752067616d6d61206265746120616c70686120616c706861206b61707061206e752072686f206e752067616d6d6120616c70686120657461207369676d6120746175206e7520616c7068612064656c746120616c7068612067616d6d6120616c70686120657073696c6f6e20786920616c706861207468657461207369676d6120706920616c70686120657073696c6f6e20616c7068612064656c746120616c70686120616c706861206574612065746120616c70686120616c70686120626574612067616d6d612067616d6d61207a65746120616c70686120616c706861207869207369676d61206574612062657461206265746120616c706861207a65746120616c706861207369676d61206f6d6963726f6e20616c706861207a65746120626574612067616d6d6120626574612067616d6d6120616c70686120786920616c706861206d7520616c706861207468657461207369676d61207a657461206e752064656c7461206574612062657461206b6170706120746865746120616c7068612067616d6d6120706920616c70686120626574612067616d6d61206d7520616c7068612065746120696f74612065746120616c7068612072686f20616c706861206b61707061206b6170706120757073696c6f6e20616c70686120616c706861207369676d6120746865746120616c7068612065746120616c70686120616c70686120696f74612064656c746120616c706861206265746120616c706861206265746120657073696c6f6e20616c70686120696f746120616c70686120616c7068612067616d6d61206574612067616d6d612067616d6d6120616c7068612064656c746120616c70686120616c70686120616c7068612078692064656c746120616c7068612074617520616c70686120706920616c70686120616c70686120696f746120657073696c6f6e20616c70686120616c706861207069206d7520616c70686120616c706861207069207869206f6d6963726f6e2074617520616c70686120616c706861207a65746120657073696c6f6e20786920616c70686120657073696c6f6e207369676d61206c616d6264612072686f206e7520616c70686120616c7068612064656c746120616c7068612065746120616c7068612062657461207369676d61206b6170706120696f7461207369676d612072686f207a65746120616c706861206e752067616d6d612067616d6d6120616c70686120616c70686120626574612074617520616c70686120616c706861206e75207a657461206b617070612074617520616c706861207369676d6120616c7068612064656c7461206f6d6963726f6e20616c70686120616c7068612067616d6d6120616c70686120616c70686120757073696c6f6e206e7520696f7461207a657461206c616d62646120616c706861207369676d612064656c746120657073696c6f6e20616c706861207461752064656c7461207369676d6120616c70686120696f7461206574612067616d6d6120616c70686120626574612067616d6d61207a65746120616c70686120786920757073696c6f6e20616c706861206e75206d7520616c7068612062657461206e75207a657461206c616d6264612067616d6d61207a65746120616c706861206b6170706120616c706861206265746120616c70686120657461207461752064656c7461207a65746120616c706861207a65746120657073696c6f6e20657461206574612072686f20657073696c6f6e2067616d6d61207a657461206574612064656c746120616c70686120616c70686120696f74612062657461206f6d6963726f6e20616c7068612064656c746120657073696c6f6e20657073696c6f6e20626574612067616d6d6120616c706861206265746120616c7068612064656c7461206c616d626461206b6170706120657073696c6f6e207a65746120616c70686120616c7068612074617520616c70686120626574612067616d6d6120616c70686120616c70686120616c706861206265746120616c7068612062657461207369676d6120616c70686120657073696c6f6e20626574612072686f20616c70686120706920616c706861206265746120616c706861206265746120657073696c6f6e20616c70686120616c70686120746865746120616c706861207a65746120746865746120626574612064656c746120616c7068612067616d6d6120616c7068612067616d6d6120616c70686120696f746120616c70686120746865746120616c706861206265746120657073696c6f6e20616c7068612067616d6d612064656c74612067616d6d61206e7520616c7068612067616d6d61206265746120616c7068612074617520616c7068612064656c74612074617520616c706861206265746120616c706861206265746120657461206c616d62646120616c7068612064656c7461206c616d626461207869207a6574612067616d6d61207a65746120757073696c6f6e20616c70686120626574612072686f20746865746120786920706920616c70686120626574612067616d6d612067616d6d6120616c706861206e7520626574612067616d6d6120616c70686120757073696c6f6e2067616d6d61206574612067616d6d6120696f746120616c7068612065746120616c706861207a657461206574612067616d6d61206b6170706120657073696c6f6e20616c70686120616c7068612062657461206b617070612064656c746120616c70686120616c706861207869206e7520616c70686120616c70686120696f74612067616d6d6120616c70686120616c70686120616c706861207a65746120616c706861207461752062657461207069206265746120616c70686120616c7068612065746120616c7068612062657461206c616d6264612067616d6d612067616d6d6120616c70686120616c70686120616c70686120696f746120657073696c6f6e20616c706861206c616d62646120616c70686120616c706861206b617070612067616d6d612070692064656c74612072686f2064656c746120616c7068612067616d6d612062657461207a65746120616c706861206265746120746865746120657073696c6f6e2074617520696f746120626574612074617520616c706861206c616d6264612067616d6d61206265746120696f746120616c70686120696f74612072686f2067616d6d61206c616d62646120616c70686120696f74612072686f2067616d6d6120616c706861206265746120616c70686120616c70686120616c70686120616c70686120616c706861" },
  { name: "zlib.gunzip multi-member stream", run: () => gunzipOutcome('1f8b08000000000000034bcb2c2a2e510000fc7af11c060000001f8b08000000000000032b4e4dcecf4b010069111fb606000000'), expected: "6669727374207365636f6e64" },
  { name: "zlib.gunzip rejects trailing garbage after a member", run: () => gunzipOutcome('1f8b08000000000000032b48acccc94f4c0100156a2c42070000006a756e6b'), expected: {"code":"Z_DATA_ERROR","message":"incorrect header check"} },
  { name: "zlib.gunzip rejects a corrupt CRC", run: () => gunzipOutcome('1f8b08000000000002038d57db8ee33008fd95fe5ab2134dad6dda68662c45fefa958381c3c59d7d689af882e1c001dcb69fe5b63c8efb726bfdb51edfe5f17adefabb4e9de5f673ef9f7bbd95970c3f967dfde08f8fed2113f4fcbb1cc7b5f759c7c8e7b2efcb10852be97994be78ed93eb382c2eba66869ca58e37d0e99a3f4ba6dbb38249db30747cf1999b15a48faffb8b5ea24a2d1f86d5431952569501ac514f301144d3c077f9dcedc86b2f7fbeba1463d0b5b189f643019546be616f9324d4612315f583263b0ac14603b5f87a8c2a82b84fa269ac92b01bffcfccf50009ff60e8280148e75bfd0c0ec227ededc1a527a8a6a80ac2761623840d999c814e202cfc3a927d58a9724835cef67a23c609539185f49e2940ca45951c946c2822ae3eb741d9a3a7ff0c380e38cb38b5c6c711873d7d112dc824c6860c8008b15b687a738187661c05130b5071afe3283a968e7076880803bd70649c6e70dfabcbafb3678c3e1b74d6d0e854c004ed45c6b6e83d7b066d2479e016067fc84a8c37c95413b90d46b4b07fcf4a86e019c118245884b9ac791f42e6756f2e55f34ac298a63a31b678a0d7ad627c033847b1ac504d028ed1e067a5f9679d151ceb9ab6fd1a474e7c9a78189549221b00863a35cb21696dc5291bbb24ac874b1249022a1e8305321469c860130ed0fb39982f9c8e0512c74d79e7d6057383e96968ff51c60a545802e39ee39976446e10f2479623d7b4fead4a32e8a884123613c2abcd102010adb7b9e05a74894020d3c6c22b88fd13f91c45080e59da9a3d3b05c5e7b61e012757df38293d62d7855abee11906d3808689b4d76912c250876e316f02e52c9e6e23812431c239eb3fca8f0dab98a97c4d7dc3f6abc6470184c1ecb640e3d515bb59c2b6abbbbfc579483d40f72c3179d2d2a634c9b5a665d1705692ff916a1a88daaffbea7214d59a940c7e1aad7aec3b43db36cdf3122f8d8bf4754acce29e9812b0228e3368246b3794b9f6be318ef1d57c816473357d340f9fc24b5b300d1da5ab2eb75b77a1e23c95b553b1058b84cfef45c11d6b1e4e285b1ba1788a67dbac13e2f9d3a7ae8e1d898d95cd7935bd8bf81e085dae73595d7777706380f4d86f0ade0828b93f3571d9597ef14d34f27d8b09b9f63a405acefc661b055030fc03950600766f110000'), expected: {"code":"Z_DATA_ERROR","message":"incorrect data check"} },
  { name: "zlib.gunzip rejects a corrupt length", run: () => gunzipOutcome('1f8b0800000000000403011400ebff73746f72656420626c6f636b207061796c6f6164bb40115b14000001'), expected: {"code":"Z_DATA_ERROR","message":"incorrect length check"} },
  { name: "zlib.gunzip rejects a truncated stream", run: () => gunzipOutcome('1f8b08000000000002038d57db8ee33008fd95fe5ab2134dad6dda68662c45fefa958381c3c59d7d689af882e1c001dcb69fe5b63c8efb726bfdb51edfe5f17adefabb4e9de5f673ef9f7bbd95970c3f967dfde08f8fed2113f4fcbb1cc7b5f759c7c8e7b2efcb10852be97994be78ed93eb382c2eba66869ca58e37d0e99a3f4ba6dbb38249db30747cf1999b15a48faffb8b5ea24a2d1f86d5431952569501ac514f301144d3c077f9dcedc86b2f7fbeba1463d0b5b189f643019546be616f9324d4612315f583263b0ac14603b5f87a8c2a82b84fa269ac92b01bffcfccf50009ff60e8280148e75bfd0c0ec227ededc1a527a8a6a80ac2761623840d999c814e202cfc3a927d58a9724835cef67a23c609539185f49e2940ca45951c946c2822ae3eb741d9a3a7ff0c380e38cb38b5c6c711873d7d112dc824c6860c8008b15b687a738187661c05130b5071afe3283a968e7076880803bd70649c6e70dfabcbafb3678c3e1b74d6d0e854c004ed45c6b6e83d7b066d2479e016067fc84a8c37c95413b90d46b4b07fcf4a86e019c118245884b9ac791f42e6756f2e55f34ac298a63a31b678a0d7ad627c033847b1ac504d028ed1e067a5f9679d151ceb9ab6fd1a474e7c9a78189549221b00863a35cb21696dc5291bbb24ac874b1249022a1e8305321469c860130ed0fb39982f9c8e0512c74d79e7d6057383e96968ff51c60a545802e39ee39976446e10f2479623d7b4fead4a32e8a884123613c2abcd102010adb7b9e05a74894020d3c6c22b88fd13f91c45080e59da9a3d3b05c5e7b61e012757df38293d62d7855abee11906d3808689b4d76912c250876e316f02e52c9e6e23812431c239eb3fca8f0dab98a97c4d7dc3f6abc6470184c1ecb640e3d515bb59c2b6abbbbfc579483d40f72c3179d2d2a634c9b5a665d1705692ff916a1a88daaffbea7214d59a940c7e1aad7aec3b43db36cdf3122f8d8bf4754acce29e9812b0228e3368246b3794b9f6be318ef1d57c816473357d340f9fc24b5b300d1da5ab2eb75b77a1e23c95b553b1058b84cfef45c11d6b1e4e285b1ba1788a67dbac13e2f9d3a7ae8e1d898d95cd7935bd8bf81e085dae73595d7777706380f4d86f0ade0828b93f3571d9597ef14d34f27d8b09b9f63a405acefc661b055030'), expected: {"code":"Z_BUF_ERROR","message":"unexpected end of file"} },
  { name: "zlib.gunzip rejects bytes without the gzip magic", run: () => gunzipOutcome('6e6f7065'), expected: {"code":"Z_DATA_ERROR","message":"incorrect header check"} },
  { name: "zlib.gunzip rejects an empty input", run: () => gunzipOutcome(''), expected: {"code":"Z_BUF_ERROR","message":"unexpected end of file"} },
  { name: "zlib.gunzip skips a FNAME header field", run: () => gunzipOutcome('1f8b08080000000000036e616d652e74787400011400ebff73746f72656420626c6f636b207061796c6f6164bb40115b14000000'), expected: "73746f72656420626c6f636b207061796c6f6164" },
  { name: "zlib.gunzip skips FEXTRA, FCOMMENT and a header CRC", run: () => gunzipOutcome('1f8b081600000000000303004142436e6f74650078f1011400ebff73746f72656420626c6f636b207061796c6f6164bb40115b14000000'), expected: "73746f72656420626c6f636b207061796c6f6164" },
  { name: 'zlib.gunzip calls back after the synchronous code', run: () => new Promise((resolve) => { const order = []; s.zlib.gunzip(Buffer.from(FIXED_GZIP_HEX, 'hex'), () => { order.push('callback'); resolve(order) }); order.push('sync') }), expected: ['sync', 'callback'] },
  { name: 'zlib.gunzip accepts an options object before the callback', run: () => new Promise((resolve, reject) => s.zlib.gunzip(Buffer.from(FIXED_GZIP_HEX, 'hex'), {}, (error, output) => (error ? reject(error) : resolve(output.toString('hex'))))), expected: '616263616263616263616263' },
  { name: 'zlib.gunzip throws synchronously for a number with ERR_INVALID_ARG_TYPE', run: () => s.zlib.gunzip(5, () => {}), expected: 'threw: The "chunk" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received type number (5)' },
  { name: 'zlib.gunzip accepts an ArrayBuffer', run: () => new Promise((resolve, reject) => s.zlib.gunzip(Uint8Array.from(Buffer.from(FIXED_GZIP_HEX, 'hex')).buffer, (error, output) => (error ? reject(error) : resolve(output.toString('hex'))))), expected: '616263616263616263616263' },
)

export const gapCases = [
  { name: 'fs.readFileSync', run: () => s.fs.readFileSync('/etc/hostname') },
  { name: 'fs.constants.O_RDONLY', run: () => s.fs.constants.O_RDONLY },
  { name: 'crypto.createHash sha3-256', run: () => s.crypto.createHash('sha3-256') },
  { name: 'StringDecoder for latin1', run: () => new StringDecoder('latin1') },
  { name: 'os.platform', run: () => s.os.platform() },
  { name: 'process.platform', run: () => proc.platform },
  { name: 'process.exitCode', run: () => proc.exitCode },
  { name: 'child_process.spawn', run: () => s['child-process'].spawn('x') },
  { name: 'stream.Readable', run: () => new s.stream.Readable() },
  { name: 'worker_threads.Worker', run: () => new s['worker-threads'].Worker('x') },
  { name: 'vm.Script', run: () => new s.vm.Script('1') },
  { name: 'zlib.gzip', run: () => s.zlib.gzip(Buffer.alloc(0), () => {}) },
  { name: 'util.parseArgs without args', run: () => s.util.parseArgs() },
  { name: 'os.release', run: () => s.os.release(), applies: () => s.os.release.name === 'unavailable' },
]

const gapMessage = (name) => '@freddie/freddie-runtime: txiki.js has no ' + name + ', see docs/fx-split.md (txiki gaps)'

async function outcomeOf(run) {
  try {
    return { value: await run() }
  } catch (error) {
    return { thrown: String(error.message) }
  }
}

export async function runParity(label, withGaps) {
  const started = performance.now()
  const mismatches = []
  let gapAsserted = 0
  for (const { name, run, expected, gap } of sharedCases) {
    if (withGaps && gap !== undefined) {
      gapAsserted += 1
      const { thrown } = await outcomeOf(run)
      if (thrown !== gapMessage(gap)) mismatches.push({ name, got: thrown ?? 'resolved', expected: gapMessage(gap) })
      continue
    }
    const { value, thrown } = await outcomeOf(run)
    const got = thrown === undefined ? value : 'threw: ' + thrown
    if (JSON.stringify(canon(got)) !== JSON.stringify(canon(expected))) mismatches.push({ name, got, expected })
  }
  const unexpectedGaps = []
  let gapApplied = 0
  let gapInactive = 0
  if (withGaps) {
    for (const { name, run, applies } of gapCases) {
      if (applies !== undefined && !applies()) {
        gapInactive += 1
        continue
      }
      gapApplied += 1
      const { thrown } = await outcomeOf(run)
      if (thrown !== gapMessage(name)) unexpectedGaps.push({ name, message: thrown ?? 'resolved' })
    }
  }
  const elapsedMs = Math.round(performance.now() - started)
  const summary = { label, shared: sharedCases.length, gapAsserted, gaps: gapApplied, gapInactive, mismatches, unexpectedGaps, elapsedMs }
  console.log(label + ': ' + (sharedCases.length - mismatches.length) + '/' + sharedCases.length + ' shared cases match; ' + (gapApplied - unexpectedGaps.length) + '/' + gapApplied + ' gaps throw the documented message; ' + elapsedMs + ' ms')
  if (mismatches.length > 0 || unexpectedGaps.length > 0) throw new Error(label + ' parity failed: ' + JSON.stringify({ mismatches, unexpectedGaps }))
  return summary
}
