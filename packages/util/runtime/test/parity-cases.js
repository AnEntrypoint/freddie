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
  { name: 'zlib.gunzip rejects bytes that are not gzip', run: () => zlibGunzip(Buffer.from('nope')), expected: 'threw: incorrect header check', gap: 'zlib.gunzip' },
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

export const gapCases = [
  { name: 'fs.readFileSync', run: () => s.fs.readFileSync('/etc/hostname') },
  { name: 'fs.constants.O_RDONLY', run: () => s.fs.constants.O_RDONLY },
  { name: 'crypto.createHash', run: () => s.crypto.createHash('sha256') },
  { name: 'StringDecoder for latin1', run: () => new StringDecoder('latin1') },
  { name: 'os.platform', run: () => s.os.platform() },
  { name: 'process.platform', run: () => proc.platform },
  { name: 'process.exitCode', run: () => proc.exitCode },
  { name: 'child_process.spawn', run: () => s['child-process'].spawn('x') },
  { name: 'stream.Readable', run: () => new s.stream.Readable() },
  { name: 'worker_threads.Worker', run: () => new s['worker-threads'].Worker('x') },
  { name: 'vm.Script', run: () => new s.vm.Script('1') },
  { name: 'zlib.gzip', run: () => s.zlib.gzip(Buffer.alloc(0), () => {}) },
  { name: 'zlib.gunzip', run: () => s.zlib.gunzip(Buffer.alloc(0), () => {}) },
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
