import { subpaths as s } from './subpaths.js'

const { Buffer } = s.buffer
const { StringDecoder } = s['string-decoder']
const fsp = s['fs-promises']
const decoderBytes = Buffer.from('68e96c6c6f20f09f98803dd800de7f80ff', 'hex')
const decoderParts = (encoding, sizes) => {
  const decoder = new StringDecoder(encoding)
  const parts = []
  let offset = 0
  for (const size of sizes) {
    parts.push(decoder.write(decoderBytes.subarray(offset, offset + size)))
    offset += size
  }
  parts.push(decoder.end())
  return parts
}
const streamSettle = (promise) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 3000))])
const closedEvent = (stream) => new Promise((resolve) => stream.on('close', resolve))
const streamFile = async (name, bytes) => {
  const dir = await fsp.mkdtemp('/tmp/stream-')
  await fsp.writeFile(dir + '/' + name, bytes)
  return { dir, file: dir + '/' + name }
}
const streamScenarios = {
  writableSync: async () => {
    const log = []
    const w = new s.stream.Writable({ write(chunk, enc, cb) { log.push('write ' + chunk.toString() + ' ' + enc); cb() } })
    w.on('finish', () => log.push('finish')); w.on('close', () => log.push('close'))
    log.push('w1 ' + w.write('a'))
    log.push('w2 ' + w.write(Buffer.from('b')))
    w.end(() => log.push('endcb'))
    log.push('after end')
    await closedEvent(w)
    return log
  },
  writableAsync: async () => {
    const log = []
    const w = new s.stream.Writable({ write(chunk, enc, cb) { log.push('write ' + chunk.toString()); setTimeout(() => { log.push('done ' + chunk.toString()); cb() }, 5) } })
    w.write('a', () => log.push('cb a')); w.write('b', () => log.push('cb b')); w.end()
    w.on('finish', () => log.push('finish')); w.on('close', () => log.push('close'))
    await closedEvent(w)
    return log
  },
  writableAfterEnd: async () => {
    const log = []
    const w = new s.stream.Writable({ write(chunk, enc, cb) { cb() } })
    w.on('error', (e) => log.push('error ' + e.code + ' ' + e.message)); w.on('close', () => log.push('close'))
    w.end(); w.write('x', (err) => log.push('cb ' + (err ? err.code : 'none')))
    await closedEvent(w)
    return log
  },
  writableError: async () => {
    const log = []
    const w = new s.stream.Writable({ write(chunk, enc, cb) { cb(new Error('boom')) } })
    w.on('error', (e) => log.push('error ' + e.message)); w.on('close', () => log.push('close')); w.on('finish', () => log.push('finish'))
    w.write('a', (err) => log.push('cb ' + (err && err.message)))
    await closedEvent(w)
    return log
  },
  readableSyncPush: async () => {
    const log = []
    const r = new s.stream.Readable({ read() { this.push('a'); this.push('b'); this.push(null) } })
    r.on('data', (c) => log.push('data ' + c.toString())); r.on('end', () => log.push('end')); r.on('close', () => log.push('close'))
    await closedEvent(r)
    return log
  },
  readableAsyncPush: async () => {
    const log = []
    const r = new s.stream.Readable({ read() { setTimeout(() => { this.push('x'); this.push(null) }, 5) } })
    r.on('data', (c) => log.push('data ' + c.toString())); r.on('end', () => log.push('end')); r.on('close', () => log.push('close'))
    await closedEvent(r)
    return log
  },
  readablePauseResume: async () => {
    const log = []
    const r = new s.stream.Readable({ read() { this.push('a'); this.push(null) } })
    r.pause(); log.push('paused ' + r.isPaused())
    r.on('data', (c) => log.push('data ' + c.toString())); r.on('end', () => log.push('end')); r.on('close', () => log.push('close'))
    log.push('after on')
    r.resume()
    await closedEvent(r)
    return log
  },
  pipeReadableWritable: async () => {
    const log = []
    const r = new s.stream.Readable({ read() { this.push('a'); this.push(null) } })
    const w = new s.stream.Writable({ write(chunk, enc, cb) { log.push('write ' + chunk.toString()); cb() } })
    r.on('end', () => log.push('r end')); r.on('close', () => log.push('r close'))
    w.on('finish', () => log.push('w finish')); w.on('close', () => log.push('w close'))
    const ret = r.pipe(w)
    log.push('same ' + (ret === w))
    await Promise.all([closedEvent(r), closedEvent(w)])
    return log
  },
  passThrough: async () => {
    const log = []
    const p = new s.stream.PassThrough()
    p.on('data', (c) => log.push('data ' + c.toString())); p.on('end', () => log.push('end')); p.on('finish', () => log.push('finish')); p.on('close', () => log.push('close'))
    p.write('x'); p.end('y')
    log.push('after end')
    await closedEvent(p)
    return log
  },
  pipelineSuccess: async () => {
    const log = []
    const src = new s.stream.Readable({ read() { this.push('a'); this.push(null) } })
    const p = new s.stream.PassThrough()
    const w = new s.stream.Writable({ write(chunk, enc, cb) { log.push('write ' + chunk.toString()); cb() } })
    w.on('finish', () => log.push('w finish')); w.on('close', () => log.push('w close'))
    await new Promise((resolve) => s.stream.pipeline(src, p, w, (err) => { log.push('cb ' + String(err)); resolve() }))
    log.push('resolved')
    return log
  },
  pipelineError: async () => {
    const log = []
    const src = new s.stream.Readable({ read() { this.destroy(new Error('src boom')) } })
    const w = new s.stream.Writable({ write(chunk, enc, cb) { cb() } })
    w.on('close', () => log.push('w close'))
    await new Promise((resolve) => s.stream.pipeline(src, w, (err) => { log.push('cb ' + (err && err.message)); resolve() }))
    return log
  },
  readableDestroyError: async () => {
    const log = []
    const r = new s.stream.Readable({ read() {} })
    r.on('error', (e) => log.push('error ' + e.message)); r.on('close', () => log.push('close'))
    r.destroy(new Error('bye'))
    await closedEvent(r)
    return log
  },
  readableDefaultRead: async () => {
    const log = []
    const r = new s.stream.Readable()
    r.on('error', (e) => log.push('error ' + e.code + ' ' + e.message)); r.on('close', () => log.push('close'))
    r.on('data', () => {})
    await closedEvent(r)
    return log
  },
  pushReturnValues: () => {
    const r = new s.stream.Readable({ read() {} })
    return [r.push('a'), r.push(Buffer.alloc(20000)), r.push(null)]
  },
  writeReturnValues: async () => {
    const w = new s.stream.Writable({ write(chunk, enc, cb) { setTimeout(cb, 1) } })
    const values = [w.write('a'), w.write(Buffer.alloc(20000))]
    w.end()
    await closedEvent(w)
    return values
  },
  createReadSmall: async () => {
    const log = []
    const { dir, file } = await streamFile('small.txt', 'hello stream')
    try {
      const rs = s.fs.createReadStream(file)
      rs.on('open', (fd) => log.push('open ' + typeof fd)); rs.on('ready', () => log.push('ready'))
      rs.on('data', (c) => log.push('data ' + c.toString())); rs.on('end', () => log.push('end')); rs.on('close', () => log.push('close'))
      await closedEvent(rs)
      return log
    } finally {
      await fsp.rm(dir, { recursive: true })
    }
  },
  createReadLarge: async () => {
    const log = []
    const { dir, file } = await streamFile('big.bin', Buffer.alloc(150000, 97))
    try {
      const rs = s.fs.createReadStream(file)
      rs.on('data', (c) => log.push('data ' + c.length)); rs.on('end', () => log.push('end')); rs.on('close', () => log.push('close'))
      await closedEvent(rs)
      return log
    } finally {
      await fsp.rm(dir, { recursive: true })
    }
  },
  createReadMissing: async () => {
    const log = []
    const rs = s.fs.createReadStream('/nonexistent-freddie-stream/missing.txt')
    rs.on('error', (e) => log.push('error ' + e.code + ' ' + e.errno + ' ' + e.syscall + ' ' + e.message)); rs.on('close', () => log.push('close'))
    await closedEvent(rs)
    return log
  },
}

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

async function cpLinkScenario() {
  const dir = await fsp.mkdtemp('/tmp/cp-link-')
  const at = (name) => dir + '/' + name
  const shown = (text) => String(text).split(dir).join('ROOT')
  const describe = async (path) => {
    const entry = await fsp.lstat(path)
    if (entry.isSymbolicLink()) return { type: 'link', target: shown(await fsp.readlink(path)) }
    if (entry.isDirectory()) return { type: 'dir' }
    return { type: 'file', text: await fsp.readFile(path, 'utf8') }
  }
  const attempt = async (run) => {
    try { return await run() } catch (error) { return { error: error.code, message: shown(error.message) } }
  }
  await fsp.writeFile(at('real.txt'), 'REAL')
  await fsp.symlink('real.txt', at('rel-link'))
  await fsp.symlink(at('real.txt'), at('abs-link'))
  await fsp.symlink('missing.txt', at('dangling'))
  await fsp.mkdir(at('d'))
  await fsp.writeFile(at('d/inner.txt'), 'INNER')
  await fsp.symlink('d', at('dir-link'))
  await fsp.mkdir(at('tree'))
  await fsp.writeFile(at('tree/a.txt'), 'A')
  await fsp.symlink('a.txt', at('tree/ln'))
  await fsp.mkdir(at('tree/sub'))
  await fsp.symlink('../a.txt', at('tree/sub/up'))
  await fsp.symlink('missing.txt', at('tree/dangling'))
  await fsp.writeFile(at('existing-file'), 'OLD')
  await fsp.symlink('real.txt', at('existing-link'))
  await fsp.symlink('real.txt', at('ex-link'))
  await fsp.mkdir(at('dd'))
  await fsp.mkdir(at('src-d'))
  await fsp.writeFile(at('plain'), 'x')
  const out = {}
  out.fileLinkRelative = await attempt(async () => { await fsp.cp(at('rel-link'), at('o1')); return describe(at('o1')) })
  out.fileLinkAbsolute = await attempt(async () => { await fsp.cp(at('abs-link'), at('o2')); return describe(at('o2')) })
  out.danglingLink = await attempt(async () => { await fsp.cp(at('dangling'), at('o3')); return describe(at('o3')) })
  out.dirLinkNoRecursive = await attempt(async () => { await fsp.cp(at('dir-link'), at('o4')); return describe(at('o4')) })
  out.dirLinkRecursive = await attempt(async () => { await fsp.cp(at('dir-link'), at('o5'), { recursive: true }); return describe(at('o5')) })
  out.treeRecursive = await attempt(async () => {
    await fsp.cp(at('tree'), at('o6'), { recursive: true })
    return { ln: await describe(at('o6/ln')), up: await describe(at('o6/sub/up')), dangling: await describe(at('o6/dangling')), a: await describe(at('o6/a.txt')) }
  })
  out.fileLinkDereference = await attempt(async () => { await fsp.cp(at('rel-link'), at('o7'), { dereference: true }); return describe(at('o7')) })
  out.treeDereference = await attempt(async () => {
    await fsp.cp(at('tree'), at('o8'), { recursive: true, dereference: true })
    return { ln: await describe(at('o8/ln')) }
  })
  out.overwriteExistingFile = await attempt(async () => { await fsp.cp(at('rel-link'), at('existing-file')); return describe(at('existing-file')) })
  out.overwriteExistingLink = await attempt(async () => { await fsp.cp(at('abs-link'), at('existing-link')); return describe(at('existing-link')) })
  out.linkParentMissing = await attempt(async () => { await fsp.cp(at('rel-link'), at('p2/x')); return describe(at('p2/x')) })
  out.plainFileParentMissing = await attempt(async () => { await fsp.cp(at('real.txt'), at('p1/x')); return describe(at('p1/x')) })
  out.dereferenceDanglingFile = await attempt(async () => { await fsp.cp(at('dangling'), at('o9'), { dereference: true }); return 'unexpected' })
  out.dereferenceExistingLinkDest = await attempt(async () => { await fsp.cp(at('rel-link'), at('ex-link'), { dereference: true }); return 'unexpected' })
  out.linkIntoDirectory = await attempt(async () => { await fsp.cp(at('rel-link'), at('dd')); return 'unexpected' })
  out.linkDereferenceIntoDirectory = await attempt(async () => { await fsp.cp(at('rel-link'), at('dd'), { dereference: true }); return 'unexpected' })
  out.plainFileIntoDirectory = await attempt(async () => { await fsp.cp(at('real.txt'), at('dd')); return 'unexpected' })
  out.directoryIntoFile = await attempt(async () => { await fsp.cp(at('src-d'), at('plain'), { recursive: true }); return 'unexpected' })
  out.missingSource = await attempt(async () => { await fsp.cp(at('nope'), at('o10')); return 'unexpected' })
  await fsp.rm(dir, { recursive: true, force: true })
  return out
}

async function pipeBackpressure(sizes, delay) {
  const log = []
  let calls = 0
  const r = new s.stream.Readable({
    read() {
      calls += 1
      log.push('read ' + calls)
      if (calls <= sizes.length) this.push(Buffer.alloc(sizes[calls - 1], 96 + calls))
      else this.push(null)
    },
  })
  const w = new s.stream.Writable({
    write(chunk, enc, cb) {
      log.push('write ' + chunk.length)
      setTimeout(() => { log.push('written ' + chunk.length); cb() }, delay)
    },
  })
  r.on('pause', () => log.push('pause'))
  r.on('resume', () => log.push('resume'))
  w.on('drain', () => log.push('drain'))
  r.on('end', () => log.push('end'))
  r.on('close', () => log.push('r close'))
  w.on('finish', () => log.push('finish'))
  w.on('close', () => log.push('w close'))
  r.pipe(w)
  await closedEvent(w)
  return log
}

async function readableWithListener(setup) {
  const log = []
  const r = setup(log)
  r.on('end', () => log.push('end'))
  r.on('close', () => log.push('close'))
  await closedEvent(r)
  return log
}

async function pipeFirstChunkFailure() {
  const log = []
  const r = new s.stream.Readable({ read() { this.push('a'); this.push(null) } })
  const w = new s.stream.Writable({ write(chunk, enc, cb) { log.push('write ' + chunk.toString()); cb(new Error('dest boom')) } })
  r.on('pause', () => log.push('r pause'))
  r.on('end', () => log.push('r end'))
  w.on('error', (e) => log.push('w error ' + e.message))
  w.on('close', () => log.push('w close'))
  r.pipe(w)
  await closedEvent(w)
  return log
}

async function pipeMultiChunkFailure() {
  const chunks = ['a', 'b', 'c']
  const log = []
  let calls = 0
  const r = new s.stream.Readable({ read() { calls += 1; if (calls <= chunks.length) this.push(chunks[calls - 1]); else this.push(null) } })
  const w = new s.stream.Writable({ write(chunk, enc, cb) { log.push('write ' + chunk.toString()); setTimeout(() => cb(chunk.toString() === 'b' ? new Error('dest boom') : null), 1) } })
  r.on('pause', () => log.push('r pause'))
  r.on('resume', () => log.push('r resume'))
  r.on('end', () => log.push('r end'))
  r.on('close', () => log.push('r close'))
  w.on('error', (e) => log.push('w error ' + e.message))
  w.on('close', () => log.push('w close'))
  r.pipe(w)
  await closedEvent(w)
  return log
}

async function pipeDestroyWithoutError() {
  const log = []
  const r = new s.stream.Readable({ read() { this.push('a'); this.push('b'); this.push(null) } })
  const w = new s.stream.Writable({ write(chunk, enc, cb) { log.push('write ' + chunk.toString()); w.destroy(); cb() } })
  r.on('pause', () => log.push('r pause'))
  r.on('end', () => log.push('r end'))
  r.on('close', () => log.push('r close'))
  w.on('close', () => log.push('w close'))
  r.pipe(w)
  await closedEvent(w)
  return log
}

async function writableQueuedAfterError() {
  const log = []
  const w = new s.stream.Writable({ write(chunk, enc, cb) { log.push('_write ' + chunk.toString()); setTimeout(() => cb(chunk.toString() === 'x' ? new Error('bad') : null), 2) } })
  w.on('error', (e) => log.push('error ' + e.message))
  w.on('close', () => log.push('close'))
  w.write('x', (err) => log.push('cb x ' + (err ? err.message : 'ok')))
  w.write('y', (err) => log.push('cb y ' + (err ? err.message : 'ok')))
  w.write('z', (err) => log.push('cb z ' + (err ? err.message : 'ok')))
  await closedEvent(w)
  return log
}

async function writableWriteAfterDestroy() {
  const log = []
  const w = new s.stream.Writable({ write(chunk, enc, cb) { cb() } })
  w.on('error', (e) => log.push('error ' + e.code))
  w.on('close', () => log.push('close'))
  w.destroy()
  const ret = w.write('q', (err) => log.push('cb ' + (err ? err.code + ' ' + err.message : 'ok')))
  log.push('ret ' + ret)
  await closedEvent(w)
  return log
}

async function writableDestroyInsideWrite() {
  const log = []
  const w = new s.stream.Writable({ write(chunk, enc, cb) { log.push('_write ' + chunk.toString()); w.destroy(); cb() } })
  w.on('close', () => log.push('close'))
  log.push('r1 ' + w.write('a'))
  log.push('r2 ' + w.write('b', (err) => log.push('cb b ' + (err ? err.code : 'ok'))))
  await closedEvent(w)
  return log
}

async function writableDestroyWithQueue() {
  const log = []
  const w = new s.stream.Writable({ write(chunk, enc, cb) { log.push('_write ' + chunk.toString()); setTimeout(() => cb(), 2) } })
  w.on('error', (e) => log.push('error ' + e.code))
  w.on('close', () => log.push('close'))
  w.write('a', (err) => log.push('cb a ' + (err ? err.code : 'ok')))
  w.write('b', (err) => log.push('cb b ' + (err ? err.code : 'ok')))
  w.destroy()
  await closedEvent(w)
  await new Promise((resolve) => setTimeout(resolve, 10))
  return log
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const sinkTo = (name, log) => new s.stream.Writable({ write(c, e, cb) { log.push(name + ' write ' + c.toString()); cb() } })

async function unpipeFirstOfTwo() {
  const log = []
  let n = 0
  const r = new s.stream.Readable({ read() { n += 1; this.push(n <= 3 ? 'c' + n : null) } })
  const w1 = sinkTo('w1', log), w2 = sinkTo('w2', log)
  r.on('pause', () => log.push('r pause'))
  r.on('resume', () => log.push('r resume'))
  r.on('end', () => log.push('r end'))
  w1.on('unpipe', () => log.push('w1 unpipe'))
  w2.on('unpipe', () => log.push('w2 unpipe'))
  w1.on('finish', () => log.push('w1 finish'))
  w2.on('finish', () => log.push('w2 finish'))
  r.pipe(w1)
  r.pipe(w2)
  const ret = r.unpipe(w1)
  log.push('ret same ' + (ret === r))
  await wait(20)
  return log
}

async function unpipeNotPiped() {
  const log = []
  const r = new s.stream.Readable({ read() { this.push('x'); this.push(null) } })
  const w = sinkTo('w', log)
  r.on('pause', () => log.push('r pause'))
  w.on('unpipe', () => log.push('w unpipe'))
  r.pipe(w)
  const ret = r.unpipe(new s.stream.Writable({ write(c, e, cb) { cb() } }))
  log.push('ret same ' + (ret === r))
  await wait(20)
  log.push('paused ' + r.isPaused())
  return log
}

async function unpipeAllOfTwo() {
  const log = []
  const r = new s.stream.Readable({ read() { this.push('x'); this.push(null) } })
  const w1 = sinkTo('w1', log), w2 = sinkTo('w2', log)
  r.on('pause', () => log.push('r pause'))
  w1.on('unpipe', () => log.push('w1 unpipe'))
  w2.on('unpipe', () => log.push('w2 unpipe'))
  r.pipe(w1)
  r.pipe(w2)
  r.unpipe()
  log.push('paused ' + r.isPaused())
  await wait(20)
  return log
}

async function unpipeThenResume() {
  const log = []
  const r = new s.stream.Readable({ read() { this.push('a'); this.push(null) } })
  const w = sinkTo('w', log)
  r.on('pause', () => log.push('r pause'))
  r.on('end', () => log.push('r end'))
  w.on('finish', () => log.push('w finish'))
  r.pipe(w)
  r.unpipe(w)
  await wait(10)
  log.push('before resume ' + r.isPaused())
  r.resume()
  await wait(20)
  return log
}

async function repipeAfterUnpipe() {
  const log = []
  let n = 0
  const r = new s.stream.Readable({ read() { n += 1; this.push(n <= 2 ? 'r' + n : null) } })
  const w = sinkTo('w', log)
  w.on('finish', () => log.push('w finish'))
  r.on('end', () => log.push('r end'))
  r.pipe(w)
  r.unpipe(w)
  await wait(10)
  r.pipe(w)
  await wait(30)
  return log
}

async function cpSubdirScenario() {
  const dir = await fsp.mkdtemp('/tmp/cp-subdir-')
  const at = (name) => dir + '/' + name
  const shown = (text) => String(text).split(dir).join('ROOT')
  const describe = async (path) => {
    const entry = await fsp.lstat(path)
    if (entry.isSymbolicLink()) return { type: 'link', target: shown(await fsp.readlink(path)) }
    if (entry.isDirectory()) return { type: 'dir' }
    return { type: 'file', text: await fsp.readFile(path, 'utf8') }
  }
  const attempt = async (run) => {
    try { return await run() } catch (error) { return { error: error.code, message: shown(error.message) } }
  }
  await fsp.mkdir(at('D'))
  await fsp.mkdir(at('D/sub'))
  await fsp.writeFile(at('D/inner.txt'), 'INNER')
  await fsp.symlink(at('D'), at('linkD'))
  await fsp.symlink(at('D/sub'), at('linkSub'))
  await fsp.symlink(at('D/sub'), at('existing-into-sub'))
  await fsp.symlink(at('D/sub'), at('dest-sub-link'))
  await fsp.symlink(at('D'), at('dest-same-link'))
  await fsp.symlink(at('D'), at('dest-parent-link'))
  await fsp.writeFile(at('a.txt'), 'AAAA')
  await fsp.link(at('a.txt'), at('hard.txt'))
  await fsp.writeFile(at('b.txt'), 'BBBB')
  await fsp.symlink(at('a.txt'), at('via-link.txt'))
  const out = {}
  out.linkDirIntoOwnSubdirNew = await attempt(async () => { await fsp.cp(at('linkD'), at('D/sub/copy')); return describe(at('D/sub/copy')) })
  out.linkIntoSubdirOfTargetExistingDest = await attempt(async () => { await fsp.cp(at('linkD'), at('existing-into-sub')); return describe(at('existing-into-sub')) })
  out.destLinkPointsAtSrcSubdirExisting = await attempt(async () => { await fsp.cp(at('linkD'), at('dest-sub-link')); return describe(at('dest-sub-link')) })
  out.destLinkPointsAtSrcExistingSameTarget = await attempt(async () => { await fsp.cp(at('linkD'), at('dest-same-link')); return describe(at('dest-same-link')) })
  out.srcDirIntoLinkToItsSubdir = await attempt(async () => { await fsp.cp(at('D'), at('linkSub'), { recursive: true }); return 'unexpected' })
  out.srcLinkToSubdirOverDirLinkOfParent = await attempt(async () => { await fsp.cp(at('linkSub'), at('dest-parent-link')); return describe(at('dest-parent-link')) })
  out.hardLinkSameInode = await attempt(async () => { await fsp.cp(at('a.txt'), at('hard.txt')); return { a: await fsp.readFile(at('a.txt'), 'utf8') } })
  out.hardLinkSrcIsDestOtherName = await attempt(async () => { await fsp.cp(at('hard.txt'), at('a.txt')); return { a: await fsp.readFile(at('a.txt'), 'utf8') } })
  out.plainDistinctFilesControl = await attempt(async () => { await fsp.cp(at('b.txt'), at('c.txt')); return describe(at('c.txt')) })
  out.dereferenceHardLinkSameInode = await attempt(async () => { await fsp.cp(at('via-link.txt'), at('hard.txt'), { dereference: true }); return { a: await fsp.readFile(at('a.txt'), 'utf8') } })
  await fsp.rm(dir, { recursive: true, force: true })
  return out
}

async function cpSelfDirScenario() {
  const dir = await fsp.mkdtemp('/tmp/cp-self-')
  const at = (name) => dir + '/' + name
  const shown = (text) => String(text).split(dir).join('ROOT')
  const attempt = async (run) => {
    try { return await run() } catch (error) { return { error: error.code, message: shown(error.message) } }
  }
  await fsp.mkdir(at('D'))
  await fsp.writeFile(at('D/f.txt'), 'F')
  const out = {}
  out.intoOwnSubdirRecursive = await attempt(async () => { await fsp.cp(at('D'), at('D/sub'), { recursive: true }); return 'unexpected' })
  await fsp.mkdir(at('D/sub2'))
  out.intoOwnExistingSubdirRecursive = await attempt(async () => { await fsp.cp(at('D'), at('D/sub2'), { recursive: true }); return 'unexpected' })
  await fsp.rm(dir, { recursive: true, force: true })
  return out
}

async function cpFileOntoLinkScenario() {
  const roots = []
  const variant = async (setup, source, destination, options) => {
    const dir = await fsp.mkdtemp('/tmp/cp-file-link-')
    roots.push(dir)
    const at = (name) => dir + '/' + name
    const shown = (text) => String(text).split(dir).join('ROOT')
    await setup(at)
    try {
      await fsp.cp(at(source), at(destination), options)
      const entry = await fsp.lstat(at(destination))
      return { ok: true, dstIsLink: entry.isSymbolicLink(), dstText: entry.isSymbolicLink() ? null : await fsp.readFile(at(destination), 'utf8'), a: await fsp.readFile(at('a.txt'), 'utf8').catch((error) => 'ERR ' + error.code) }
    } catch (error) {
      return { ok: false, code: error.code, message: shown(error.message) }
    }
  }
  const out = {}
  const relToOther = async (at) => { await fsp.writeFile(at('a.txt'), 'AAAA'); await fsp.writeFile(at('b.txt'), 'BBBB'); await fsp.symlink('a.txt', at('l')) }
  const absToOther = async (at) => { await fsp.writeFile(at('a.txt'), 'AAAA'); await fsp.writeFile(at('b.txt'), 'BBBB'); await fsp.symlink(at('a.txt'), at('l')) }
  const toItself = async (at) => { await fsp.writeFile(at('a.txt'), 'AAAA'); await fsp.symlink('a.txt', at('l')) }
  const dangling = async (at) => { await fsp.writeFile(at('b.txt'), 'BBBB'); await fsp.symlink('gone.txt', at('l')) }
  const toDir = async (at) => { await fsp.writeFile(at('b.txt'), 'BBBB'); await fsp.mkdir(at('d')); await fsp.symlink('d', at('l')) }
  out.plainRelLinkToOtherFile = await variant(relToOther, 'b.txt', 'l')
  out.plainAbsLinkToOtherFile = await variant(absToOther, 'b.txt', 'l')
  out.plainLinkToItself = await variant(toItself, 'a.txt', 'l')
  out.plainDanglingLink = await variant(dangling, 'b.txt', 'l')
  out.plainLinkToDirectory = await variant(toDir, 'b.txt', 'l')
  out.derefRelLinkToOtherFile = await variant(relToOther, 'b.txt', 'l', { dereference: true })
  out.derefLinkToItself = await variant(toItself, 'a.txt', 'l', { dereference: true })
  out.derefDanglingLink = await variant(dangling, 'b.txt', 'l', { dereference: true })
  out.derefDanglingLinkTargetText = await fsp.readFile(roots[roots.length - 1] + '/gone.txt', 'utf8').catch((error) => 'ERR ' + error.code)
  const hard = async (dir) => {
    const at = (name) => dir + '/' + name
    await fsp.writeFile(at('src.txt'), 'SRC')
    await fsp.writeFile(at('dst.txt'), 'OLD')
    const before = (await fsp.stat(at('dst.txt'))).ino
    await fsp.link(at('dst.txt'), at('sibling.txt'))
    await fsp.cp(at('src.txt'), at('dst.txt'))
    return { sibling: await fsp.readFile(at('sibling.txt'), 'utf8'), dst: await fsp.readFile(at('dst.txt'), 'utf8'), inodeChanged: (await fsp.stat(at('dst.txt'))).ino !== before }
  }
  const hardDir = await fsp.mkdtemp('/tmp/cp-file-hard-')
  roots.push(hardDir)
  out.plainOverwriteHardLinkSibling = await hard(hardDir)
  for (const dir of roots) await fsp.rm(dir, { recursive: true, force: true })
  return out
}

const emitterReadable = () => {
  let n = 0
  return new s.stream.Readable({ read() { n += 1; this.push(n <= 2 ? 'c' + n : null) } })
}

async function emitterAddListenerFlows() {
  const log = []
  const r = emitterReadable()
  const ret = r.addListener('data', (c) => log.push('data ' + String(c)))
  log.push('ret same ' + (ret === r))
  await wait(20)
  log.push('flowing ' + r.readableFlowing)
  return log
}

async function emitterOnFlows() {
  const log = []
  const r = emitterReadable()
  r.on('data', (c) => log.push('data ' + String(c)))
  await wait(20)
  log.push('flowing ' + r.readableFlowing)
  return log
}

async function emitterPrependDataDoesNotFlow() {
  const log = []
  const r = emitterReadable()
  r.prependListener('data', (c) => log.push('data ' + String(c)))
  await wait(20)
  log.push('flowing ' + r.readableFlowing)
  return log
}

function emitterOffRemoves() {
  const log = []
  const r = emitterReadable()
  const f = () => log.push('f')
  r.on('x', f)
  const ret = r.off('x', f)
  log.push('ret same ' + (ret === r))
  log.push('count ' + r.listenerCount('x'))
  r.emit('x')
  return log
}

function emitterRemoveOnceByOriginal() {
  const log = []
  const r = emitterReadable()
  const f = () => log.push('f')
  r.once('x', f)
  r.removeListener('x', f)
  log.push('count ' + r.listenerCount('x'))
  r.emit('x')
  return log
}

function emitterListenersUnwrapsOnce() {
  const r = emitterReadable()
  const f = () => {}
  const g = () => {}
  r.once('x', f)
  r.on('x', g)
  const list = r.listeners('x')
  return [list.length, list[0] === f, list[1] === g]
}

function emitterListenersReturnsCopy() {
  const r = emitterReadable()
  r.on('x', () => {})
  r.listeners('x').push(() => {})
  return r.listenerCount('x')
}

function emitterEventNamesOnlyWithListeners() {
  const r = emitterReadable()
  const f = () => {}
  r.on('a', f)
  r.once('b', () => {})
  r.on('c', () => {})
  r.off('a', f)
  return r.eventNames()
}

function emitterPrependOrder() {
  const log = []
  const w = new s.stream.Writable({ write(c, e, cb) { cb() } })
  w.on('x', () => log.push('a'))
  const ret = w.prependListener('x', () => log.push('b'))
  log.push('ret same ' + (ret === w))
  w.emit('x')
  return log
}

function emitterRemoveAllNamedEmitsRemoveListener() {
  const log = []
  const r = emitterReadable()
  r.on('removeListener', (name) => log.push('removed event ' + name))
  r.on('x', () => {})
  r.on('x', () => {})
  const ret = r.removeAllListeners('x')
  log.push('ret same ' + (ret === r))
  log.push('count ' + r.listenerCount('x'))
  return log
}

function emitterRemoveAllEmitsInKeyOrder() {
  const log = []
  const w = new s.stream.Writable({ write(c, e, cb) { cb() } })
  w.on('a', () => {})
  w.on('removeListener', (name) => log.push('removeListener ' + name))
  w.on('b', () => {})
  w.removeAllListeners()
  log.push('names ' + JSON.stringify(w.eventNames()))
  return log
}

async function emitterWritableAddListenerFinish() {
  const log = []
  const w = new s.stream.Writable({ write(c, e, cb) { cb() } })
  w.addListener('finish', () => log.push('finish'))
  w.end('x')
  await wait(20)
  return log
}

async function emitterReadableListenerRemovalResetsFlowing() {
  const log = []
  const r = emitterReadable()
  const f = () => {}
  r.on('readable', f)
  log.push('flowing before ' + r.readableFlowing)
  r.removeListener('readable', f)
  await wait(10)
  log.push('flowing after ' + r.readableFlowing)
  return log
}

async function emitterOffReadableResetsFlowing() {
  const log = []
  const r = emitterReadable()
  const f = () => {}
  r.on('readable', f)
  r.off('readable', f)
  await wait(10)
  log.push('flowing ' + r.readableFlowing)
  return log
}

async function emitterRemoveAllReadableResetsFlowing() {
  const log = []
  const r = emitterReadable()
  r.on('readable', () => {})
  r.removeAllListeners('readable')
  await wait(10)
  log.push('flowing ' + r.readableFlowing)
  return log
}

function emitterAddListenerReturnsThis() {
  const r = emitterReadable()
  return r.addListener('x', () => {}) === r
}

async function writableCorkBuffers() {
  const log = []
  const w = new s.stream.Writable({ write(c, e, cb) { log.push('_write ' + c.toString() + ' ' + e); cb() } })
  log.push('cork returns ' + typeof w.cork())
  log.push('corked ' + w.writableCorked)
  w.write('a')
  w.write('b')
  log.push('before uncork ' + log.filter((x) => x.startsWith('_write')).length)
  log.push('uncork returns ' + typeof w.uncork())
  log.push('after uncork corked ' + w.writableCorked)
  await wait(10)
  return log
}

async function writableCorkWritev() {
  const log = []
  const w = new s.stream.Writable({ writev(chunks, cb) { log.push('writev ' + chunks.map((x) => x.chunk.toString() + ':' + x.encoding).join(',')); cb() }, write(c, e, cb) { log.push('_write ' + c.toString()); cb() } })
  w.cork()
  w.write('a')
  w.write('b')
  w.uncork()
  await wait(10)
  return log
}

async function writableDoubleCork() {
  const log = []
  const w = new s.stream.Writable({ write(c, e, cb) { log.push('_write ' + c.toString()); cb() } })
  w.cork()
  w.cork()
  log.push('corked ' + w.writableCorked)
  w.write('a')
  w.uncork()
  await wait(5)
  log.push('after one uncork writes ' + log.filter((x) => x.startsWith('_write')).length + ' corked ' + w.writableCorked)
  w.uncork()
  await wait(5)
  log.push('after second uncork writes ' + log.filter((x) => x.startsWith('_write')).length)
  return log
}

function writableUncorkWithoutCork() {
  const w = new s.stream.Writable({ write(c, e, cb) { cb() } })
  w.uncork()
  return 'corked ' + w.writableCorked
}

async function writableEndWhileCorked() {
  const log = []
  const w = new s.stream.Writable({ write(c, e, cb) { log.push('_write ' + c.toString()); cb() } })
  w.on('finish', () => log.push('finish'))
  w.cork()
  w.write('a')
  w.end()
  log.push('after end corked ' + w.writableCorked)
  await wait(10)
  return log
}

async function writableSetDefaultEncodingHex() {
  const log = []
  const w = new s.stream.Writable({ write(c, e, cb) { log.push('_write ' + c.toString() + ' ' + e + ' ' + Buffer.isBuffer(c)); cb() } })
  const ret = w.setDefaultEncoding('hex')
  log.push('returns same ' + (ret === w))
  w.write('6869')
  await wait(5)
  return log
}

async function writableSetDefaultEncodingNoDecode() {
  const log = []
  const w = new s.stream.Writable({ decodeStrings: false, write(c, e, cb) { log.push('_write ' + typeof c + ' ' + c + ' ' + e); cb() } })
  w.setDefaultEncoding('hex')
  w.write('6869')
  await wait(5)
  return log
}

function writableSetDefaultEncodingInvalid() {
  const w = new s.stream.Writable({ write(c, e, cb) { cb() } })
  try {
    w.setDefaultEncoding('bogus')
    return 'ok'
  } catch (error) {
    return error.code
  }
}

async function writableWritevBacklogNoCork() {
  const log = []
  const w = new s.stream.Writable({
    write(c, e, cb) { log.push('_write ' + c.toString()); setTimeout(cb, 2) },
    writev(chunks, cb) { log.push('writev ' + chunks.map((x) => x.chunk.toString()).join(',')); setTimeout(cb, 2) }
  })
  w.write('a')
  w.write('b')
  w.write('c')
  w.end()
  await new Promise((resolve) => w.on('finish', resolve))
  return log
}

async function readableSetEncodingUtf8Split() {
  const log = []
  const r = new s.stream.Readable({ read() {} })
  r.setEncoding('utf8')
  r.on('data', (c) => log.push('data ' + typeof c + ' ' + c))
  r.push(Buffer.from([0xc3]))
  r.push(Buffer.from([0xa9]))
  r.push(null)
  await wait(10)
  return log
}

function readableSetEncodingReturnsThis() {
  const r = new s.stream.Readable({ read() {} })
  return r.setEncoding('utf8') === r
}

async function readableSetEncodingHexOnBuffer() {
  const log = []
  const r = new s.stream.Readable({ read() {} })
  r.setEncoding('hex')
  r.on('data', (c) => log.push('data ' + typeof c + ' ' + c))
  r.push(Buffer.from('hi'))
  r.push(null)
  await wait(10)
  return log
}

function readableSetEncodingBuffered() {
  const r = new s.stream.Readable({ read() {} })
  r.push(Buffer.from('hi'))
  r.setEncoding('hex')
  const v = r.read()
  return typeof v + ' ' + v
}

function readableSetEncodingInvalid() {
  const r = new s.stream.Readable({ read() {} })
  try {
    r.setEncoding('bogus')
    return 'ok'
  } catch (error) {
    return error.name + ' ' + error.code + ' ' + error.message
  }
}

function readableReadNWithEncoding() {
  const r = new s.stream.Readable({ read() {} })
  r.setEncoding('utf8')
  r.push(Buffer.from('héllo'))
  r.push(null)
  const a = r.read(2)
  const b = r.read()
  return [typeof a, a, b]
}

async function readableBase64Split() {
  const log = []
  const r = new s.stream.Readable({ read() {} })
  r.setEncoding('base64')
  r.on('data', (c) => log.push('data ' + c))
  r.push(Buffer.from([1, 2]))
  r.push(Buffer.from([3, 4, 5]))
  r.push(null)
  await wait(10)
  return log
}

async function readableUnshiftFront() {
  const log = []
  const r = new s.stream.Readable({ read() {} })
  r.push('b')
  r.unshift('a')
  r.push(null)
  r.on('data', (c) => log.push('data ' + c))
  await wait(10)
  return log
}

function readableUnshiftReturns() {
  const fresh = new s.stream.Readable({ read() {} })
  const afterPush = new s.stream.Readable({ read() {} })
  afterPush.push('a')
  const afterEnd = new s.stream.Readable({ read() {} })
  afterEnd.push(null)
  const empty = new s.stream.Readable({ read() {} })
  return [fresh.unshift('x'), afterPush.unshift('x'), afterEnd.unshift('x'), empty.unshift(Buffer.alloc(0))]
}

async function readableUnshiftHexString() {
  const log = []
  const r = new s.stream.Readable({ read() {} })
  r.unshift('6869', 'hex')
  r.push(null)
  r.on('data', (c) => log.push('data ' + c))
  await wait(10)
  return log
}

function readableUnshiftBeforeEndAllowed() {
  const r = new s.stream.Readable({ read() {} })
  r.push(null)
  r.unshift('x')
  return String(r.read())
}

async function readableUnshiftAfterEndEmitted() {
  const log = []
  const r = new s.stream.Readable({ read() {} })
  r.on('error', (e) => log.push('error ' + e.code + ' ' + e.message))
  r.on('data', () => {})
  r.on('end', () => log.push('ret ' + r.unshift('x')))
  r.push('a')
  r.push(null)
  await wait(10)
  return log
}

async function readableUnshiftEmptyChunk() {
  const log = []
  const r = new s.stream.Readable({ read() {} })
  r.push('b')
  r.unshift(Buffer.alloc(0))
  r.push(null)
  r.on('data', (c) => log.push('data ' + c))
  await wait(10)
  return log
}

async function readableUnshiftBufferWithEncoding() {
  const log = []
  const r = new s.stream.Readable({ read() {} })
  r.setEncoding('hex')
  r.unshift(Buffer.from('hi'))
  r.push(null)
  r.on('data', (c) => log.push('data ' + typeof c + ' ' + c))
  await wait(10)
  return log
}

async function readableUnshiftStringWithEncodingSet() {
  const log = []
  const r = new s.stream.Readable({ read() {} })
  r.setEncoding('hex')
  r.unshift('hi')
  r.push(null)
  r.on('data', (c) => log.push('data ' + typeof c + ' ' + c))
  await wait(10)
  return log
}

class WrapOld {
  constructor(log) {
    this.log = log
    this.listeners = {}
  }

  on(name, fn) {
    ;(this.listeners[name] ??= []).push(fn)
    return this
  }

  emit(name, ...args) {
    for (const fn of this.listeners[name] ?? []) fn(...args)
  }

  pause() {
    this.log.push('old pause')
    return this
  }

  resume() {
    this.log.push('old resume')
    return this
  }
}

async function readableWrapData() {
  const log = []
  const old = new WrapOld(log)
  const r = new s.stream.Readable({ read() {} })
  const ret = r.wrap(old)
  log.push('returns same ' + (ret === r))
  r.on('data', (c) => log.push('data ' + typeof c + ' ' + c))
  r.on('end', () => log.push('end'))
  old.emit('data', Buffer.from('a'))
  old.emit('data', 'b')
  old.emit('end')
  await wait(10)
  return log
}

async function readableWrapError() {
  const log = []
  const old = new WrapOld(log)
  const r = new s.stream.Readable({ read() {} })
  r.wrap(old)
  r.on('error', (e) => log.push('error ' + e.message))
  old.emit('error', new Error('boom'))
  await wait(10)
  return log
}

async function readableWrapClose() {
  const log = []
  const old = new WrapOld(log)
  const r = new s.stream.Readable({ read() {} })
  r.wrap(old)
  r.on('close', () => log.push('r close'))
  old.emit('close')
  await wait(10)
  log.push('destroyed ' + r.destroyed)
  return log
}

async function readableWrapPausesWhenFull() {
  const log = []
  const old = new WrapOld(log)
  const r = new s.stream.Readable({ read() {} })
  r.wrap(old)
  old.emit('data', Buffer.alloc(70000))
  log.push('pushed buffered ' + r.readableLength)
  return log
}

async function readableWrapResumesOnRead() {
  const log = []
  const old = new WrapOld(log)
  const r = new s.stream.Readable({ read() {} })
  r.wrap(old)
  old.emit('data', Buffer.alloc(70000))
  r.on('data', (c) => log.push('data ' + c.length))
  await wait(10)
  return log
}

function readableWrapSmallDoesNotPause() {
  const log = []
  const old = new WrapOld(log)
  const r = new s.stream.Readable({ read() {} })
  r.wrap(old)
  old.emit('data', Buffer.alloc(100))
  log.push('buffered ' + r.readableLength)
  return log
}

async function readableWrapEndWithoutConsumer() {
  const log = []
  const old = new WrapOld(log)
  const r = new s.stream.Readable({ read() {} })
  r.wrap(old)
  r.on('end', () => log.push('end'))
  old.emit('data', Buffer.from('z'))
  old.emit('end')
  await wait(10)
  log.push('ended pending ' + r.readableEnded)
  r.read()
  await wait(10)
  return log
}

function readableWrapForwardsMethods() {
  const old = { hello(x) { return 'hi ' + x }, on() { return this }, value: 3 }
  const r = new s.stream.Readable({ read() {} })
  r.wrap(old)
  return [typeof r.hello, r.hello ? r.hello('there') : null, typeof r.value]
}

function readableWrapClassMethodsNotForwarded() {
  class Plain {
    hello() {
      return 'hi'
    }

    on() {
      return this
    }
  }
  const r = new s.stream.Readable({ read() {} })
  r.wrap(new Plain())
  return typeof r.hello
}

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
  { name: 'stream pipe: a 70000-byte chunk pauses the source until drain, then the source ends after the last drain', run: () => streamSettle(pipeBackpressure([70000, 70000, 70000], 5)), expected: ["read 1","resume","read 2","write 70000","pause","written 70000","drain","resume","read 3","write 70000","pause","written 70000","drain","resume","read 4","write 70000","pause","end","r close","written 70000","finish","w close"] },
  { name: 'stream pipe: small chunks never pause and the destination pauses the source only after finish', run: () => streamSettle(pipeBackpressure([1000, 1000, 1000], 5)), expected: ["read 1","resume","read 2","write 1000","read 3","read 4","end","r close","written 1000","write 1000","written 1000","write 1000","written 1000","finish","pause","w close"] },
  { name: 'stream pipe: four 40000-byte chunks pause after the second write and resume on drain', run: () => streamSettle(pipeBackpressure([40000, 40000, 40000, 40000], 5)), expected: ["read 1","resume","read 2","write 40000","read 3","pause","read 4","written 40000","write 40000","written 40000","drain","resume","read 5","write 40000","pause","end","r close","written 40000","write 40000","written 40000","finish","w close"] },
  { name: 'stream pipe: one 200000-byte chunk pauses at once and the source ends before the write finishes', run: () => streamSettle(pipeBackpressure([200000], 5)), expected: ["read 1","resume","read 2","write 200000","pause","end","r close","written 200000","finish","w close"] },
  { name: 'stream Writable: write returns false once 64 KiB is queued', run: () => {
    const w = new s.stream.Writable({ write(chunk, enc, cb) { setTimeout(cb, 5) } })
    return [w.write(Buffer.alloc(40000)), w.write(Buffer.alloc(40000)), w.write(Buffer.alloc(1))]
  }, expected: [true, false, false] },
  { name: 'stream Readable: read() with no argument returns all buffered data in a readable listener', run: () => streamSettle(readableWithListener((log) => {
    const r = new s.stream.Readable({ read() { this.push('abc'); this.push(null) } })
    r.on('readable', () => { log.push('readable'); let c; while ((c = r.read()) !== null) log.push('read ' + c) })
    return r
  })), expected: ["readable","read abc","end","close"] },
  { name: 'stream Readable: read(5) then read(3) then read() then read() returns null at the end', run: () => streamSettle(readableWithListener((log) => {
    const r = new s.stream.Readable({ read() { this.push('hello world'); this.push(null) } })
    r.once('readable', () => {
      log.push('readable')
      log.push('read5 ' + r.read(5))
      log.push('read3 ' + r.read(3))
      log.push('readAll ' + r.read())
      log.push('readNull ' + r.read())
    })
    return r
  })), expected: ["readable","read5 hello","read3  wo","readAll rld","readNull null","end","close"] },
  { name: 'stream Readable: an ended stream with no data emits readable, then end, then close', run: () => streamSettle(readableWithListener((log) => {
    const r = new s.stream.Readable({ read() { this.push(null) } })
    r.on('readable', () => { log.push('readable'); log.push('read ' + r.read()) })
    return r
  })), expected: ["readable","read null","end","close"] },
  { name: 'stream Readable: an async push emits readable again after the data', run: () => streamSettle(readableWithListener((log) => {
    const r = new s.stream.Readable({ read() { setTimeout(() => { this.push('x'); this.push(null) }, 5) } })
    r.on('readable', () => { log.push('readable'); let c; while ((c = r.read()) !== null) log.push('read ' + c) })
    return r
  })), expected: ["readable","read x","readable","end","close"] },
  { name: 'stream Readable: read(5) waits for more data and returns short only at the end', run: () => streamSettle(readableWithListener((log) => {
    let calls = 0
    const r = new s.stream.Readable({
      read() {
        calls += 1
        log.push('_read ' + calls)
        if (calls === 1) this.push('ab')
        else if (calls === 2) setTimeout(() => { this.push('cdefg'); this.push(null) }, 5)
      },
    })
    r.on('readable', () => { log.push('readable'); let c; while ((c = r.read(5)) !== null) log.push('read5 ' + c) })
    return r
  })), expected: ["_read 1","readable","_read 2","readable","read5 abcde","read5 fg","readable","end","close"] },
  { name: 'stream Readable: read(5) on a short ended stream returns the short data, then null', run: () => streamSettle(readableWithListener((log) => {
    const r = new s.stream.Readable({ read() { this.push('ab'); this.push(null) } })
    r.once('readable', () => { log.push('readable'); log.push('read5 ' + r.read(5)); log.push('readNull ' + r.read()) })
    return r
  })), expected: ["readable","read5 ab","readNull null","end","close"] },
  { name: 'stream Readable: a single pushed chunk emits readable, read, then end', run: () => streamSettle(readableWithListener((log) => {
    const r = new s.stream.Readable({ read() { this.push('z'); this.push(null) } })
    r.on('readable', () => { log.push('readable'); let c; while ((c = r.read()) !== null) log.push('read ' + c) })
    return r
  })), expected: ["readable","read z","end","close"] },
  { name: 'stream Readable: a push after end emits ERR_STREAM_PUSH_AFTER_EOF and no end', run: () => streamSettle(readableWithListener((log) => {
    const r = new s.stream.Readable({ read() { this.push('a'); this.push(null); this.push('late') } })
    r.on('data', (c) => log.push('data ' + c.toString()))
    r.on('error', (e) => log.push('error ' + e.code + ' ' + e.message))
    return r
  })), expected: ["data a","error ERR_STREAM_PUSH_AFTER_EOF stream.push() after EOF","close"] },
  { name: 'stream pipe into a PassThrough emits the data, then end, then close', run: () => streamSettle((async () => {
    const log = []
    const r = new s.stream.Readable({ read() { this.push('p'); this.push(null) } })
    const p = new s.stream.PassThrough()
    p.on('data', (c) => log.push('data ' + c.toString()))
    p.on('end', () => log.push('p end'))
    p.on('close', () => log.push('p close'))
    r.pipe(p)
    await closedEvent(p)
    return log
  })()), expected: ["data p","p end","p close"] },
  { name: 'fs.constants O_* flags match Node on this x86_64 Linux host', run: () => ['O_RDONLY', 'O_WRONLY', 'O_RDWR', 'O_CREAT', 'O_EXCL', 'O_NOCTTY', 'O_TRUNC', 'O_APPEND', 'O_NONBLOCK', 'O_DSYNC', 'O_DIRECT', 'O_DIRECTORY', 'O_NOFOLLOW', 'O_NOATIME', 'O_SYNC'].map((key) => s.fs.constants[key]), expected: [0, 1, 2, 64, 128, 256, 512, 1024, 2048, 4096, 16384, 65536, 131072, 262144, 1052672] },
  { name: 'buffer.constants MAX_LENGTH and MAX_STRING_LENGTH match Node', run: () => [s.buffer.constants.MAX_LENGTH, s.buffer.constants.MAX_STRING_LENGTH], expected: [9007199254740991, 536870888] },
  { name: 'stream pipe: a destination error on the first write pauses the source before end, then the error reaches the listener', run: () => streamSettle(pipeFirstChunkFailure()), expected: ["write a","r pause","r end","w error dest boom","w close"] },
  { name: 'stream pipe: a destination error on the second of three chunks stops the writes and pauses the source', run: () => streamSettle(pipeMultiChunkFailure()), expected: ["r resume","write a","r end","r close","write b","r pause","w error dest boom","w close"] },
  { name: 'stream pipe: destroying the destination inside write pauses the source without ending it', run: () => streamSettle(pipeDestroyWithoutError()), expected: ["write a","r pause","w close"] },
  { name: 'stream Writable: a failed write calls back every queued write with the same error, then error, then close', run: () => streamSettle(writableQueuedAfterError()), expected: ["_write x","cb x bad","cb y bad","cb z bad","error bad","close"] },
  { name: 'stream Writable: a write after destroy returns false and calls back with ERR_STREAM_DESTROYED', run: () => streamSettle(writableWriteAfterDestroy()), expected: ["ret false","close","cb ERR_STREAM_DESTROYED Cannot call write after a stream was destroyed"] },
  { name: 'stream Writable: destroy inside write makes the write return false and the later write fail', run: () => streamSettle(writableDestroyInsideWrite()), expected: ["_write a","r1 false","r2 false","close","cb b ERR_STREAM_DESTROYED"] },
  { name: 'stream Writable: destroy with a write in flight closes first, then the in-flight callback runs and the queued one fails', run: () => streamSettle(writableDestroyWithQueue()), expected: ["_write a","close","cb a ok","cb b ERR_STREAM_DESTROYED"] },
  { name: 'stream unpipe(dest): removing the first of two destinations emits unpipe on it only, and the other keeps receiving', run: () => streamSettle(unpipeFirstOfTwo()), expected: ["w1 unpipe","ret same true","r resume","w2 write c1","w2 write c2","w2 write c3","r end","w2 finish","r pause","w2 unpipe"] },
  { name: 'stream unpipe(dest): a destination that is not piped does nothing and returns the stream', run: () => streamSettle(unpipeNotPiped()), expected: ["ret same true","w write x","r pause","w unpipe","paused true"] },
  { name: 'stream unpipe(): with two destinations pauses once, then emits unpipe on each', run: () => streamSettle(unpipeAllOfTwo()), expected: ["r pause","w1 unpipe","w2 unpipe","paused true"] },
  { name: 'stream unpipe(dest): the stream stays paused until resume, then ends without ending the destination', run: () => streamSettle(unpipeThenResume()), expected: ["r pause","before resume true","r end"] },
  { name: 'stream pipe after unpipe(dest): the destination receives the data and finishes again', run: () => streamSettle(repipeAfterUnpipe()), expected: ["w write r1","w write r2","r end","w finish"] },
  { name: 'fs.promises.cp: links into their own source subdirectory, links onto a hard link, and the hard-link inode check report Node errors', run: () => cpSubdirScenario(), expected: {"linkDirIntoOwnSubdirNew":{"type":"link","target":"ROOT/D"},"linkIntoSubdirOfTargetExistingDest":{"error":"ERR_FS_CP_EINVAL","message":"Invalid src or dest: cp returned EINVAL (cannot copy ROOT/D to a subdirectory of self ROOT/D/sub) ROOT/existing-into-sub"},"destLinkPointsAtSrcSubdirExisting":{"error":"ERR_FS_CP_EINVAL","message":"Invalid src or dest: cp returned EINVAL (cannot copy ROOT/D to a subdirectory of self ROOT/D/sub) ROOT/dest-sub-link"},"destLinkPointsAtSrcExistingSameTarget":{"error":"ERR_FS_CP_EINVAL","message":"Invalid src or dest: cp returned EINVAL (cannot copy ROOT/D to a subdirectory of self ROOT/D) ROOT/dest-same-link"},"srcDirIntoLinkToItsSubdir":{"error":"ERR_FS_CP_DIR_TO_NON_DIR","message":"Cannot overwrite non-directory with directory: cp returned EISDIR (cannot overwrite non-directory ROOT/linkSub with directory ROOT/D) ROOT/linkSub"},"srcLinkToSubdirOverDirLinkOfParent":{"error":"ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY","message":"Cannot overwrite symlink in subdirectory of self: cp returned EINVAL (cannot overwrite ROOT/D with ROOT/D/sub) ROOT/dest-parent-link"},"hardLinkSameInode":{"error":"ERR_FS_CP_EINVAL","message":"Invalid src or dest: cp returned EINVAL (src and dest cannot be the same) ROOT/hard.txt"},"hardLinkSrcIsDestOtherName":{"error":"ERR_FS_CP_EINVAL","message":"Invalid src or dest: cp returned EINVAL (src and dest cannot be the same) ROOT/a.txt"},"plainDistinctFilesControl":{"type":"file","text":"BBBB"},"dereferenceHardLinkSameInode":{"error":"ERR_FS_CP_EINVAL","message":"Invalid src or dest: cp returned EINVAL (src and dest cannot be the same) ROOT/hard.txt"}} },
  { name: 'fs.promises.cp: a directory into its own subdirectory reports ERR_FS_CP_EINVAL, new and existing', run: () => cpSelfDirScenario(), expected: {"intoOwnSubdirRecursive":{"error":"ERR_FS_CP_EINVAL","message":"Invalid src or dest: cp returned EINVAL (cannot copy ROOT/D to a subdirectory of self ROOT/D/sub) ROOT/D/sub"},"intoOwnExistingSubdirRecursive":{"error":"ERR_FS_CP_EINVAL","message":"Invalid src or dest: cp returned EINVAL (cannot copy ROOT/D to a subdirectory of self ROOT/D/sub2) ROOT/D/sub2"}} },
  { name: 'fs.promises.cp: a file copied onto an existing link replaces the link, and an overwrite unlinks the destination so a hard-linked sibling keeps its content', run: () => cpFileOntoLinkScenario(), expected: {"plainRelLinkToOtherFile":{"ok":true,"dstIsLink":false,"dstText":"BBBB","a":"AAAA"},"plainAbsLinkToOtherFile":{"ok":true,"dstIsLink":false,"dstText":"BBBB","a":"AAAA"},"plainLinkToItself":{"ok":true,"dstIsLink":false,"dstText":"AAAA","a":"AAAA"},"plainDanglingLink":{"ok":true,"dstIsLink":false,"dstText":"BBBB","a":"ERR ENOENT"},"plainLinkToDirectory":{"ok":true,"dstIsLink":false,"dstText":"BBBB","a":"ERR ENOENT"},"derefRelLinkToOtherFile":{"ok":true,"dstIsLink":false,"dstText":"BBBB","a":"AAAA"},"derefLinkToItself":{"ok":false,"code":"ERR_FS_CP_EINVAL","message":"Invalid src or dest: cp returned EINVAL (src and dest cannot be the same) ROOT/l"},"derefDanglingLink":{"ok":true,"dstIsLink":true,"dstText":null,"a":"ERR ENOENT"},"derefDanglingLinkTargetText":"BBBB","plainOverwriteHardLinkSibling":{"sibling":"OLD","dst":"SRC","inodeChanged":true}} },
  { name: 'stream Emitter: addListener on a Readable starts the flow, as on does', run: () => streamSettle(emitterAddListenerFlows()), expected: ["ret same true","data c1","data c2","flowing true"] },
  { name: 'stream Emitter: on("data") starts the flow', run: () => streamSettle(emitterOnFlows()), expected: ["data c1","data c2","flowing true"] },
  { name: 'stream Emitter: prependListener("data") does not start the flow', run: () => streamSettle(emitterPrependDataDoesNotFlow()), expected: ["flowing null"] },
  { name: 'stream Emitter: off removes the listener and returns the stream', run: () => emitterOffRemoves(), expected: ["ret same true","count 0"] },
  { name: 'stream Emitter: removeListener finds a once listener by its original function', run: () => emitterRemoveOnceByOriginal(), expected: ["count 0"] },
  { name: 'stream Emitter: listeners returns the original functions, not once wrappers', run: () => emitterListenersUnwrapsOnce(), expected: [2,true,true] },
  { name: 'stream Emitter: listeners returns a copy', run: () => emitterListenersReturnsCopy(), expected: 1 },
  { name: 'stream Emitter: eventNames lists only names that still have a listener', run: () => emitterEventNamesOnlyWithListeners(), expected: ["b","c"] },
  { name: 'stream Emitter: prependListener puts the listener first', run: () => emitterPrependOrder(), expected: ["ret same true","b","a"] },
  { name: 'stream Emitter: removeAllListeners(name) emits removeListener for each listener', run: () => emitterRemoveAllNamedEmitsRemoveListener(), expected: ["removed event x","removed event x","ret same true","count 0"] },
  { name: 'stream Emitter: removeAllListeners() removes names in key order and the removeListener listeners last', run: () => emitterRemoveAllEmitsInKeyOrder(), expected: ["removeListener a","removeListener b","names []"] },
  { name: 'stream Emitter: addListener on a Writable receives finish', run: () => streamSettle(emitterWritableAddListenerFinish()), expected: ["finish"] },
  { name: 'stream Emitter: removing the last readable listener resets flowing to null after a tick', run: () => streamSettle(emitterReadableListenerRemovalResetsFlowing()), expected: ["flowing before false","flowing after null"] },
  { name: 'stream Emitter: off("readable") resets flowing to null after a tick', run: () => streamSettle(emitterOffReadableResetsFlowing()), expected: ["flowing null"] },
  { name: 'stream Emitter: removeAllListeners("readable") resets flowing to null after a tick', run: () => streamSettle(emitterRemoveAllReadableResetsFlowing()), expected: ["flowing null"] },
  { name: 'stream Emitter: addListener returns the stream', run: () => emitterAddListenerReturnsThis(), expected: true },
  { name: 'stream Writable.cork: writes buffer until uncork, then each goes to _write with the buffer encoding', run: () => streamSettle(writableCorkBuffers()), expected: ["cork returns undefined","corked 1","before uncork 0","_write a buffer","_write b buffer","uncork returns undefined","after uncork corked 0"] },
  { name: 'stream Writable.cork: a corked backlog goes to _writev as one call when writev is defined', run: () => streamSettle(writableCorkWritev()), expected: ["writev a:buffer,b:buffer"] },
  { name: 'stream Writable.cork: two cork calls need two uncork calls before the buffer flushes', run: () => streamSettle(writableDoubleCork()), expected: ["corked 2","after one uncork writes 0 corked 1","_write a","after second uncork writes 1"] },
  { name: 'stream Writable.uncork without cork does nothing', run: () => writableUncorkWithoutCork(), expected: "corked 0" },
  { name: 'stream Writable.end uncorks a corked stream, so the buffer is written and finish follows', run: () => streamSettle(writableEndWhileCorked()), expected: ["_write a","after end corked 0","finish"] },
  { name: 'stream Writable.setDefaultEncoding hex decodes a string write to a Buffer, passed with encoding buffer', run: () => streamSettle(writableSetDefaultEncodingHex()), expected: ["returns same true","_write hi buffer true"] },
  { name: 'stream Writable.setDefaultEncoding with decodeStrings false passes the string and its encoding', run: () => streamSettle(writableSetDefaultEncodingNoDecode()), expected: ["_write string 6869 hex"] },
  { name: 'stream Writable.setDefaultEncoding with an unknown encoding throws ERR_UNKNOWN_ENCODING', run: () => writableSetDefaultEncodingInvalid(), expected: "ERR_UNKNOWN_ENCODING" },
  { name: 'stream Writable: a backlog of two or more writes goes to _writev when it is defined, one write goes to _write', run: () => streamSettle(writableWritevBacklogNoCork()), expected: ["_write a","writev b,c"] },
  { name: 'stream Readable.setEncoding utf8: a character split across two pushes is emitted once, as a string', run: () => streamSettle(readableSetEncodingUtf8Split()), expected: ["data string é"] },
  { name: 'stream Readable.setEncoding returns the stream', run: () => readableSetEncodingReturnsThis(), expected: true },
  { name: 'stream Readable.setEncoding hex turns a pushed Buffer into a hex string', run: () => streamSettle(readableSetEncodingHexOnBuffer()), expected: ["data string 6869"] },
  { name: 'stream Readable.setEncoding converts data already buffered, and read returns it as a string', run: () => readableSetEncodingBuffered(), expected: "string 6869" },
  { name: 'stream Readable.setEncoding with an unknown encoding throws TypeError ERR_UNKNOWN_ENCODING', run: () => readableSetEncodingInvalid(), expected: "TypeError ERR_UNKNOWN_ENCODING Unknown encoding: bogus" },
  { name: 'stream Readable.setEncoding: read(n) counts characters, not bytes', run: () => readableReadNWithEncoding(), expected: ["string","hé","llo"] },
  { name: 'stream Readable.setEncoding base64: a partial group is held until its bytes arrive, and the rest is flushed at end', run: () => streamSettle(readableBase64Split()), expected: ["data AQID","data BAU="] },
  { name: 'stream Readable.unshift puts a chunk before buffered data', run: () => streamSettle(readableUnshiftFront()), expected: ["data a","data b"] },
  { name: 'stream Readable.unshift returns false only after the stream has ended', run: () => readableUnshiftReturns(), expected: [true,true,false,true] },
  { name: 'stream Readable.unshift with a hex string decodes it to bytes first', run: () => streamSettle(readableUnshiftHexString()), expected: ["data hi"] },
  { name: 'stream Readable.unshift before the end event: the chunk is readable after push(null)', run: () => readableUnshiftBeforeEndAllowed(), expected: "x" },
  { name: 'stream Readable.unshift after the end event emits ERR_STREAM_UNSHIFT_AFTER_END_EVENT', run: () => streamSettle(readableUnshiftAfterEndEmitted()), expected: ["ret false","error ERR_STREAM_UNSHIFT_AFTER_END_EVENT stream.unshift() after end event"] },
  { name: 'stream Readable.unshift of an empty chunk adds nothing', run: () => streamSettle(readableUnshiftEmptyChunk()), expected: ["data b"] },
  { name: 'stream Readable.unshift of a Buffer with setEncoding set is read as utf8 text, not decoded', run: () => streamSettle(readableUnshiftBufferWithEncoding()), expected: ["data string hi"] },
  { name: 'stream Readable.unshift of a string with setEncoding set is converted to the decoder encoding', run: () => streamSettle(readableUnshiftStringWithEncodingSet()), expected: ["data string 6869"] },
  { name: 'stream Readable.wrap: data from the old stream is pushed as Buffers, and its end ends the stream; wrap returns the stream', run: () => streamSettle(readableWrapData()), expected: ["returns same true","data object a","data object b","end"] },
  { name: 'stream Readable.wrap: an error on the old stream is emitted on the stream', run: () => streamSettle(readableWrapError()), expected: ["error boom"] },
  { name: 'stream Readable.wrap: a close on the old stream destroys the stream', run: () => streamSettle(readableWrapClose()), expected: ["r close","destroyed true"] },
  { name: 'stream Readable.wrap: a push that reaches the high-water mark pauses the old stream', run: () => streamSettle(readableWrapPausesWhenFull()), expected: ["old pause","pushed buffered 70000"] },
  { name: 'stream Readable.wrap: the first read after a pause resumes the old stream', run: () => streamSettle(readableWrapResumesOnRead()), expected: ["old pause","old resume","data 70000"] },
  { name: 'stream Readable.wrap: a small push does not pause the old stream', run: () => readableWrapSmallDoesNotPause(), expected: ["buffered 100"] },
  { name: 'stream Readable.wrap: the end is not emitted until the stream is read, then readableEnded is true', run: () => streamSettle(readableWrapEndWithoutConsumer()), expected: ["ended pending false","end"] },
  { name: 'stream Readable.wrap: function properties of the old stream are forwarded, values are not', run: () => readableWrapForwardsMethods(), expected: ["function","hi there","undefined"] },
  { name: 'stream Readable.wrap: class methods of the old stream are not forwarded (they are not enumerable)', run: () => readableWrapClassMethodsNotForwarded(), expected: "undefined" },
  { name: 'fs.promises.cp copies symbolic links as links, rewrites relative targets, and reports Node errors', run: () => cpLinkScenario(), expected: {
    fileLinkRelative: { type: 'link', target: 'ROOT/real.txt' },
    fileLinkAbsolute: { type: 'link', target: 'ROOT/real.txt' },
    danglingLink: { type: 'link', target: 'ROOT/missing.txt' },
    dirLinkNoRecursive: { type: 'link', target: 'ROOT/d' },
    dirLinkRecursive: { type: 'link', target: 'ROOT/d' },
    treeRecursive: { ln: { type: 'link', target: 'ROOT/tree/a.txt' }, up: { type: 'link', target: 'ROOT/tree/a.txt' }, dangling: { type: 'link', target: 'ROOT/tree/missing.txt' }, a: { type: 'file', text: 'A' } },
    fileLinkDereference: { type: 'file', text: 'REAL' },
    treeDereference: { error: 'ENOENT', message: "ENOENT: no such file or directory, stat 'ROOT/tree/dangling'" },
    overwriteExistingFile: { error: 'EEXIST', message: "EEXIST: file already exists, symlink 'ROOT/real.txt' -> 'ROOT/existing-file'" },
    overwriteExistingLink: { type: 'link', target: 'ROOT/real.txt' },
    linkParentMissing: { type: 'link', target: 'ROOT/real.txt' },
    plainFileParentMissing: { type: 'file', text: 'REAL' },
    dereferenceDanglingFile: { error: 'ENOENT', message: "ENOENT: no such file or directory, stat 'ROOT/dangling'" },
    dereferenceExistingLinkDest: { error: 'ERR_FS_CP_EINVAL', message: 'Invalid src or dest: cp returned EINVAL (src and dest cannot be the same) ROOT/ex-link' },
    linkIntoDirectory: { error: 'ERR_FS_CP_NON_DIR_TO_DIR', message: 'Cannot overwrite directory with non-directory: cp returned ENOTDIR (cannot overwrite directory ROOT/dd with non-directory ROOT/rel-link) ROOT/dd' },
    linkDereferenceIntoDirectory: { error: 'ERR_FS_CP_NON_DIR_TO_DIR', message: 'Cannot overwrite directory with non-directory: cp returned ENOTDIR (cannot overwrite directory ROOT/dd with non-directory ROOT/rel-link) ROOT/dd' },
    plainFileIntoDirectory: { error: 'ERR_FS_CP_NON_DIR_TO_DIR', message: 'Cannot overwrite directory with non-directory: cp returned ENOTDIR (cannot overwrite directory ROOT/dd with non-directory ROOT/real.txt) ROOT/dd' },
    directoryIntoFile: { error: 'ERR_FS_CP_DIR_TO_NON_DIR', message: 'Cannot overwrite non-directory with directory: cp returned EISDIR (cannot overwrite non-directory ROOT/plain with directory ROOT/src-d) ROOT/plain' },
    missingSource: { error: 'ENOENT', message: "ENOENT: no such file or directory, lstat 'ROOT/nope'" },
  } },
  { name: 'fs.promises scenario in a scratch directory', run: fsScenario, expected: {
    text: 'hello', bytes: 5, stat: [true, false, 5, 'number'], dirIsDir: true,
    entries: [['a.txt', true], ['x', false]], copied: true, removed: 'ENOENT',
    renamed: ['b.txt', 'x'], realpathEndsWith: true, truncated: 'he', afterUnlink: ['x'],
    missingRead: 'ENOENT', missingAccess: 'ENOENT', accessOk: 'ok', forceRmMissing: 'resolved',
    handleSize: 3, binary: [0, 1, 2, 255], afterRm: 'ENOENT',
  } },
  { name: 'stream Writable: sync writes, end callback before finish, then close', run: () => streamSettle(streamScenarios.writableSync()), expected: ["write a buffer","w1 true","write b buffer","w2 true","after end","endcb","finish","close"] },
  { name: 'stream Writable: async callbacks, next write starts before the previous callback runs', run: () => streamSettle(streamScenarios.writableAsync()), expected: ["write a","done a","write b","cb a","done b","cb b","finish","close"] },
  { name: 'stream Writable: write after end calls back and errors with ERR_STREAM_WRITE_AFTER_END', run: () => streamSettle(streamScenarios.writableAfterEnd()), expected: ["cb ERR_STREAM_WRITE_AFTER_END","error ERR_STREAM_WRITE_AFTER_END write after end","close"] },
  { name: 'stream Writable: a write error reaches the callback and the error event, then close', run: () => streamSettle(streamScenarios.writableError()), expected: ["cb boom","error boom","close"] },
  { name: 'stream Readable: sync pushes are emitted as data, then end, then close', run: () => streamSettle(streamScenarios.readableSyncPush()), expected: ["data a","data b","end","close"] },
  { name: 'stream Readable: an async push is emitted as data, then end, then close', run: () => streamSettle(streamScenarios.readableAsyncPush()), expected: ["data x","end","close"] },
  { name: 'stream Readable: pause before on(data) keeps the stream paused until resume', run: () => streamSettle(streamScenarios.readablePauseResume()), expected: ["paused true","after on","data a","end","close"] },
  { name: 'stream pipe: the source ends before the destination finishes, and the closes follow', run: () => streamSettle(streamScenarios.pipeReadableWritable()), expected: ["same true","write a","r end","w finish","r close","w close"] },
  { name: 'stream PassThrough: data is emitted during write, end comes before finish, and close is last', run: () => streamSettle(streamScenarios.passThrough()), expected: ["data x","data y","after end","end","finish","close"] },
  { name: 'stream pipeline: success calls back with undefined after the last close', run: () => streamSettle(streamScenarios.pipelineSuccess()), expected: ["write a","w finish","w close","cb undefined","resolved"] },
  { name: 'stream pipeline: a source error destroys the rest and calls back with the error', run: () => streamSettle(streamScenarios.pipelineError()), expected: ["w close","cb src boom"] },
  { name: 'stream Readable: destroy with an error emits error, then close', run: () => streamSettle(streamScenarios.readableDestroyError()), expected: ["error bye","close"] },
  { name: 'stream Readable: the default _read errors with ERR_METHOD_NOT_IMPLEMENTED', run: () => streamSettle(streamScenarios.readableDefaultRead()), expected: ["error ERR_METHOD_NOT_IMPLEMENTED The _read() method is not implemented","close"] },
  { name: 'stream Readable: push returns true below the 64 KiB highWaterMark and false after null', run: () => streamSettle(streamScenarios.pushReturnValues()), expected: [true,true,false] },
  { name: 'stream Writable: write returns true below the 64 KiB highWaterMark', run: () => streamSettle(streamScenarios.writeReturnValues()), expected: [true,true] },
  { name: 'fs.createReadStream: a small file emits open, ready, data, end, then close', run: () => streamSettle(streamScenarios.createReadSmall()), expected: ["open number","ready","data hello stream","end","close"] },
  { name: 'fs.createReadStream: a 150000-byte file is read in 65536-byte chunks', run: () => streamSettle(streamScenarios.createReadLarge()), expected: ["data 65536","data 65536","data 18928","end","close"] },
  { name: 'fs.createReadStream: a missing file emits the Node ENOENT error, then close', run: () => streamSettle(streamScenarios.createReadMissing()), expected: ["error ENOENT -2 open ENOENT: no such file or directory, open '/nonexistent-freddie-stream/missing.txt'","close"] },
  { name: 'StringDecoder latin1 whole matches Node', run: () => decoderParts('latin1', [17]), expected: ["héllo ð=Ø\u0000Þÿ",""] },
  { name: 'StringDecoder latin1 singles matches Node', run: () => decoderParts('latin1', Array(17).fill(1)), expected: ["h","é","l","l","o"," ","ð","","","","=","Ø","\u0000","Þ","","","ÿ",""] },
  { name: 'StringDecoder latin1 split12_5 matches Node', run: () => decoderParts('latin1', [12, 5]), expected: ["héllo ð=Ø","\u0000Þÿ",""] },
  { name: 'StringDecoder latin1 split11_6 matches Node', run: () => decoderParts('latin1', [11, 6]), expected: ["héllo ð=","Ø\u0000Þÿ",""] },
  { name: 'StringDecoder latin1 split3_14 matches Node', run: () => decoderParts('latin1', [3, 14]), expected: ["hél","lo ð=Ø\u0000Þÿ",""] },
  { name: 'StringDecoder ascii whole matches Node', run: () => decoderParts('ascii', [17]), expected: ["hillo p\u001f\u0018\u0000=X\u0000^\u0000",""] },
  { name: 'StringDecoder ascii singles matches Node', run: () => decoderParts('ascii', Array(17).fill(1)), expected: ["h","i","l","l","o"," ","p","\u001f","\u0018","\u0000","=","X","\u0000","^","","\u0000","",""] },
  { name: 'StringDecoder ascii split12_5 matches Node', run: () => decoderParts('ascii', [12, 5]), expected: ["hillo p\u001f\u0018\u0000=X","\u0000^\u0000",""] },
  { name: 'StringDecoder ascii split11_6 matches Node', run: () => decoderParts('ascii', [11, 6]), expected: ["hillo p\u001f\u0018\u0000=","X\u0000^\u0000",""] },
  { name: 'StringDecoder ascii split3_14 matches Node', run: () => decoderParts('ascii', [3, 14]), expected: ["hil","lo p\u001f\u0018\u0000=X\u0000^\u0000",""] },
  { name: 'StringDecoder hex whole matches Node', run: () => decoderParts('hex', [17]), expected: ["68e96c6c6f20f09f98803dd800de7f80ff",""] },
  { name: 'StringDecoder hex singles matches Node', run: () => decoderParts('hex', Array(17).fill(1)), expected: ["68","e9","6c","6c","6f","20","f0","9f","98","80","3d","d8","00","de","7f","80","ff",""] },
  { name: 'StringDecoder hex split12_5 matches Node', run: () => decoderParts('hex', [12, 5]), expected: ["68e96c6c6f20f09f98803dd8","00de7f80ff",""] },
  { name: 'StringDecoder hex split11_6 matches Node', run: () => decoderParts('hex', [11, 6]), expected: ["68e96c6c6f20f09f98803d","d800de7f80ff",""] },
  { name: 'StringDecoder hex split3_14 matches Node', run: () => decoderParts('hex', [3, 14]), expected: ["68e96c","6c6f20f09f98803dd800de7f80ff",""] },
  { name: 'StringDecoder base64 whole matches Node', run: () => decoderParts('base64', [17]), expected: ["aOlsbG8g8J+YgD3YAN5/","gP8="] },
  { name: 'StringDecoder base64 singles matches Node', run: () => decoderParts('base64', Array(17).fill(1)), expected: ["","","aOls","","","bG8g","","","8J+Y","","","gD3Y","","","AN5/","","","gP8="] },
  { name: 'StringDecoder base64 split12_5 matches Node', run: () => decoderParts('base64', [12, 5]), expected: ["aOlsbG8g8J+YgD3Y","AN5/","gP8="] },
  { name: 'StringDecoder base64 split11_6 matches Node', run: () => decoderParts('base64', [11, 6]), expected: ["aOlsbG8g8J+Y","gD3YAN5/","gP8="] },
  { name: 'StringDecoder base64 split3_14 matches Node', run: () => decoderParts('base64', [3, 14]), expected: ["aOls","bG8g8J+YgD3YAN5/","gP8="] },
  { name: 'StringDecoder base64url whole matches Node', run: () => decoderParts('base64url', [17]), expected: ["aOlsbG8g8J-YgD3YAN5_","gP8"] },
  { name: 'StringDecoder base64url singles matches Node', run: () => decoderParts('base64url', Array(17).fill(1)), expected: ["","","aOls","","","bG8g","","","8J-Y","","","gD3Y","","","AN5_","","","gP8"] },
  { name: 'StringDecoder base64url split12_5 matches Node', run: () => decoderParts('base64url', [12, 5]), expected: ["aOlsbG8g8J-YgD3Y","AN5_","gP8"] },
  { name: 'StringDecoder base64url split11_6 matches Node', run: () => decoderParts('base64url', [11, 6]), expected: ["aOlsbG8g8J-Y","gD3YAN5_","gP8"] },
  { name: 'StringDecoder base64url split3_14 matches Node', run: () => decoderParts('base64url', [3, 14]), expected: ["aOls","bG8g8J-YgD3YAN5_","gP8"] },
  { name: 'StringDecoder utf16le whole matches Node', run: () => decoderParts('utf16le', [17]), expected: ["汬⁯鿰肘😀聿",""] },
  { name: 'StringDecoder utf16le singles matches Node', run: () => decoderParts('utf16le', Array(17).fill(1)), expected: ["","","","汬","","⁯","","鿰","","肘","","\ud83d","","\ude00","","聿","",""] },
  { name: 'StringDecoder utf16le split12_5 matches Node', run: () => decoderParts('utf16le', [12, 5]), expected: ["汬⁯鿰肘","😀聿",""] },
  { name: 'StringDecoder utf16le split11_6 matches Node', run: () => decoderParts('utf16le', [11, 6]), expected: ["汬⁯鿰肘","😀聿",""] },
  { name: 'StringDecoder utf16le split3_14 matches Node', run: () => decoderParts('utf16le', [3, 14]), expected: ["","汬⁯鿰肘😀聿",""] },
  { name: 'StringDecoder binary whole matches Node', run: () => decoderParts('binary', [17]), expected: ["héllo ð=Ø\u0000Þÿ",""] },
  { name: 'StringDecoder binary singles matches Node', run: () => decoderParts('binary', Array(17).fill(1)), expected: ["h","é","l","l","o"," ","ð","","","","=","Ø","\u0000","Þ","","","ÿ",""] },
  { name: 'StringDecoder binary split12_5 matches Node', run: () => decoderParts('binary', [12, 5]), expected: ["héllo ð=Ø","\u0000Þÿ",""] },
  { name: 'StringDecoder binary split11_6 matches Node', run: () => decoderParts('binary', [11, 6]), expected: ["héllo ð=","Ø\u0000Þÿ",""] },
  { name: 'StringDecoder binary split3_14 matches Node', run: () => decoderParts('binary', [3, 14]), expected: ["hél","lo ð=Ø\u0000Þÿ",""] },
  { name: 'StringDecoder ucs2 whole matches Node', run: () => decoderParts('ucs2', [17]), expected: ["汬⁯鿰肘😀聿",""] },
  { name: 'StringDecoder ucs2 singles matches Node', run: () => decoderParts('ucs2', Array(17).fill(1)), expected: ["","","","汬","","⁯","","鿰","","肘","","\ud83d","","\ude00","","聿","",""] },
  { name: 'StringDecoder ucs2 split12_5 matches Node', run: () => decoderParts('ucs2', [12, 5]), expected: ["汬⁯鿰肘","😀聿",""] },
  { name: 'StringDecoder ucs2 split11_6 matches Node', run: () => decoderParts('ucs2', [11, 6]), expected: ["汬⁯鿰肘","😀聿",""] },
  { name: 'StringDecoder ucs2 split3_14 matches Node', run: () => decoderParts('ucs2', [3, 14]), expected: ["","汬⁯鿰肘😀聿",""] },
  { name: 'StringDecoder rejects an unknown encoding', run: () => new StringDecoder('bogus'), expected: 'threw: Unknown encoding: bogus' },
  { name: 'StringDecoder base64 end with only the bytes of a partial group', run: () => new StringDecoder('base64').end(Buffer.from('ab')), expected: "YWI=" },
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
  { name: 'zlib.gzip then gunzip round-trips a string', run: async () => (await zlibGunzip(await zlibGzip(Buffer.from('hello hello')))).toString(), expected: 'hello hello' },
  { name: 'zlib.gzip header bytes match Node (magic, deflate, zero mtime, XFL 0, OS 3)', run: async () => Array.from((await zlibGzip(Buffer.from('hello hello'))).subarray(0, 10)), expected: [31, 139, 8, 0, 0, 0, 0, 0, 0, 3] },
  { name: 'zlib.gzip trailer records the input length', run: async () => Array.from((await zlibGzip(Buffer.from('abc'))).subarray(-4)), expected: [3, 0, 0, 0] },
  { name: 'zlib.gzip of empty input gunzips to empty', run: async () => (await zlibGunzip(await zlibGzip(Buffer.alloc(0)))).length, expected: 0 },
  { name: 'zlib.gzip of 70000 bytes spans two stored blocks and round-trips', run: async () => (await zlibGunzip(await zlibGzip(Buffer.alloc(70000, 97)))).length, expected: 70000 },
  { name: 'zlib.gzip trailer records a length above 65535', run: async () => Array.from((await zlibGzip(Buffer.alloc(70000, 97))).subarray(-4)), expected: [112, 17, 1, 0] },
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
  { name: "crypto.createHash sha224 digest of empty", run: () => s.crypto.createHash('sha224').update('').digest('hex'), expected: "d14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f" },
  { name: "crypto.createHash sha224 digest of abc", run: () => s.crypto.createHash('sha224').update('abc').digest('hex'), expected: "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7" },
  { name: "crypto.createHash sha224 digest of long", run: () => s.crypto.createHash('sha224').update('a'.repeat(200)).digest('hex'), expected: "2559984fd15e055f0d84c346483508242f02653ab7956401e551511c" },
  { name: "crypto.createHash sha224 digest of non-ASCII", run: () => s.crypto.createHash('sha224').update('é'.repeat(70)).digest('hex'), expected: "379f6f360ab804dac04371bbe106328f16eef5f7864100839cfb5178" },
  { name: "crypto.createHash sha224 chunked updates like one update", run: () => s.crypto.createHash('sha224').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "2559984fd15e055f0d84c346483508242f02653ab7956401e551511c" },
  { name: "crypto.createHash sha224 default digest length", run: () => s.crypto.createHash('sha224').update('abc').digest().length, expected: 28 },
  { name: "crypto.createHash sha224 base64 digest of a Buffer", run: () => s.crypto.createHash('sha224').update(Buffer.from('abc')).digest('base64'), expected: "Iwl9IjQF2CKGQqR3vaJVsyqtvOS9oLP342ydpw==" },
  { name: "crypto.createHash sha384 digest of empty", run: () => s.crypto.createHash('sha384').update('').digest('hex'), expected: "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b" },
  { name: "crypto.createHash sha384 digest of abc", run: () => s.crypto.createHash('sha384').update('abc').digest('hex'), expected: "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7" },
  { name: "crypto.createHash sha384 digest of long", run: () => s.crypto.createHash('sha384').update('a'.repeat(200)).digest('hex'), expected: "0691b6e978614b67d60557b2a2cddd53406508522efa21c624dbbfa8ab6e726d5c586b489c7c09f24109a64c10211d48" },
  { name: "crypto.createHash sha384 digest of non-ASCII", run: () => s.crypto.createHash('sha384').update('é'.repeat(70)).digest('hex'), expected: "5c3461f2ad3c1de373d465f19790a2b763bff4e2209861de7b27d09ea822820c042cc63c321ad1477df2747297685642" },
  { name: "crypto.createHash sha384 chunked updates like one update", run: () => s.crypto.createHash('sha384').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "0691b6e978614b67d60557b2a2cddd53406508522efa21c624dbbfa8ab6e726d5c586b489c7c09f24109a64c10211d48" },
  { name: "crypto.createHash sha384 default digest length", run: () => s.crypto.createHash('sha384').update('abc').digest().length, expected: 48 },
  { name: "crypto.createHash sha384 base64 digest of a Buffer", run: () => s.crypto.createHash('sha384').update(Buffer.from('abc')).digest('base64'), expected: "ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn" },
  { name: "crypto.createHash sha512-224 digest of empty", run: () => s.crypto.createHash('sha512-224').update('').digest('hex'), expected: "6ed0dd02806fa89e25de060c19d3ac86cabb87d6a0ddd05c333b84f4" },
  { name: "crypto.createHash sha512-224 digest of abc", run: () => s.crypto.createHash('sha512-224').update('abc').digest('hex'), expected: "4634270f707b6a54daae7530460842e20e37ed265ceee9a43e8924aa" },
  { name: "crypto.createHash sha512-224 digest of long", run: () => s.crypto.createHash('sha512-224').update('a'.repeat(200)).digest('hex'), expected: "230fd37b82564b0c3b19d2cf19f91b297a4aca0124b4b691ccee1870" },
  { name: "crypto.createHash sha512-224 digest of non-ASCII", run: () => s.crypto.createHash('sha512-224').update('é'.repeat(70)).digest('hex'), expected: "f517862e0b1651e2e7681ef2e81189df2bbd9dcf985eb82ad6ea8b74" },
  { name: "crypto.createHash sha512-224 chunked updates like one update", run: () => s.crypto.createHash('sha512-224').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "230fd37b82564b0c3b19d2cf19f91b297a4aca0124b4b691ccee1870" },
  { name: "crypto.createHash sha512-224 default digest length", run: () => s.crypto.createHash('sha512-224').update('abc').digest().length, expected: 28 },
  { name: "crypto.createHash sha512-224 base64 digest of a Buffer", run: () => s.crypto.createHash('sha512-224').update(Buffer.from('abc')).digest('base64'), expected: "RjQnD3B7alTarnUwRghC4g437SZc7umkPokkqg==" },
  { name: "crypto.createHash sha512-256 digest of empty", run: () => s.crypto.createHash('sha512-256').update('').digest('hex'), expected: "c672b8d1ef56ed28ab87c3622c5114069bdd3ad7b8f9737498d0c01ecef0967a" },
  { name: "crypto.createHash sha512-256 digest of abc", run: () => s.crypto.createHash('sha512-256').update('abc').digest('hex'), expected: "53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23" },
  { name: "crypto.createHash sha512-256 digest of long", run: () => s.crypto.createHash('sha512-256').update('a'.repeat(200)).digest('hex'), expected: "19b1e37317d7fd3d7651f397005e31f154ef4912d1345743d2d5889aaca28996" },
  { name: "crypto.createHash sha512-256 digest of non-ASCII", run: () => s.crypto.createHash('sha512-256').update('é'.repeat(70)).digest('hex'), expected: "0e07ff0ef7b75d74a063f560b08d4e471dadd7cb71d463249929fabf58fd394c" },
  { name: "crypto.createHash sha512-256 chunked updates like one update", run: () => s.crypto.createHash('sha512-256').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "19b1e37317d7fd3d7651f397005e31f154ef4912d1345743d2d5889aaca28996" },
  { name: "crypto.createHash sha512-256 default digest length", run: () => s.crypto.createHash('sha512-256').update('abc').digest().length, expected: 32 },
  { name: "crypto.createHash sha512-256 base64 digest of a Buffer", run: () => s.crypto.createHash('sha512-256').update(Buffer.from('abc')).digest('base64'), expected: "UwSOJoGUHvmbLim3a0x9q+TC0MY0/G1G4OLxMQfnryM=" },
  { name: "crypto.createHash sha3-224 digest of empty", run: () => s.crypto.createHash('sha3-224').update('').digest('hex'), expected: "6b4e03423667dbb73b6e15454f0eb1abd4597f9a1b078e3f5b5a6bc7" },
  { name: "crypto.createHash sha3-224 digest of abc", run: () => s.crypto.createHash('sha3-224').update('abc').digest('hex'), expected: "e642824c3f8cf24ad09234ee7d3c766fc9a3a5168d0c94ad73b46fdf" },
  { name: "crypto.createHash sha3-224 digest of long", run: () => s.crypto.createHash('sha3-224').update('a'.repeat(200)).digest('hex'), expected: "455e0ccfc6010738ed93a793dffd79aff36debbd1a7eb6621bd6c722" },
  { name: "crypto.createHash sha3-224 digest of non-ASCII", run: () => s.crypto.createHash('sha3-224').update('é'.repeat(70)).digest('hex'), expected: "31c2265dc1e4c3a1fac6543ff1c21786fa95b319f7d770e418f22493" },
  { name: "crypto.createHash sha3-224 chunked updates like one update", run: () => s.crypto.createHash('sha3-224').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "455e0ccfc6010738ed93a793dffd79aff36debbd1a7eb6621bd6c722" },
  { name: "crypto.createHash sha3-224 default digest length", run: () => s.crypto.createHash('sha3-224').update('abc').digest().length, expected: 28 },
  { name: "crypto.createHash sha3-224 base64 digest of a Buffer", run: () => s.crypto.createHash('sha3-224').update(Buffer.from('abc')).digest('base64'), expected: "5kKCTD+M8krQkjTufTx2b8mjpRaNDJStc7Rv3w==" },
  { name: "crypto.createHash sha3-256 digest of empty", run: () => s.crypto.createHash('sha3-256').update('').digest('hex'), expected: "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a" },
  { name: "crypto.createHash sha3-256 digest of abc", run: () => s.crypto.createHash('sha3-256').update('abc').digest('hex'), expected: "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532" },
  { name: "crypto.createHash sha3-256 digest of long", run: () => s.crypto.createHash('sha3-256').update('a'.repeat(200)).digest('hex'), expected: "cce34485baf2bf2aca99b94833892a4f52896d3d153f7b840cc4f9fe695f1387" },
  { name: "crypto.createHash sha3-256 digest of non-ASCII", run: () => s.crypto.createHash('sha3-256').update('é'.repeat(70)).digest('hex'), expected: "cfcdf7c4ecd55d998da753d2318d1b19f08665db7cc22b2fac4e7deb4a3c1fe8" },
  { name: "crypto.createHash sha3-256 chunked updates like one update", run: () => s.crypto.createHash('sha3-256').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "cce34485baf2bf2aca99b94833892a4f52896d3d153f7b840cc4f9fe695f1387" },
  { name: "crypto.createHash sha3-256 default digest length", run: () => s.crypto.createHash('sha3-256').update('abc').digest().length, expected: 32 },
  { name: "crypto.createHash sha3-256 base64 digest of a Buffer", run: () => s.crypto.createHash('sha3-256').update(Buffer.from('abc')).digest('base64'), expected: "Ophdp0/iJbIEXBcta9OQvYVfCG4+nVJbRr/iRRFDFTI=" },
  { name: "crypto.createHash sha3-384 digest of empty", run: () => s.crypto.createHash('sha3-384').update('').digest('hex'), expected: "0c63a75b845e4f7d01107d852e4c2485c51a50aaaa94fc61995e71bbee983a2ac3713831264adb47fb6bd1e058d5f004" },
  { name: "crypto.createHash sha3-384 digest of abc", run: () => s.crypto.createHash('sha3-384').update('abc').digest('hex'), expected: "ec01498288516fc926459f58e2c6ad8df9b473cb0fc08c2596da7cf0e49be4b298d88cea927ac7f539f1edf228376d25" },
  { name: "crypto.createHash sha3-384 digest of long", run: () => s.crypto.createHash('sha3-384').update('a'.repeat(200)).digest('hex'), expected: "f97756776c1874724c94a8008f7f155553b4bf00fbf8fbeac246624ad59c258a3c0977d9f2543d7cbd75b9ac8fdc0d40" },
  { name: "crypto.createHash sha3-384 digest of non-ASCII", run: () => s.crypto.createHash('sha3-384').update('é'.repeat(70)).digest('hex'), expected: "b182e3c65a361e62c76b79e067bd391480b8c5af9670a3aa7b07305dabc5346b9dae474491e255cbc6a031e15acef85f" },
  { name: "crypto.createHash sha3-384 chunked updates like one update", run: () => s.crypto.createHash('sha3-384').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "f97756776c1874724c94a8008f7f155553b4bf00fbf8fbeac246624ad59c258a3c0977d9f2543d7cbd75b9ac8fdc0d40" },
  { name: "crypto.createHash sha3-384 default digest length", run: () => s.crypto.createHash('sha3-384').update('abc').digest().length, expected: 48 },
  { name: "crypto.createHash sha3-384 base64 digest of a Buffer", run: () => s.crypto.createHash('sha3-384').update(Buffer.from('abc')).digest('base64'), expected: "7AFJgohRb8kmRZ9Y4satjfm0c8sPwIwlltp88OSb5LKY2IzqknrH9Tnx7fIoN20l" },
  { name: "crypto.createHash sha3-512 digest of empty", run: () => s.crypto.createHash('sha3-512').update('').digest('hex'), expected: "a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a615b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26" },
  { name: "crypto.createHash sha3-512 digest of abc", run: () => s.crypto.createHash('sha3-512').update('abc').digest('hex'), expected: "b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0" },
  { name: "crypto.createHash sha3-512 digest of long", run: () => s.crypto.createHash('sha3-512').update('a'.repeat(200)).digest('hex'), expected: "eae6c85c6904f11075de9f9d5e1064371d000510fa3d2d79d40cf9be34892fb01859d0a0234e138bcb0ad5c84f6c0dca226a414b0c9a2897cb695f5185fe36ec" },
  { name: "crypto.createHash sha3-512 digest of non-ASCII", run: () => s.crypto.createHash('sha3-512').update('é'.repeat(70)).digest('hex'), expected: "616c728d09a6cd38ed4117e6259e4c1f9fd515940587c2e8eaa4526b8f1ce1719306577d54b91aad841417a10702f27c82eed9a1c005561455c5f9ed1023ab10" },
  { name: "crypto.createHash sha3-512 chunked updates like one update", run: () => s.crypto.createHash('sha3-512').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "eae6c85c6904f11075de9f9d5e1064371d000510fa3d2d79d40cf9be34892fb01859d0a0234e138bcb0ad5c84f6c0dca226a414b0c9a2897cb695f5185fe36ec" },
  { name: "crypto.createHash sha3-512 default digest length", run: () => s.crypto.createHash('sha3-512').update('abc').digest().length, expected: 64 },
  { name: "crypto.createHash sha3-512 base64 digest of a Buffer", run: () => s.crypto.createHash('sha3-512').update(Buffer.from('abc')).digest('base64'), expected: "t1GFCxpXFopWk82SS2sJbgj2IYJ0RPcNiE9dAkDScS4Q4RbpGSrzyRp+xXZH45NAVzQLTPQI1aVlkvgnTuxT8A==" },
  { name: "crypto.createHash shake128 digest of empty", run: () => s.crypto.createHash('shake128').update('').digest('hex'), expected: "7f9c2ba4e88f827d616045507605853e" },
  { name: "crypto.createHash shake128 digest of abc", run: () => s.crypto.createHash('shake128').update('abc').digest('hex'), expected: "5881092dd818bf5cf8a3ddb793fbcba7" },
  { name: "crypto.createHash shake128 digest of long", run: () => s.crypto.createHash('shake128').update('a'.repeat(200)).digest('hex'), expected: "70ac9b97e891be583e08929ce4cce50d" },
  { name: "crypto.createHash shake128 digest of non-ASCII", run: () => s.crypto.createHash('shake128').update('é'.repeat(70)).digest('hex'), expected: "613034c56a933c388fe4793e5e3c3aae" },
  { name: "crypto.createHash shake128 chunked updates like one update", run: () => s.crypto.createHash('shake128').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "70ac9b97e891be583e08929ce4cce50d" },
  { name: "crypto.createHash shake128 default digest length", run: () => s.crypto.createHash('shake128').update('abc').digest().length, expected: 16 },
  { name: "crypto.createHash shake128 base64 digest of a Buffer", run: () => s.crypto.createHash('shake128').update(Buffer.from('abc')).digest('base64'), expected: "WIEJLdgYv1z4o923k/vLpw==" },
  { name: "crypto.createHash shake256 digest of empty", run: () => s.crypto.createHash('shake256').update('').digest('hex'), expected: "46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762f" },
  { name: "crypto.createHash shake256 digest of abc", run: () => s.crypto.createHash('shake256').update('abc').digest('hex'), expected: "483366601360a8771c6863080cc4114d8db44530f8f1e1ee4f94ea37e78b5739" },
  { name: "crypto.createHash shake256 digest of long", run: () => s.crypto.createHash('shake256').update('a'.repeat(200)).digest('hex'), expected: "e49647491c9d12d125a2f75826c96f6307d2fabebcbb9fb1616d76b09499380e" },
  { name: "crypto.createHash shake256 digest of non-ASCII", run: () => s.crypto.createHash('shake256').update('é'.repeat(70)).digest('hex'), expected: "431e7a7d4e86c7fac6d886325b3dd8f90b79bb7c352bdbe0cf66864a7b96a879" },
  { name: "crypto.createHash shake256 chunked updates like one update", run: () => s.crypto.createHash('shake256').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "e49647491c9d12d125a2f75826c96f6307d2fabebcbb9fb1616d76b09499380e" },
  { name: "crypto.createHash shake256 default digest length", run: () => s.crypto.createHash('shake256').update('abc').digest().length, expected: 32 },
  { name: "crypto.createHash shake256 base64 digest of a Buffer", run: () => s.crypto.createHash('shake256').update(Buffer.from('abc')).digest('base64'), expected: "SDNmYBNgqHccaGMIDMQRTY20RTD48eHuT5TqN+eLVzk=" },
  { name: "crypto.createHash ripemd160 digest of empty", run: () => s.crypto.createHash('ripemd160').update('').digest('hex'), expected: "9c1185a5c5e9fc54612808977ee8f548b2258d31" },
  { name: "crypto.createHash ripemd160 digest of abc", run: () => s.crypto.createHash('ripemd160').update('abc').digest('hex'), expected: "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc" },
  { name: "crypto.createHash ripemd160 digest of long", run: () => s.crypto.createHash('ripemd160').update('a'.repeat(200)).digest('hex'), expected: "2a5b424394c0fce2665d4e0b077e998d2d62160a" },
  { name: "crypto.createHash ripemd160 digest of non-ASCII", run: () => s.crypto.createHash('ripemd160').update('é'.repeat(70)).digest('hex'), expected: "7ff36968da3bc7cf60061826228697e4653fa586" },
  { name: "crypto.createHash ripemd160 digest of an exact block", run: () => s.crypto.createHash('ripemd160').update('a'.repeat(128)).digest('hex'), expected: "8dfdfb32b2ed5cb41a73478b4fd60cc5b4648b15" },
  { name: "crypto.createHash ripemd160 chunked updates like one update", run: () => s.crypto.createHash('ripemd160').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "2a5b424394c0fce2665d4e0b077e998d2d62160a" },
  { name: "crypto.createHash ripemd160 default digest length", run: () => s.crypto.createHash('ripemd160').update('abc').digest().length, expected: 20 },
  { name: "crypto.createHash ripemd160 base64 digest of a Buffer", run: () => s.crypto.createHash('ripemd160').update(Buffer.from('abc')).digest('base64'), expected: "jrII9+BdmHqbBEqOmMawh/FaC/w=" },
  { name: "crypto.createHash blake2b512 digest of empty", run: () => s.crypto.createHash('blake2b512').update('').digest('hex'), expected: "786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce" },
  { name: "crypto.createHash blake2b512 digest of abc", run: () => s.crypto.createHash('blake2b512').update('abc').digest('hex'), expected: "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923" },
  { name: "crypto.createHash blake2b512 digest of long", run: () => s.crypto.createHash('blake2b512').update('a'.repeat(200)).digest('hex'), expected: "932355851d75f09c18646a9da87c25e055bc57f113121ad1ec63d45e7a1d62ab9133f8b7d1d7de9e0afa784eb6a8a11d78683013d0a672611f17668d9577d209" },
  { name: "crypto.createHash blake2b512 digest of non-ASCII", run: () => s.crypto.createHash('blake2b512').update('é'.repeat(70)).digest('hex'), expected: "26ce5af6e6ebcb271ec3a70cc3a8d7689fe0ee6ff4a8a75b8bf909920d4e39981a915ae4192bec6ad6a4bc426f03415fac1828f1d9c13594eb8c7feb8fb726af" },
  { name: "crypto.createHash blake2b512 digest of an exact block", run: () => s.crypto.createHash('blake2b512').update('a'.repeat(128)).digest('hex'), expected: "fc6c71f688f43ea7d60817478808f3cac753e61571865c95adbc2d9122c943a76b92c2cb1047ef3fe7bf6e436ec1d0a99a9e5b216780bf7fed9d7ca91d3a8f3b" },
  { name: "crypto.createHash blake2b512 chunked updates like one update", run: () => s.crypto.createHash('blake2b512').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "932355851d75f09c18646a9da87c25e055bc57f113121ad1ec63d45e7a1d62ab9133f8b7d1d7de9e0afa784eb6a8a11d78683013d0a672611f17668d9577d209" },
  { name: "crypto.createHash blake2b512 default digest length", run: () => s.crypto.createHash('blake2b512').update('abc').digest().length, expected: 64 },
  { name: "crypto.createHash blake2b512 base64 digest of a Buffer", run: () => s.crypto.createHash('blake2b512').update(Buffer.from('abc')).digest('base64'), expected: "uoClP5gcTQ1qJ5e2nxL26UwhLxRoWsS3SxK7b9v/otF9h8U5Kqt5LcJS1d5FM8yVGNOKqNvxklq5I4bt1ACZIw==" },
  { name: "crypto.createHash blake2s256 digest of empty", run: () => s.crypto.createHash('blake2s256').update('').digest('hex'), expected: "69217a3079908094e11121d042354a7c1f55b6482ca1a51e1b250dfd1ed0eef9" },
  { name: "crypto.createHash blake2s256 digest of abc", run: () => s.crypto.createHash('blake2s256').update('abc').digest('hex'), expected: "508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982" },
  { name: "crypto.createHash blake2s256 digest of long", run: () => s.crypto.createHash('blake2s256').update('a'.repeat(200)).digest('hex'), expected: "2b033f9f5ba9cf20671da79e492f41545e673b562603945ffed09662fd92321a" },
  { name: "crypto.createHash blake2s256 digest of non-ASCII", run: () => s.crypto.createHash('blake2s256').update('é'.repeat(70)).digest('hex'), expected: "8e634ae984ae46c507aeec671784f32a10d27d38bba19a325c73172ad3e20db7" },
  { name: "crypto.createHash blake2s256 digest of an exact block", run: () => s.crypto.createHash('blake2s256').update('a'.repeat(128)).digest('hex'), expected: "3ac477e27353f9019b81694afe60c8049403784f91a58288428ea318bfa82809" },
  { name: "crypto.createHash blake2s256 chunked updates like one update", run: () => s.crypto.createHash('blake2s256').update('a'.repeat(100)).update('a'.repeat(100)).digest('hex'), expected: "2b033f9f5ba9cf20671da79e492f41545e673b562603945ffed09662fd92321a" },
  { name: "crypto.createHash blake2s256 default digest length", run: () => s.crypto.createHash('blake2s256').update('abc').digest().length, expected: 32 },
  { name: "crypto.createHash blake2s256 base64 digest of a Buffer", run: () => s.crypto.createHash('blake2s256').update(Buffer.from('abc')).digest('base64'), expected: "UIxejDJ8FOLhpyujTutFLzdFiyCe1jopTZmbTIZnWYI=" },
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

const execText = (value) => (typeof value === 'string' ? value : 'buffer:' + value.toString('hex'))

const execOutcome = (file, args, options) => new Promise((resolve) => {
  s['child-process'].execFile(file, args, options ?? {}, (error, stdout, stderr) => resolve({
    code: error?.code ?? null,
    signal: error?.signal ?? null,
    killed: error?.killed ?? null,
    cmd: error?.cmd ?? null,
    message: error?.message ?? null,
    stdout: execText(stdout),
    stderr: execText(stderr),
  }))
})

const callbackOrder = () => new Promise((resolve) => {
  const order = []
  s['child-process'].execFile('sh', ['-c', 'exit 0'], () => { order.push('callback'); resolve(order) })
  order.push('sync')
})

sharedCases.push(
  { name: "child-process.execFile captures stdout and stderr", run: () => execOutcome('sh', ['-c', 'printf out; printf err >&2']), expected: {"code":null,"signal":null,"killed":null,"cmd":null,"message":null,"stdout":"out","stderr":"err"} },
  { name: "child-process.execFile reports a nonzero exit as Node reports it", run: () => execOutcome('sh', ['-c', 'printf out; printf err >&2; exit 3']), expected: {"code":3,"signal":null,"killed":false,"cmd":"sh -c printf out; printf err >&2; exit 3","message":"Command failed: sh -c printf out; printf err >&2; exit 3\nerr","stdout":"out","stderr":"err"} },
  { name: "child-process.execFile returns a Buffer for encoding buffer", run: () => execOutcome('sh', ['-c', 'printf hi'], { encoding: 'buffer' }), expected: {"code":null,"signal":null,"killed":null,"cmd":null,"message":null,"stdout":"buffer:6869","stderr":"buffer:"} },
  { name: 'child-process.execFile reports a SIGTERM termination', run: () => execOutcome('sh', ['-c', 'kill -TERM $$']), expected: {"code":null,"signal":"SIGTERM","killed":false,"cmd":"sh -c kill -TERM $$","message":"Command failed: sh -c kill -TERM $$\n","stdout":"","stderr":""} },
  { name: 'child-process.execFile keeps partial stdout on a SIGKILL termination', run: () => execOutcome('sh', ['-c', 'printf partial; kill -KILL $$']), expected: {"code":null,"signal":"SIGKILL","killed":false,"cmd":"sh -c printf partial; kill -KILL $$","message":"Command failed: sh -c printf partial; kill -KILL $$\n","stdout":"partial","stderr":""} },
  { name: "child-process.execFile succeeds with empty output for an empty command", run: () => execOutcome('sh', ['-c', '']), expected: {"code":null,"signal":null,"killed":null,"cmd":null,"message":null,"stdout":"","stderr":""} },
  { name: "child-process.execFile reports a missing command with ENOENT", run: () => execOutcome('no-such-command-xyz', []), expected: {"code":"ENOENT","signal":null,"killed":null,"cmd":"no-such-command-xyz","message":"spawn no-such-command-xyz ENOENT","stdout":"","stderr":""} },
  { name: "child-process.execFile calls back after the synchronous code", run: () => callbackOrder(), expected: ["sync","callback"] },
  { name: "child-process.execFile option cwd sets the working directory", run: () => execOutcome('sh', ['-c', 'pwd'], { cwd: '/' }), expected: {"code":null,"signal":null,"killed":null,"cmd":null,"message":null,"stdout":"/\n","stderr":""} },
  { name: "child-process.execFile option cwd runs the command in a directory it names", run: async () => { const dir = await fsp.mkdtemp('/tmp/cwd-'); await fsp.writeFile(dir + '/marker.txt', 'found\n'); return execOutcome('sh', ['-c', 'cat marker.txt'], { cwd: dir }) }, expected: {"code":null,"signal":null,"killed":null,"cmd":null,"message":null,"stdout":"found\n","stderr":""} },
  { name: "child-process.execFile option cwd of a relative path is the current directory", run: () => execOutcome('sh', ['-c', 'pwd'], { cwd: '.' }).then((o) => o.stdout === proc.cwd() + '\n'), expected: true },
  { name: "child-process.execFile option cwd missing reports ENOENT through the callback", run: () => execOutcome('sh', ['-c', 'pwd'], { cwd: '/no-such-dir-freddie-xyz' }), expected: {"code":"ENOENT","signal":null,"killed":null,"cmd":"sh -c pwd","message":"spawn sh ENOENT","stdout":"","stderr":""} },
  { name: "child-process.execFile option cwd that is a file throws ENOTDIR synchronously", run: () => { try { s['child-process'].execFile('sh', ['-c', 'pwd'], { cwd: '/etc/hostname' }, () => {}); return 'no throw' } catch (error) { return { code: error.code, message: error.message, syscall: error.syscall } } }, expected: {"code":"ENOTDIR","message":"spawn ENOTDIR","syscall":"spawn"} },
  { name: "child-process.execFile option cwd undefined uses the current directory", run: () => execOutcome('sh', ['-c', 'pwd'], { cwd: undefined }).then((o) => o.stdout === proc.cwd() + '\n'), expected: true },
  { name: 'child-process.execFile runs without a callback and returns', run: () => { s['child-process'].execFile('sh', ['-c', 'exit 0']); return 'returned' }, expected: 'returned' },
)

const spawnOutcome = (file, args, options, step) => new Promise((resolve) => {
  const child = s['child-process'].spawn(file, args, options ?? {})
  const events = []
  child.on('spawn', () => { events.push('spawn'); if (step) events.push(['step', step(child)]) })
  child.on('exit', (code, signal) => events.push(['exit', code, signal]))
  child.on('error', (error) => events.push(['error', error.code, error.message]))
  child.on('close', (code, signal) => resolve({ events, code, signal }))
})

const killStep = (child) => [child.kill('SIGTERM'), child.killed]
const pidStep = (child) => typeof child.pid

const pipeOutcome = (which, file, args, options, encoding) => new Promise((resolve) => {
  const child = s['child-process'].spawn(file, args, options ?? {})
  const chunks = []
  const order = []
  if (encoding !== undefined) child[which].setEncoding(encoding)
  child[which].on('data', (chunk) => chunks.push(chunk))
  child[which].on('end', () => order.push('end'))
  child.on('close', (code, signal) => {
    order.push('close')
    resolve({
      code,
      signal,
      text: encoding === undefined ? Buffer.concat(chunks).toString() : chunks.join(''),
      chunkTypes: [...new Set(chunks.map((chunk) => typeof chunk))],
      allBuffers: chunks.every((chunk) => Buffer.isBuffer(chunk)),
      endBeforeClose: order.join() === 'end,close',
      readable: child[which] instanceof s.stream.Readable,
    })
  })
})

const stdoutOutcome = (file, args, options, encoding) => pipeOutcome('stdout', file, args, options, encoding)
const stderrOutcome = (file, args, options, encoding) => pipeOutcome('stderr', file, args, options, encoding)

const pipesOutcome = (file, args, attach) => new Promise((resolve) => {
  const child = s['child-process'].spawn(file, args)
  const collected = { stdout: null, stderr: null }
  const order = []
  for (const which of attach) {
    const chunks = []
    collected[which] = chunks
    child[which].on('data', (chunk) => chunks.push(chunk))
    child[which].on('end', () => order.push(which + ' end'))
  }
  child.on('close', (code, signal) => {
    order.push('close')
    resolve({
      code,
      signal,
      stdout: collected.stdout && Buffer.concat(collected.stdout).toString(),
      stderr: collected.stderr && Buffer.concat(collected.stderr).toString(),
      endBeforeClose: attach.every((which) => order.indexOf(which + ' end') >= 0 && order.indexOf(which + ' end') < order.indexOf('close')),
    })
  })
})

const spawnErrorOutcome = (file, args, options) => new Promise((resolve) => {
  const child = s['child-process'].spawn(file, args, options ?? {})
  const events = []
  child.on('spawn', () => events.push('spawn'))
  child.on('error', (error) => events.push(['error', error.code, error.message, error.syscall, error.path, error.spawnargs]))
  child.on('close', (code, signal) => resolve({ events, code, signal, pid: typeof child.pid }))
})

const lateRead = (which) => new Promise((resolve, reject) => {
  const script = which === 'stdout' ? 'printf late' : 'printf late >&2'
  const child = s['child-process'].spawn('sh', ['-c', script])
  child.on('close', () => setTimeout(() => {
    try {
      const late = []
      child[which].on('data', (chunk) => late.push(chunk))
      setTimeout(() => resolve(Buffer.concat(late).toString()), 300)
    } catch (error) {
      reject(error)
    }
  }, 200))
})

const lateStdoutRead = () => lateRead('stdout')
const lateStderrRead = () => lateRead('stderr')

sharedCases.push(
  { name: "child-process.spawn reports exit then close with the exit code", run: () => spawnOutcome('sh', ['-c', 'exit 3']), expected: {"events":["spawn",["exit",3,null]],"code":3,"signal":null} },
  { name: "child-process.spawn kills with SIGTERM after it starts", run: () => spawnOutcome('sh', ['-c', 'exec sleep 5'], undefined, killStep), expected: {"events":["spawn",["step",[true,true]],["exit",null,"SIGTERM"]],"code":null,"signal":"SIGTERM"} },
  { name: "child-process.spawn reports a missing command with error then close", run: () => spawnOutcome('no-such-command-xyz', []), expected: {"events":[["error","ENOENT","spawn no-such-command-xyz ENOENT"]],"code":-2,"signal":null} },
  { name: "child-process.spawn exposes a numeric pid after the spawn event", run: () => spawnOutcome('sh', ['-c', 'exit 0'], undefined, pidStep), expected: {"events":["spawn",["step","number"],["exit",0,null]],"code":0,"signal":null} },
  { name: "child-process.spawn kill before the spawn event returns true", run: () => s['child-process'].spawn('sh', ['-c', 'exec sleep 1']).kill('SIGTERM'), expected: true },
  { name: "child-process.spawn pid is a number before the spawn event", run: () => typeof s['child-process'].spawn('sh', ['-c', 'exit 0']).pid, expected: "number" },
  { name: "child-process.spawn stdout is a declared gap", run: () => typeof s['child-process'].spawn('sh', ['-c', 'exit 0']).stdout, expected: "object" },
  { name: "child-process.spawn option cwd sets the working directory", run: () => streamSettle(stdoutOutcome('sh', ['-c', 'pwd'], { cwd: '/' })), expected: {"code":0,"signal":null,"text":"/\n","chunkTypes":["object"],"allBuffers":true,"endBeforeClose":true,"readable":true} },
  { name: "child-process.spawn option cwd runs the command in a directory it names", run: async () => { const dir = await fsp.mkdtemp('/tmp/cwd-'); await fsp.writeFile(dir + '/marker.txt', 'found\n'); return streamSettle(stdoutOutcome('sh', ['-c', 'cat marker.txt'], { cwd: dir })) }, expected: {"code":0,"signal":null,"text":"found\n","chunkTypes":["object"],"allBuffers":true,"endBeforeClose":true,"readable":true} },
  { name: "child-process.spawn option cwd of a relative path is the current directory", run: () => streamSettle(stdoutOutcome('sh', ['-c', 'pwd'], { cwd: '.' })).then((o) => o.text === proc.cwd() + '\n'), expected: true },
  { name: "child-process.spawn option cwd missing reports an ENOENT error and no spawn event", run: () => streamSettle(spawnErrorOutcome('sh', ['-c', 'pwd'], { cwd: '/no-such-dir-freddie-xyz' })), expected: {"events":[["error","ENOENT","spawn sh ENOENT","spawn sh","sh",["-c","pwd"]]],"code":-2,"signal":null,"pid":"undefined"} },
  { name: "child-process.spawn option cwd that is a file throws ENOTDIR synchronously", run: () => { try { s['child-process'].spawn('sh', ['-c', 'pwd'], { cwd: '/etc/hostname' }); return 'no throw' } catch (error) { return { code: error.code, message: error.message, syscall: error.syscall } } }, expected: {"code":"ENOTDIR","message":"spawn ENOTDIR","syscall":"spawn"} },
  { name: "child-process.spawn option cwd undefined uses the current directory", run: () => streamSettle(stdoutOutcome('sh', ['-c', 'pwd'], { cwd: undefined })).then((o) => o.text === proc.cwd() + '\n'), expected: true },
)

sharedCases.push(
  { name: "child-process.spawn stdout carries Buffer chunks and ends before close", run: () => streamSettle(stdoutOutcome('sh', ['-c', 'printf hi'])), expected: {"code":0,"signal":null,"text":"hi","chunkTypes":["object"],"allBuffers":true,"endBeforeClose":true,"readable":true} },
  { name: "child-process.spawn stdout delivers 70000 bytes across chunks before close", run: () => streamSettle(stdoutOutcome('sh', ['-c', 'head -c 70000 /dev/zero']).then(({ text, ...rest }) => ({ ...rest, length: text.length }))), expected: {"code":0,"signal":null,"chunkTypes":["object"],"allBuffers":true,"endBeforeClose":true,"readable":true,"length":70000} },
  { name: "child-process.spawn stdout setEncoding utf8 yields strings", run: () => streamSettle(stdoutOutcome('sh', ['-c', 'printf "h\\303\\251"'], undefined, 'utf8')), expected: {"code":0,"signal":null,"text":"hé","chunkTypes":["string"],"allBuffers":false,"endBeforeClose":true,"readable":true} },
  { name: "child-process.spawn stdout keeps output before a nonzero exit code", run: () => streamSettle(stdoutOutcome('sh', ['-c', 'printf out; exit 3'])), expected: {"code":3,"signal":null,"text":"out","chunkTypes":["object"],"allBuffers":true,"endBeforeClose":true,"readable":true} },
  { name: "child-process.spawn closes without a stdout read and discards 70000 bytes", run: () => streamSettle(spawnOutcome('sh', ['-c', 'head -c 70000 /dev/zero'])), expected: {"events":["spawn",["exit",0,null]],"code":0,"signal":null} },
  { name: "child-process.spawn stdout read after close is empty", run: () => streamSettle(lateStdoutRead()), expected: "" },
  { name: "child-process.spawn stdout is the same Readable on each access", run: () => { const child = s['child-process'].spawn('sh', ['-c', 'exit 0']); return child.stdout === child.stdout }, expected: true },
)

sharedCases.push(
  { name: "child-process.spawn stderr carries Buffer chunks and ends before close", run: () => streamSettle(stderrOutcome('sh', ['-c', 'printf err >&2'])), expected: {"code":0,"signal":null,"text":"err","chunkTypes":["object"],"allBuffers":true,"endBeforeClose":true,"readable":true} },
  { name: "child-process.spawn stderr delivers 70000 bytes across chunks before close", run: () => streamSettle(stderrOutcome('sh', ['-c', 'head -c 70000 /dev/zero >&2']).then(({ text, ...rest }) => ({ ...rest, length: text.length }))), expected: {"code":0,"signal":null,"chunkTypes":["object"],"allBuffers":true,"endBeforeClose":true,"readable":true,"length":70000} },
  { name: "child-process.spawn stderr setEncoding utf8 yields strings", run: () => streamSettle(stderrOutcome('sh', ['-c', 'printf "h\\303\\251" >&2'], undefined, 'utf8')), expected: {"code":0,"signal":null,"text":"hé","chunkTypes":["string"],"allBuffers":false,"endBeforeClose":true,"readable":true} },
  { name: "child-process.spawn stderr keeps output before a nonzero exit code", run: () => streamSettle(stderrOutcome('sh', ['-c', 'printf err >&2; exit 3'])), expected: {"code":3,"signal":null,"text":"err","chunkTypes":["object"],"allBuffers":true,"endBeforeClose":true,"readable":true} },
  { name: "child-process.spawn stdout and stderr stay separate", run: () => streamSettle(pipesOutcome('sh', ['-c', 'printf out; printf err >&2'], ['stdout', 'stderr'])), expected: {"code":0,"signal":null,"stdout":"out","stderr":"err","endBeforeClose":true} },
  { name: "child-process.spawn closes with stdout read and stderr unread", run: () => streamSettle(pipesOutcome('sh', ['-c', 'printf hi; head -c 70000 /dev/zero >&2'], ['stdout'])), expected: {"code":0,"signal":null,"stdout":"hi","stderr":null,"endBeforeClose":true} },
  { name: "child-process.spawn closes with stderr read and stdout unread", run: () => streamSettle(pipesOutcome('sh', ['-c', 'printf hi; head -c 70000 /dev/zero >&2'], ['stderr']).then(({ stderr, ...rest }) => ({ ...rest, length: stderr.length }))), expected: {"code":0,"signal":null,"stdout":null,"endBeforeClose":true,"length":70000} },
  { name: "child-process.spawn stderr closes without a read and discards 70000 bytes", run: () => streamSettle(spawnOutcome('sh', ['-c', 'head -c 70000 /dev/zero >&2'])), expected: {"events":["spawn",["exit",0,null]],"code":0,"signal":null} },
  { name: "child-process.spawn stderr read after close is empty", run: () => streamSettle(lateStderrRead()), expected: "" },
  { name: "child-process.spawn stderr is the same Readable on each access", run: () => { const child = s['child-process'].spawn('sh', ['-c', 'exit 0']); return child.stderr === child.stderr }, expected: true },
)

const readStreamOutcome = (stream) => new Promise((resolve) => {
  const events = []
  const chunks = []
  stream.on('data', (chunk) => {
    events.push('data')
    chunks.push(chunk)
  })
  stream.on('end', () => events.push('end'))
  stream.on('error', (error) => events.push(['error', error.code, error.syscall, error.path?.endsWith('missing.txt') ?? null]))
  stream.on('close', () => {
    events.push('close')
    resolve({
      events,
      chunkTypes: [...new Set(chunks.map((chunk) => typeof chunk))],
      text: chunks.every((chunk) => typeof chunk === 'string') ? chunks.join('') : Buffer.concat(chunks).toString(),
    })
  })
})

sharedCases.push(
  { name: "fs.createReadStream encoding as a string yields strings", run: async () => { const { file } = await streamFile('text.txt', 'hello\n'); return readStreamOutcome(s.fs.createReadStream(file, 'utf8')) }, expected: {"events":["data","end","close"],"chunkTypes":["string"],"text":"hello\n"} },
  { name: "fs.createReadStream encoding in an options object yields strings", run: async () => { const { file } = await streamFile('text.txt', 'hello\n'); return readStreamOutcome(s.fs.createReadStream(file, { encoding: 'utf8' })) }, expected: {"events":["data","end","close"],"chunkTypes":["string"],"text":"hello\n"} },
  { name: "fs.createReadStream encoding keeps a multibyte character whole across chunks", run: async () => { const { file } = await streamFile('multi.txt', 'é'.repeat(40000)); return readStreamOutcome(s.fs.createReadStream(file, 'utf8')).then((o) => ({ chunkTypes: o.chunkTypes, text: o.text === 'é'.repeat(40000), replacement: o.text.includes('\ufffd'), last: o.events.at(-1) })) }, expected: {"chunkTypes":["string"],"text":true,"replacement":false,"last":"close"} },
  { name: "fs.createReadStream encoding hex yields hex text", run: async () => { const { file } = await streamFile('text.txt', 'hello\n'); return readStreamOutcome(s.fs.createReadStream(file, { encoding: 'hex' })) }, expected: {"events":["data","end","close"],"chunkTypes":["string"],"text":"68656c6c6f0a"} },
  { name: "fs.createReadStream without an encoding yields Buffers", run: async () => { const { file } = await streamFile('text.txt', 'hello\n'); return readStreamOutcome(s.fs.createReadStream(file)) }, expected: {"events":["data","end","close"],"chunkTypes":["object"],"text":"hello\n"} },
  { name: "fs.createReadStream encoding null yields Buffers", run: async () => { const { file } = await streamFile('text.txt', 'hello\n'); return readStreamOutcome(s.fs.createReadStream(file, { encoding: null })) }, expected: {"events":["data","end","close"],"chunkTypes":["object"],"text":"hello\n"} },
  { name: "fs.createReadStream encoding on an empty file ends without data", run: async () => { const { file } = await streamFile('empty.txt', ''); return readStreamOutcome(s.fs.createReadStream(file, 'utf8')) }, expected: {"events":["end","close"],"chunkTypes":[],"text":""} },
  { name: "fs.createReadStream encoding on a missing file emits ENOENT then close", run: async () => { const { dir } = await streamFile('present.txt', ''); return readStreamOutcome(s.fs.createReadStream(dir + '/missing.txt', 'utf8')) }, expected: {"events":[["error","ENOENT","open",true],"close"],"chunkTypes":[],"text":""} },
  { name: "fs.createReadStream rejects an unknown encoding with ERR_INVALID_ARG_VALUE", run: async () => { const { file } = await streamFile('text.txt', 'hello\n'); try { s.fs.createReadStream(file, 'no-such-encoding'); return { thrown: null } } catch (error) { return { thrown: { code: error.code, name: error.name, message: error.message } } } }, expected: {"thrown":{"code":"ERR_INVALID_ARG_VALUE","name":"TypeError","message":"The argument 'encoding' is invalid encoding. Received 'no-such-encoding'"}} },
)

const stdinOutcome = (writes, afterEnd) => new Promise((resolve) => {
  const child = s['child-process'].spawn('cat')
  const out = []
  const stdinErrors = []
  child.stdout.on('data', (chunk) => out.push(chunk))
  child.stdin.on('error', (error) => stdinErrors.push(error.code ?? error.name))
  const result = { isWritable: child.stdin instanceof Object && typeof child.stdin.write === 'function', writableBeforeEnd: child.stdin.writable }
  const timer = setTimeout(() => resolve('TIMEOUT'), 3000)
  child.on('close', (code, signal) => {
    clearTimeout(timer)
    const bytes = Buffer.concat(out)
    resolve({ ...result, stdout: bytes.toString('utf8'), stdoutBytes: bytes.length, code, signal, stdinErrors })
  })
  for (const chunk of writes) child.stdin.write(chunk)
  child.stdin.end()
  result.writableAfterEnd = child.stdin.writable
  if (afterEnd !== null) child.stdin.write(afterEnd)
})

const stdinLargeOutcome = async () => {
  const outcome = await stdinOutcome(Array.from({ length: 3000 }, () => 'x'.repeat(100)), null)
  if (outcome === 'TIMEOUT') return outcome
  return { stdoutBytes: outcome.stdoutBytes, allX: outcome.stdout === 'x'.repeat(300000), code: outcome.code, signal: outcome.signal }
}

const stdinMissingOutcome = () => new Promise((resolve) => {
  const child = s['child-process'].spawn('freddie-no-such-command-xyz')
  const stdinErrors = []
  const result = { stdinIsNull: child.stdin === null, stdinWritableBeforeEvents: child.stdin?.writable ?? null }
  child.stdin?.on('error', (error) => stdinErrors.push(error.code ?? error.name))
  child.on('error', (error) => {
    result.spawnErrorCode = error.code
    result.spawnErrorSyscall = error.syscall
  })
  const timer = setTimeout(() => resolve('TIMEOUT'), 3000)
  child.on('close', (code, signal) => {
    clearTimeout(timer)
    resolve({ ...result, closeCode: code, closeSignal: signal, stdinErrors })
  })
  child.stdin?.write('x')
  child.stdin?.end()
})

sharedCases.push(
  { name: "child-process.spawn stdin: a string write reaches cat and end closes it", run: () => stdinOutcome(['hello stdin\n'], null), expected: {"isWritable":true,"writableBeforeEnd":true,"writableAfterEnd":false,"stdout":"hello stdin\n","stdoutBytes":12,"code":0,"signal":null,"stdinErrors":[]} },
  { name: "child-process.spawn stdin: two writes arrive in order", run: () => stdinOutcome(['a', 'b'], null), expected: {"isWritable":true,"writableBeforeEnd":true,"writableAfterEnd":false,"stdout":"ab","stdoutBytes":2,"code":0,"signal":null,"stdinErrors":[]} },
  { name: "child-process.spawn stdin: end with no writes gives empty stdout", run: () => stdinOutcome([], null), expected: {"isWritable":true,"writableBeforeEnd":true,"writableAfterEnd":false,"stdout":"","stdoutBytes":0,"code":0,"signal":null,"stdinErrors":[]} },
  { name: "child-process.spawn stdin: a binary chunk passes through", run: () => stdinOutcome([Buffer.from([0, 255, 16, 10])], null), expected: {"isWritable":true,"writableBeforeEnd":true,"writableAfterEnd":false,"stdout":"\u0000�\u0010\n","stdoutBytes":4,"code":0,"signal":null,"stdinErrors":[]} },
  { name: "child-process.spawn stdin: 300000 bytes in 3000 writes arrive whole", run: () => stdinLargeOutcome(), expected: {"stdoutBytes":300000,"allX":true,"code":0,"signal":null} },
  { name: "child-process.spawn stdin: a write after end emits ERR_STREAM_WRITE_AFTER_END", run: () => stdinOutcome(['ok\n'], 'late'), expected: {"isWritable":true,"writableBeforeEnd":true,"writableAfterEnd":false,"stdout":"ok\n","stdoutBytes":3,"code":0,"signal":null,"stdinErrors":["ERR_STREAM_WRITE_AFTER_END"]} },
  { name: "child-process.spawn stdin: a missing command has a writable stdin that discards writes", run: () => stdinMissingOutcome(), expected: {"stdinIsNull":false,"stdinWritableBeforeEvents":true,"spawnErrorCode":"ENOENT","spawnErrorSyscall":"spawn freddie-no-such-command-xyz","closeCode":-2,"closeSignal":null,"stdinErrors":[]} },
)

const envSpawnOutcome = (file, args, options) => new Promise((resolve) => {
  const child = s['child-process'].spawn(file, args, options)
  const out = []
  child.stdout.on('data', (chunk) => out.push(chunk))
  child.on('close', (code, signal) => resolve({ stdout: Buffer.concat(out).toString('utf8'), code, signal }))
})

const execFileOutcome = (file, args, options) => new Promise((resolve) => {
  s['child-process'].execFile(file, args, options, (error, stdout, stderr) => {
    resolve({ error: error ? { code: error.code ?? null, signal: error.signal ?? null, killed: error.killed, cmd: error.cmd, message: error.message } : null, stdout, stderr })
  })
})

sharedCases.push(
  { name: "child-process.spawn env sets FOO for the child", run: () => envSpawnOutcome('/bin/sh', ['-c', 'echo "[$FOO]"'], { env: { FOO: 'bar' } }), expected: {"stdout":"[bar]\n","code":0,"signal":null} },
  { name: "child-process.spawn without env inherits HOME", run: () => envSpawnOutcome('/bin/sh', ['-c', 'echo "[$HOME]"'], {}), expected: {"stdout":"[/config]\n","code":0,"signal":null} },
  { name: "child-process.spawn env {} gives the child no HOME", run: () => envSpawnOutcome('/bin/sh', ['-c', 'echo "[$HOME]"'], { env: {} }), expected: {"stdout":"[]\n","code":0,"signal":null} },
  { name: "child-process.spawn env lists only FOO for the env command", run: () => envSpawnOutcome('/usr/bin/env', [], { env: { FOO: 'bar' } }), expected: {"stdout":"FOO=bar\n","code":0,"signal":null} },
  { name: "child-process.spawn env coerces a number value to a string", run: () => envSpawnOutcome('/usr/bin/env', [], { env: { N: 1 } }), expected: {"stdout":"N=1\n","code":0,"signal":null} },
  { name: "child-process.spawn env keeps an equals sign and a space in a value", run: () => envSpawnOutcome('/usr/bin/env', [], { env: { A: 'x=y z' } }), expected: {"stdout":"A=x=y z\n","code":0,"signal":null} },
  { name: "child-process.spawn env {} with the env command prints nothing", run: () => envSpawnOutcome('/usr/bin/env', [], { env: {} }), expected: {"stdout":"","code":0,"signal":null} },
  { name: "child-process.spawn env and cwd together", run: () => envSpawnOutcome('/bin/sh', ['-c', 'pwd; echo "[$FOO]"'], { env: { FOO: 'bar' }, cwd: '/' }), expected: {"stdout":"/\n[bar]\n","code":0,"signal":null} },
  { name: "child-process.spawn env drops an undefined value", run: () => envSpawnOutcome('/usr/bin/env', [], { env: { A: undefined, B: 'b' } }), expected: {"stdout":"B=b\n","code":0,"signal":null} },
  { name: "child-process.spawn env turns null into the string null", run: () => envSpawnOutcome('/usr/bin/env', [], { env: { A: null, B: 'b' } }), expected: {"stdout":"A=null\nB=b\n","code":0,"signal":null} },
  { name: "child-process.execFile env sets FOO for the child", run: () => execFileOutcome('/bin/sh', ['-c', 'echo "[$FOO]"'], { env: { FOO: 'bar' } }), expected: {"error":null,"stdout":"[bar]\n","stderr":""} },
  { name: "child-process.execFile env {} gives the child no HOME", run: () => execFileOutcome('/bin/sh', ['-c', 'echo "[$HOME]"'], { env: {} }), expected: {"error":null,"stdout":"[]\n","stderr":""} },
)

const timedSpawnOutcome = (file, args, options) => new Promise((resolve) => {
  const child = s['child-process'].spawn(file, args, options)
  const out = []
  child.stdout.on('data', (chunk) => out.push(chunk))
  child.on('close', (code, signal) => resolve({ stdout: Buffer.concat(out).toString('utf8'), code, signal, killed: child.killed }))
})

sharedCases.push(
  { name: "child-process.execFile timeout kills with SIGTERM and sets killed", run: () => execFileOutcome('sleep', ['5'], { timeout: 300 }), expected: {"error":{"code":null,"signal":"SIGTERM","killed":true,"cmd":"sleep 5","message":"Command failed: sleep 5\n"},"stdout":"","stderr":""} },
  { name: "child-process.execFile killSignal SIGKILL", run: () => execFileOutcome('sleep', ['5'], { timeout: 300, killSignal: 'SIGKILL' }), expected: {"error":{"code":null,"signal":"SIGKILL","killed":true,"cmd":"sleep 5","message":"Command failed: sleep 5\n"},"stdout":"","stderr":""} },
  { name: "child-process.execFile killSignal SIGINT", run: () => execFileOutcome('sleep', ['5'], { timeout: 300, killSignal: 'SIGINT' }), expected: {"error":{"code":null,"signal":"SIGINT","killed":true,"cmd":"sleep 5","message":"Command failed: sleep 5\n"},"stdout":"","stderr":""} },
  { name: "child-process.execFile timeout keeps the partial stdout", run: () => execFileOutcome('/bin/sh', ['-c', 'echo hi; sleep 5'], { timeout: 300 }), expected: {"error":{"code":null,"signal":"SIGTERM","killed":true,"cmd":"/bin/sh -c echo hi; sleep 5","message":"Command failed: /bin/sh -c echo hi; sleep 5\n"},"stdout":"hi\n","stderr":""} },
  { name: "child-process.execFile timeout not reached gives no error", run: () => execFileOutcome('/bin/sh', ['-c', 'echo ok'], { timeout: 5000 }), expected: {"error":null,"stdout":"ok\n","stderr":""} },
  { name: "child-process.execFile timeout 0 disables the timer", run: () => execFileOutcome('/bin/sh', ['-c', 'sleep 0.2; echo late'], { timeout: 0 }), expected: {"error":null,"stdout":"late\n","stderr":""} },
  { name: "child-process.spawn timeout kills with SIGTERM and sets killed", run: () => timedSpawnOutcome('sleep', ['5'], { timeout: 300 }), expected: {"stdout":"","code":null,"signal":"SIGTERM","killed":true} },
  { name: "child-process.spawn killSignal SIGUSR1", run: () => timedSpawnOutcome('sleep', ['5'], { timeout: 300, killSignal: 'SIGUSR1' }), expected: {"stdout":"","code":null,"signal":"SIGUSR1","killed":true} },
  { name: "child-process.spawn timeout 0 disables the timer", run: () => timedSpawnOutcome('/bin/sh', ['-c', 'echo late'], { timeout: 0 }), expected: {"stdout":"late\n","code":0,"signal":null,"killed":false} },
)

const delayed = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

sharedCases.push(
  { name: "child-process.execFile shell runs the joined command", run: () => execFileOutcome('echo hi there', [], { shell: true }), expected: {"error":null,"stdout":"hi there\n","stderr":""} },
  { name: "child-process.execFile shell expands env", run: () => execFileOutcome('echo $FOO', [], { shell: true, env: { FOO: 'bar' } }), expected: {"error":null,"stdout":"bar\n","stderr":""} },
  { name: "child-process.execFile shell joins args with spaces", run: () => execFileOutcome('echo', ['a', 'b c'], { shell: true }), expected: {"error":null,"stdout":"a b c\n","stderr":""} },
  { name: "child-process.execFile shell keeps quotes", run: () => execFileOutcome('echo "a  b"', [], { shell: true }), expected: {"error":null,"stdout":"a  b\n","stderr":""} },
  { name: "child-process.execFile shell reports the exit code", run: () => execFileOutcome('exit 3', [], { shell: true }), expected: {"error":{"code":3,"signal":null,"killed":false,"cmd":"exit 3","message":"Command failed: exit 3\n"},"stdout":"","stderr":""} },
  { name: "child-process.execFile shell false runs the file directly", run: () => execFileOutcome('echo hi there', [], { shell: false }), expected: {"error":{"code":"ENOENT","signal":null,"cmd":"echo hi there","message":"spawn echo hi there ENOENT"},"stdout":"","stderr":""} },
  { name: "child-process.execFile without shell runs the file directly", run: () => execFileOutcome('echo hi there', [], {}), expected: {"error":{"code":"ENOENT","signal":null,"cmd":"echo hi there","message":"spawn echo hi there ENOENT"},"stdout":"","stderr":""} },
  { name: "child-process.spawn shell expands env", run: () => envSpawnOutcome('echo $FOO', [], { shell: true, env: { FOO: 'bar' } }), expected: {"stdout":"bar\n","code":0,"signal":null} },
  { name: "child-process.spawn shell joins args with spaces", run: () => envSpawnOutcome('echo', ['x', 'y'], { shell: true }), expected: {"stdout":"x y\n","code":0,"signal":null} },
  { name: "child-process.execFile timeout leaves no timer after a normal exit", run: async () => {
    const outcome = await execFileOutcome('/bin/sh', ['-c', 'echo ok'], { timeout: 1000 })
    await delayed(1300)
    return outcome
  }, expected: {"error":null,"stdout":"ok\n","stderr":""} },
)

sharedCases.push(
  { name: "child-process.spawn timeout leaves no timer after close", run: async () => {
    const outcome = await timedSpawnOutcome('/bin/sh', ['-c', 'echo ok'], { timeout: 1000 })
    await delayed(1300)
    return outcome
  }, expected: {"stdout":"ok\n","code":0,"signal":null,"killed":false} },
)

const writeFlagOutcome = (setup, run) => withScratch(async (dir) => {
  for (const s of setup) await fsp.writeFile(dir + '/' + s.file, s.data, { flag: s.flag, mode: s.mode })
  const file = dir + '/' + run.file
  try {
    await fsp.writeFile(file, run.data, { flag: run.flag, mode: run.mode })
  } catch (error) {
    return { error: error.code }
  }
  return { content: await fsp.readFile(file, 'utf8'), mode: ((await fsp.stat(file)).mode & 0o777).toString(8) }
})

sharedCases.push(
  { name: "fs.promises.writeFile w new creates", run: () => writeFlagOutcome([], {"file":"f","data":"hello","flag":"w"}), expected: {"content":"hello","mode":"644"} },
  { name: "fs.promises.writeFile w existing truncates", run: () => writeFlagOutcome([{"file":"f","data":"longer text","flag":"w"}], {"file":"f","data":"short","flag":"w"}), expected: {"content":"short","mode":"644"} },
  { name: "fs.promises.writeFile wx new creates", run: () => writeFlagOutcome([], {"file":"f","data":"x","flag":"wx"}), expected: {"content":"x","mode":"644"} },
  { name: "fs.promises.writeFile wx existing EEXIST", run: () => writeFlagOutcome([{"file":"f","data":"old","flag":"w"}], {"file":"f","data":"new","flag":"wx"}), expected: {"error":"EEXIST"} },
  { name: "fs.promises.writeFile wx+ existing EEXIST", run: () => writeFlagOutcome([{"file":"f","data":"old","flag":"w"}], {"file":"f","data":"new","flag":"wx+"}), expected: {"error":"EEXIST"} },
  { name: "fs.promises.writeFile w+ existing truncates", run: () => writeFlagOutcome([{"file":"f","data":"longer text","flag":"w"}], {"file":"f","data":"short","flag":"w+"}), expected: {"content":"short","mode":"644"} },
  { name: "fs.promises.writeFile a existing appends", run: () => writeFlagOutcome([{"file":"f","data":"base","flag":"w"}], {"file":"f","data":"add","flag":"a"}), expected: {"content":"baseadd","mode":"644"} },
  { name: "fs.promises.writeFile a new creates", run: () => writeFlagOutcome([], {"file":"f","data":"add","flag":"a"}), expected: {"content":"add","mode":"644"} },
  { name: "fs.promises.writeFile a+ existing appends", run: () => writeFlagOutcome([{"file":"f","data":"base","flag":"w"}], {"file":"f","data":"add","flag":"a+"}), expected: {"content":"baseadd","mode":"644"} },
  { name: "fs.promises.writeFile ax new creates", run: () => writeFlagOutcome([], {"file":"f","data":"add","flag":"ax"}), expected: {"content":"add","mode":"644"} },
  { name: "fs.promises.writeFile ax existing EEXIST", run: () => writeFlagOutcome([{"file":"f","data":"base","flag":"w"}], {"file":"f","data":"add","flag":"ax"}), expected: {"error":"EEXIST"} },
  { name: "fs.promises.writeFile ax+ new creates", run: () => writeFlagOutcome([], {"file":"f","data":"add","flag":"ax+"}), expected: {"content":"add","mode":"644"} },
  { name: "fs.promises.writeFile r+ overwrites from start", run: () => writeFlagOutcome([{"file":"f","data":"abcdef","flag":"w"}], {"file":"f","data":"XY","flag":"r+"}), expected: {"content":"XYcdef","mode":"644"} },
  { name: "fs.promises.writeFile r+ missing ENOENT", run: () => writeFlagOutcome([], {"file":"f","data":"XY","flag":"r+"}), expected: {"error":"ENOENT"} },
  { name: "fs.promises.writeFile r+ longer data grows", run: () => writeFlagOutcome([{"file":"f","data":"abc","flag":"w"}], {"file":"f","data":"WXYZ","flag":"r+"}), expected: {"content":"WXYZ","mode":"644"} },
  { name: "fs.promises.writeFile w mode 0o600 new", run: () => writeFlagOutcome([], {"file":"f","data":"m","flag":"w","mode":384}), expected: {"content":"m","mode":"600"} },
  { name: "fs.promises.writeFile wx mode 0o600 new", run: () => writeFlagOutcome([], {"file":"f","data":"m","flag":"wx","mode":384}), expected: {"content":"m","mode":"600"} },
  { name: "fs.promises.writeFile a mode 0o600 new", run: () => writeFlagOutcome([], {"file":"f","data":"m","flag":"a","mode":384}), expected: {"content":"m","mode":"600"} },
  { name: "fs.promises.writeFile w mode ignored when file exists", run: () => writeFlagOutcome([{"file":"f","data":"old","flag":"w","mode":420}], {"file":"f","data":"new","flag":"w","mode":384}), expected: {"content":"new","mode":"644"} },
  { name: "fs.promises.writeFile r+ mode missing ENOENT", run: () => writeFlagOutcome([], {"file":"f","data":"XY","flag":"r+","mode":384}), expected: {"error":"ENOENT"} },
  { name: "fs.promises.writeFile wx mode existing EEXIST", run: () => writeFlagOutcome([{"file":"f","data":"old","flag":"w","mode":420}], {"file":"f","data":"new","flag":"wx","mode":384}), expected: {"error":"EEXIST"} },
  { name: "fs.promises.writeFile w default mode new", run: () => writeFlagOutcome([], {"file":"f","data":"d","flag":"w"}), expected: {"content":"d","mode":"644"} },
)

sharedCases.push(
  { name: "fs.promises.writeFile ax+ existing EEXIST", run: () => writeFlagOutcome([{"file":"f","data":"base","flag":"w"}], {"file":"f","data":"add","flag":"ax+"}), expected: {"error":"EEXIST"} },
)

const ownIds = async () => {
  const status = await fsp.readFile('/proc/self/status', 'utf8')
  return {
    uid: Number(/^Uid:\s+(\d+)/m.exec(status)[1]),
    gid: Number(/^Gid:\s+(\d+)/m.exec(status)[1]),
  }
}

const thrownBy = async (run) => {
  try {
    return await run()
  } catch (error) {
    return { threw: { code: error.code, syscall: error.syscall, message: error.message } }
  }
}

sharedCases.push(
  { name: "child-process.spawn uid option runs as the same uid", run: async () => envSpawnOutcome('id', ['-u'], { uid: (await ownIds()).uid }), expected: {"stdout":"1000\n","code":0,"signal":null} },
  { name: "child-process.spawn gid option runs as the same gid", run: async () => envSpawnOutcome('id', ['-g'], { gid: (await ownIds()).gid }), expected: {"stdout":"1000\n","code":0,"signal":null} },
  { name: "child-process.spawn uid undefined keeps the current uid", run: () => envSpawnOutcome('id', ['-u'], { uid: undefined }), expected: {"stdout":"1000\n","code":0,"signal":null} },
  { name: "child-process.spawn uid of another user throws EPERM", run: async () => thrownBy(async () => envSpawnOutcome('id', ['-u'], { uid: (await ownIds()).uid + 1 })), expected: {"threw":{"code":"EPERM","syscall":"spawn","message":"spawn EPERM"}} },
  { name: "child-process.spawn gid of another group throws EPERM", run: async () => thrownBy(async () => envSpawnOutcome('id', ['-g'], { gid: (await ownIds()).gid + 1 })), expected: {"threw":{"code":"EPERM","syscall":"spawn","message":"spawn EPERM"}} },
  { name: "child-process.execFile uid option runs as the same uid", run: async () => execFileOutcome('id', ['-u'], { uid: (await ownIds()).uid }), expected: {"error":null,"stdout":"1000\n","stderr":""} },
  { name: "child-process.execFile gid option runs as the same gid", run: async () => execFileOutcome('id', ['-g'], { gid: (await ownIds()).gid }), expected: {"error":null,"stdout":"1000\n","stderr":""} },
  { name: "child-process.execFile uid of another user throws EPERM", run: async () => thrownBy(async () => execFileOutcome('id', ['-u'], { uid: (await ownIds()).uid + 1 })), expected: {"threw":{"code":"EPERM","syscall":"spawn","message":"spawn EPERM"}} },
  { name: "child-process.execFile gid of another group throws EPERM", run: async () => thrownBy(async () => execFileOutcome('id', ['-g'], { gid: (await ownIds()).gid + 1 })), expected: {"threw":{"code":"EPERM","syscall":"spawn","message":"spawn EPERM"}} },
)

const parentSession = async () => (await execFileOutcome('/bin/sh', ['-c', 'cut -d" " -f6 /proc/$1/stat', 'sh', String(proc.pid)], {})).stdout.trim()

const SESSION_SCRIPT = "S=$(cut -d\" \" -f6 /proc/$$/stat); P=$(cut -d\" \" -f5 /proc/$$/stat); echo \"sid_is_pid=$([ \"$S\" = \"$$\" ] && echo yes || echo no) pgrp_is_pid=$([ \"$P\" = \"$$\" ] && echo yes || echo no) same_session=$([ \"$S\" = \"$PARENT_SID\" ] && echo yes || echo no)\""

sharedCases.push(
  { name: "child-process.spawn without detached stays in the parent session", run: async () => envSpawnOutcome('/bin/sh', ['-c', SESSION_SCRIPT], { env: { PARENT_SID: await parentSession() } }), expected: {"stdout":"sid_is_pid=no pgrp_is_pid=no same_session=yes\n","code":0,"signal":null} },
)

const stdioSpawnOutcome = (file, args, options) => new Promise((resolve) => {
  const child = s['child-process'].spawn(file, args, options)
  child.on('close', (code, signal) => resolve({ pipes: [child.stdin === null, child.stdout === null, child.stderr === null], code, signal }))
})

sharedCases.push(
  { name: "child-process.spawn stdio inherit leaves stdin, stdout and stderr null and shares the parent fds", run: () => stdioSpawnOutcome('/bin/sh', ['-c', "[ \"$(readlink /proc/$$/fd/0)\" = \"$(readlink /proc/$PPID/fd/0)\" ] && [ \"$(readlink /proc/$$/fd/1)\" = \"$(readlink /proc/$PPID/fd/1)\" ]"], { stdio: 'inherit' }), expected: {"pipes":[true,true,true],"code":0,"signal":null} },
  { name: "child-process.spawn stdio array keeps stdout inherited and stdin and stderr piped", run: () => stdioSpawnOutcome('/bin/sh', ['-c', "[ \"$(readlink /proc/$$/fd/1)\" = \"$(readlink /proc/$PPID/fd/1)\" ]"], { stdio: ['pipe', 'inherit', 'pipe'] }), expected: {"pipes":[false,true,false],"code":0,"signal":null} },
)

const kernelUname = async () => (await execFileOutcome('uname', ['-s'], {})).stdout.trim()

sharedCases.push(
  { name: "os.platform reports the kernel platform name", run: () => s.os.platform(), expected: "linux" },
  { name: "process.platform reports the kernel platform name", run: () => proc.platform, expected: "linux" },
  { name: "os.platform and the uname -s kernel name agree", run: async () => ({ platform: s.os.platform(), kernel: await kernelUname() }), expected: { platform: "linux", kernel: "Linux" } },
)

const execErrorShape = (error) => (error == null ? null : { name: error.name ?? null, code: error.code ?? null, killed: error.killed ?? null, signal: error.signal ?? null, message: String(error.message).split('\n')[0].slice(0, 120) })
const execRecord = (file, args, options) => new Promise((resolve) => {
  s['child-process'].execFile(file, args, options, (error, stdout, stderr) => resolve({ error: execErrorShape(error), stdoutLength: String(stdout).length, stdout: String(stdout).slice(0, 40), stderr: String(stderr).slice(0, 40) }))
})

sharedCases.push(
  { name: "child-process.execFile maxBuffer at the limit keeps the output", run: () => execRecord('/bin/sh', ['-c', 'printf abc'], { maxBuffer: 3 }), expected: {"error":null,"stdoutLength":3,"stdout":"abc","stderr":""} },
  { name: "child-process.execFile maxBuffer exceeded reports RangeError and truncates stdout", run: () => execRecord('/bin/sh', ['-c', 'printf abcdef'], { maxBuffer: 3 }), expected: {"error":{"name":"RangeError","code":"ERR_CHILD_PROCESS_STDIO_MAXBUFFER","killed":null,"signal":null,"message":"stdout maxBuffer length exceeded"},"stdoutLength":3,"stdout":"abc","stderr":""} },
  { name: "child-process.execFile maxBuffer large output stops at the limit", run: () => execRecord('/bin/sh', ['-c', 'head -c 100000 /dev/zero'], { maxBuffer: 1000 }), expected: {"error":{"name":"RangeError","code":"ERR_CHILD_PROCESS_STDIO_MAXBUFFER","killed":null,"signal":null,"message":"stdout maxBuffer length exceeded"},"stdoutLength":1000,"stdout":"\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000","stderr":""} },
  { name: "child-process.execFile default maxBuffer keeps small output", run: () => execRecord('/bin/sh', ['-c', 'printf abc'], {}), expected: {"error":null,"stdoutLength":3,"stdout":"abc","stderr":""} },
  { name: "child-process.execFile default maxBuffer is 1 MiB", run: () => execRecord('/bin/sh', ['-c', 'head -c 2000000 /dev/zero'], {}), expected: {"error":{"name":"RangeError","code":"ERR_CHILD_PROCESS_STDIO_MAXBUFFER","killed":null,"signal":null,"message":"stdout maxBuffer length exceeded"},"stdoutLength":1048576,"stdout":"\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000","stderr":""} },
  { name: "child-process.execFile maxBuffer Infinity never overflows", run: () => execRecord('/bin/sh', ['-c', 'printf abcdef'], { maxBuffer: Infinity }), expected: {"error":null,"stdoutLength":6,"stdout":"abcdef","stderr":""} },
  { name: "child-process.execFile maxBuffer 0 reports RangeError with empty stdout", run: () => execRecord('/bin/sh', ['-c', 'printf abc'], { maxBuffer: 0 }), expected: {"error":{"name":"RangeError","code":"ERR_CHILD_PROCESS_STDIO_MAXBUFFER","killed":null,"signal":null,"message":"stdout maxBuffer length exceeded"},"stdoutLength":0,"stdout":"","stderr":""} },
)

const abortedSignal = () => { const controller = new AbortController(); controller.abort(); return controller.signal }
const abortSoonSignal = (ms) => { const controller = new AbortController(); setTimeout(() => controller.abort(), ms); return controller.signal }
const spawnEventsRecord = (file, args, options) => new Promise((resolve) => {
  const events = []
  const chunks = []
  const child = s['child-process'].spawn(file, args, options)
  const guard = setTimeout(() => resolve({ events, stdout: chunks.join(''), timedOut: true }), 3000)
  child.stdout.on('data', (chunk) => chunks.push(String(chunk)))
  child.on('error', (e) => events.push(['error', e.name ?? null, e.code ?? null]))
  child.on('close', (code, signal) => {
    events.push(['close', code, signal])
    clearTimeout(guard)
    resolve({ events, stdout: chunks.join('') })
  })
})

sharedCases.push(
  { name: "child-process.execFile AbortSignal already aborted reports AbortError", run: () => execRecord('/bin/sh', ['-c', 'echo ok'], { signal: abortedSignal() }), expected: {"error":{"name":"AbortError","code":"ABORT_ERR","killed":null,"signal":null,"message":"The operation was aborted"},"stdoutLength":0,"stdout":"","stderr":""} },
  { name: "child-process.execFile AbortSignal aborted mid-run reports AbortError", run: () => execRecord('/bin/sh', ['-c', 'exec sleep 5'], { signal: abortSoonSignal(100) }), expected: {"error":{"name":"AbortError","code":"ABORT_ERR","killed":null,"signal":null,"message":"The operation was aborted"},"stdoutLength":0,"stdout":"","stderr":""} },
  { name: "child-process.spawn AbortSignal already aborted emits error then close with the kill signal", run: () => spawnEventsRecord('/bin/sh', ['-c', 'echo ok'], { signal: abortedSignal() }), expected: {"events":[["error","AbortError","ABORT_ERR"],["close",null,"SIGTERM"]],"stdout":""} },
  { name: "child-process.spawn AbortSignal aborted mid-run emits error then close with the kill signal", run: () => spawnEventsRecord('/bin/sh', ['-c', 'exec sleep 5'], { signal: abortSoonSignal(100) }), expected: {"events":[["error","AbortError","ABORT_ERR"],["close",null,"SIGTERM"]],"stdout":""} },
)

sharedCases.push(
  { name: "child-process.execFile numeric killSignal 9 kills with SIGKILL", run: () => execRecord('/bin/sh', ['-c', 'exec sleep 5'], { timeout: 100, killSignal: 9 }), expected: {"error":{"name":"Error","code":null,"killed":true,"signal":"SIGKILL","message":"Command failed: /bin/sh -c exec sleep 5"},"stdoutLength":0,"stdout":"","stderr":""} },
  { name: "child-process.execFile numeric killSignal 2 kills with SIGINT", run: () => execRecord('/bin/sh', ['-c', 'exec sleep 5'], { timeout: 100, killSignal: 2 }), expected: {"error":{"name":"Error","code":null,"killed":true,"signal":"SIGINT","message":"Command failed: /bin/sh -c exec sleep 5"},"stdoutLength":0,"stdout":"","stderr":""} },
  { name: "child-process.execFile numeric killSignal 15 kills with SIGTERM", run: () => execRecord('/bin/sh', ['-c', 'exec sleep 5'], { timeout: 100, killSignal: 15 }), expected: {"error":{"name":"Error","code":null,"killed":true,"signal":"SIGTERM","message":"Command failed: /bin/sh -c exec sleep 5"},"stdoutLength":0,"stdout":"","stderr":""} },
  { name: "child-process.execFile numeric killSignal 9 matches the SIGKILL name", run: () => execRecord('/bin/sh', ['-c', 'exec sleep 5'], { timeout: 100, killSignal: 'SIGKILL' }), expected: {"error":{"name":"Error","code":null,"killed":true,"signal":"SIGKILL","message":"Command failed: /bin/sh -c exec sleep 5"},"stdoutLength":0,"stdout":"","stderr":""} },
  { name: "child-process.spawn numeric killSignal 9 closes with SIGKILL", run: () => spawnEventsRecord('/bin/sh', ['-c', 'exec sleep 5'], { timeout: 100, killSignal: 9 }), expected: {"events":[["close",null,"SIGKILL"]],"stdout":""} },
)

sharedCases.push(
  { name: "child-process.spawn windowsHide true is a no-op on Linux", run: () => spawnEventsRecord('/bin/sh', ['-c', 'echo ok'], { windowsHide: true }), expected: {"events":[["close",0,null]],"stdout":"ok\n"} },
  { name: "child-process.execFile windowsHide true is a no-op on Linux", run: () => execRecord('/bin/sh', ['-c', 'echo ok'], { windowsHide: true }), expected: {"error":null,"stdoutLength":3,"stdout":"ok\n","stderr":""} },
  { name: "child-process.execFile windowsHide false is a no-op on Linux", run: () => execRecord('/bin/sh', ['-c', 'echo ok'], { windowsHide: false }), expected: {"error":null,"stdoutLength":3,"stdout":"ok\n","stderr":""} },
)

const hashOutcome = (run) => {
  try {
    return run()
  } catch (e) {
    return { threw: { name: e.name ?? null, code: e.code ?? null, message: String(e.message).split('\n')[0].slice(0, 120) } }
  }
}

sharedCases.push(
  { name: "crypto.createHash sha256 outputLength 32 matches the digest size", run: () => hashOutcome(() => s.crypto.createHash('sha256', { outputLength: 32 }).update('abc').digest('hex')), expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
  { name: "crypto.createHash md5 outputLength 16 matches the digest size", run: () => hashOutcome(() => s.crypto.createHash('md5', { outputLength: 16 }).update('abc').digest('hex')), expected: "900150983cd24fb0d6963f7d28e17f72" },
  { name: "crypto.createHash sha512 outputLength 64 matches the digest size", run: () => hashOutcome(() => s.crypto.createHash('sha512', { outputLength: 64 }).update('abc').digest('hex')), expected: "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f" },
  { name: "crypto.createHash sha256 outputLength 16 throws ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH on digest", run: () => hashOutcome(() => s.crypto.createHash('sha256', { outputLength: 16 }).update('abc').digest('hex')), expected: {"threw":{"name":"Error","code":"ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH","message":"error:030000B2:digital envelope routines::not XOF or invalid length"}} },
  { name: "crypto.createHash sha256 outputLength 16 throws at createHash", run: () => hashOutcome(() => { s.crypto.createHash('sha256', { outputLength: 16 }); return 'created' }), expected: {"threw":{"name":"Error","code":"ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH","message":"error:030000B2:digital envelope routines::not XOF or invalid length"}} },
  { name: "crypto.createHash sha256 outputLength 32 creates at createHash", run: () => hashOutcome(() => { s.crypto.createHash('sha256', { outputLength: 32 }); return 'created' }), expected: "created" },
)

const spawnCollect = (file, args, options) => new Promise((resolve) => {
  const child = s['child-process'].spawn(file, args, options)
  const out = []
  const err = []
  child.stdout?.on('data', (chunk) => out.push(String(chunk)))
  child.stderr?.on('data', (chunk) => err.push(String(chunk)))
  child.on('close', (code, signal) => resolve({ stdout: out.join('').replace(/socket:\[\d+\]/g, 'socket:[N]'), stderr: err.join('').replace(/socket:\[\d+\]/g, 'socket:[N]'), code, signal, pipes: [child.stdin === null, child.stdout === null, child.stderr === null] }))
})
const execCapture = (file, args, options) => new Promise((resolve) => {
  s['child-process'].execFile(file, args, options, (error, stdout, stderr) => resolve({ error: execErrorShape(error), stdout: String(stdout), stderr: String(stderr) }))
})

sharedCases.push(
  { name: "child-process.spawn stdio ignore leaves all three streams null and exits 0", run: () => spawnCollect('/bin/sh', ['-c', 'echo hi; echo err 1>&2'], { stdio: 'ignore' }), expected: {"stdout":"","stderr":"","code":0,"signal":null,"pipes":[true,true,true]} },
  { name: "child-process.spawn stdio ignore on stdin and stderr gives fd 0 and fd 2 /dev/null", run: () => spawnCollect('/bin/sh', ['-c', 'readlink /proc/$$/fd/0; readlink /proc/$$/fd/2'], { stdio: ['ignore', 'pipe', 'ignore'] }), expected: {"stdout":"/dev/null\n/dev/null\n","stderr":"","code":0,"signal":null,"pipes":[true,false,true]} },
  { name: "child-process.spawn stdio ignore on stdout gives fd 1 a socket as in Node", run: () => spawnCollect('/bin/sh', ['-c', 'readlink /proc/$$/fd/1 >&2; readlink /proc/$$/fd/2 >&2'], { stdio: ['pipe', 'ignore', 'pipe'] }), expected: {"stdout":"","stderr":"socket:[N]\nsocket:[N]\n","code":0,"signal":null,"pipes":[false,true,false]} },
  { name: "child-process.spawn stdio ignore on stdout does not block a 300000-byte flood", run: () => spawnCollect('/bin/sh', ['-c', 'head -c 300000 /dev/zero'], { stdio: ['pipe', 'ignore', 'pipe'] }), expected: {"stdout":"","stderr":"","code":0,"signal":null,"pipes":[false,true,false]} },
  { name: "child-process.execFile stdio ignore is accepted and stdout is still captured, as in Node", run: () => execCapture('/bin/sh', ['-c', 'echo hi'], { stdio: 'ignore' }), expected: {"error":null,"stdout":"hi\n","stderr":""} },
  { name: "child-process.execFile stdio inherit is accepted and both streams are captured, as in Node", run: () => execCapture('/bin/sh', ['-c', 'echo hi; echo err 1>&2'], { stdio: 'inherit' }), expected: {"error":null,"stdout":"hi\n","stderr":"err\n"} },
)

const readStreamText = (stream) => new Promise((resolve) => {
  const chunks = []
  stream.on('data', (chunk) => chunks.push(String(chunk)))
  stream.on('error', (error) => resolve({ error: error.code }))
  stream.on('end', () => resolve(chunks.join('')))
})
sharedCases.push(
  { name: 'stream.Readable highWaterMark 3 push returns', run: () => { const r = new s.stream.Readable({ read() {}, highWaterMark: 3 }); return [r.push(Buffer.from('ab')), r.push(Buffer.from('c')), r.push(Buffer.from('d')), r.readableLength] }, expected: [true, false, false, 4] },
  { name: 'stream.Writable objectMode write returns with a held callback', run: () => { const w = new s.stream.Writable({ objectMode: true, highWaterMark: 3, write(chunk, enc, cb) {} }); return [w.write({ n: 1 }), w.write({ n: 2 }), w.write({ n: 3 }), w.write({ n: 4 })] }, expected: [true, true, false, false] },
  { name: 'stream.Writable objectMode passes objects and numbers to _write', run: async () => { const got = []; const w = new s.stream.Writable({ objectMode: true, write(chunk, enc, cb) { got.push(typeof chunk + ':' + JSON.stringify(chunk)); cb() } }); w.write({ a: 1 }); w.write(7); await new Promise((resolve) => w.end(resolve)); return got }, expected: ['object:{"a":1}', 'number:7'] },
  { name: 'stream.Writable highWaterMark 5 write returns', run: () => { const w = new s.stream.Writable({ highWaterMark: 5, write(chunk, enc, cb) {} }); return [w.write(Buffer.from('abc')), w.write(Buffer.from('de')), w.write(Buffer.from('f'))] }, expected: [true, false, false] },
  { name: 'stream.PassThrough highWaterMark 2 write returns', run: () => new s.stream.PassThrough({ highWaterMark: 2 }).write(Buffer.from('abc')), expected: false },
  { name: 'stream.Readable encoding hex yields hex strings', run: async () => { const r = new s.stream.Readable({ read() {}, encoding: 'hex' }); r.push(Buffer.from('ab')); r.push(null); return readStreamText(r) }, expected: '6162' },
  { name: 'stream.PassThrough encoding hex yields hex strings on the read side', run: async () => { const p = new s.stream.PassThrough({ encoding: 'hex' }); p.end(Buffer.from('ab')); return readStreamText(p) }, expected: '6162' },
  { name: 'stream.Readable encoding utf8 keeps a multibyte character whole across pushes', run: async () => { const r = new s.stream.Readable({ read() {}, encoding: 'utf8' }); const e = Buffer.from('é'); r.push(e.subarray(0, 1)); r.push(e.subarray(1)); r.push(null); return readStreamText(r) }, expected: 'é' },
)


const readStreamLengths = (stream) => new Promise((resolve) => {
  const lengths = []
  stream.on('data', (chunk) => lengths.push(chunk.length))
  stream.on('error', (error) => resolve({ error: error.code }))
  stream.on('end', () => resolve(lengths))
})
sharedCases.push(
  { name: 'fs.createReadStream start and end read an inclusive range', run: async () => { const { file } = await streamFile('rng.txt', 'abcdefghij'); return readStreamText(s.fs.createReadStream(file, { start: 2, end: 4 })) }, expected: 'cde' },
  { name: 'fs.createReadStream start alone reads to the end', run: async () => { const { file } = await streamFile('rng.txt', 'abcdefghij'); return readStreamText(s.fs.createReadStream(file, { start: 7 })) }, expected: 'hij' },
  { name: 'fs.createReadStream end alone reads from byte 0', run: async () => { const { file } = await streamFile('rng.txt', 'abcdefghij'); return readStreamText(s.fs.createReadStream(file, { end: 2 })) }, expected: 'abc' },
  { name: 'fs.createReadStream highWaterMark 4 sets the chunk size', run: async () => { const { file } = await streamFile('rng.txt', 'abcdefghij'); return readStreamLengths(s.fs.createReadStream(file, { highWaterMark: 4 })) }, expected: [4, 4, 2] },
  { name: 'fs.createReadStream start, end and highWaterMark set the chunk sizes', run: async () => { const { file } = await streamFile('rng.txt', 'abcdefghij'); return readStreamLengths(s.fs.createReadStream(file, { start: 1, end: 8, highWaterMark: 3 })) }, expected: [3, 3, 2] },
)

sharedCases.push(
  { name: 'fs.promises.writeFile rs+ overwrites from start', run: () => writeFlagOutcome([{ file: 'f', data: 'abcdef', flag: 'w' }], { file: 'f', data: 'XY', flag: 'rs+' }), expected: { content: 'XYcdef', mode: '644' } },
  { name: 'fs.promises.writeFile rs+ missing ENOENT', run: () => writeFlagOutcome([], { file: 'f', data: 'XY', flag: 'rs+' }), expected: { error: 'ENOENT' } },
  { name: 'fs.promises.writeFile as new creates', run: () => writeFlagOutcome([], { file: 'f', data: 'add', flag: 'as' }), expected: { content: 'add', mode: '644' } },
  { name: 'fs.promises.writeFile as existing appends', run: () => writeFlagOutcome([{ file: 'f', data: 'base', flag: 'w' }], { file: 'f', data: 'add', flag: 'as' }), expected: { content: 'baseadd', mode: '644' } },
  { name: 'fs.promises.writeFile as+ existing appends', run: () => writeFlagOutcome([{ file: 'f', data: 'base', flag: 'w' }], { file: 'f', data: 'add', flag: 'as+' }), expected: { content: 'baseadd', mode: '644' } },
  { name: 'fs.promises.writeFile as+ new creates', run: () => writeFlagOutcome([], { file: 'f', data: 'add', flag: 'as+' }), expected: { content: 'add', mode: '644' } },
  { name: 'fs.promises.writeFile string mode 0600 new', run: () => writeFlagOutcome([], { file: 'f', data: 'm', flag: 'w', mode: '0600' }), expected: { content: 'm', mode: '600' } },
  { name: 'fs.promises.writeFile string mode 0600 ignored when file exists', run: () => writeFlagOutcome([{ file: 'f', data: 'old', flag: 'w', mode: 420 }], { file: 'f', data: 'new', flag: 'w', mode: '0600' }), expected: { content: 'new', mode: '644' } },
)

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const bufferedAfterRead = async (options) => { const { file } = await streamFile('ten.txt', 'abcdefghij'); const rs = s.fs.createReadStream(file, options); rs.read(0); await sleepMs(150); const buffered = rs.readableLength; rs.destroy(); return buffered }
sharedCases.push(
  { name: 'fs.createReadStream highWaterMark 4 limits the buffered bytes to 4', run: () => bufferedAfterRead({ highWaterMark: 4 }), expected: 4 },
  { name: 'fs.createReadStream start and end limit the buffered bytes to the range', run: () => bufferedAfterRead({ start: 2, end: 4 }), expected: 3 },
  { name: 'fs.createReadStream end alone limits the buffered bytes', run: () => bufferedAfterRead({ end: 2 }), expected: 3 },
  { name: 'fs.createReadStream start, end and highWaterMark limit the buffered bytes', run: () => bufferedAfterRead({ start: 1, end: 8, highWaterMark: 3 }), expected: 3 },
  { name: 'fs.createReadStream without options buffers the whole small file', run: () => bufferedAfterRead(undefined), expected: 10 },
)

const streamEvents = (stream, onData) => new Promise((resolve) => {
  const got = []
  stream.on('data', (chunk) => { got.push('data ' + String(chunk)); onData?.() })
  stream.on('error', (error) => got.push('error ' + error.code + ' ' + error.name))
  stream.on('close', () => { got.push('close'); resolve(got) })
})
const abortedBeforeRead = async () => {
  const { file } = await streamFile('ten.txt', 'abcdefghij')
  const controller = new AbortController()
  controller.abort()
  return streamEvents(s.fs.createReadStream(file, { signal: controller.signal }))
}
const abortedDuringRead = async () => {
  const { file } = await streamFile('ten.txt', 'abcdefghij')
  const controller = new AbortController()
  return streamEvents(s.fs.createReadStream(file, { signal: controller.signal, highWaterMark: 4 }), () => controller.abort())
}
sharedCases.push(
  { name: 'fs.createReadStream signal already aborted emits AbortError then close', run: abortedBeforeRead, expected: ['error ABORT_ERR AbortError', 'close'] },
  { name: 'fs.createReadStream signal aborted during a read stops after the chunk in flight', run: abortedDuringRead, expected: ['data abcd', 'error ABORT_ERR AbortError', 'close'] },
)

const flagsOutcome = async (flags) => {
  const { file } = await streamFile('ten.txt', 'abcdefghij')
  const events = await streamEvents(s.fs.createReadStream(file, { flags }))
  return [...events, 'file ' + JSON.stringify(await fsp.readFile(file, 'utf8'))]
}
sharedCases.push(
  { name: 'fs.createReadStream flags r reads the file', run: () => flagsOutcome('r'), expected: ['data abcdefghij', 'close', 'file "abcdefghij"'] },
  { name: 'fs.createReadStream flags r+ reads the file', run: () => flagsOutcome('r+'), expected: ['data abcdefghij', 'close', 'file "abcdefghij"'] },
  { name: 'fs.createReadStream flags w fails with EBADF and truncates the file', run: () => flagsOutcome('w'), expected: ['error EBADF Error', 'close', 'file ""'] },
  { name: 'fs.createReadStream flags wx on an existing file fails with EEXIST and keeps it', run: () => flagsOutcome('wx'), expected: ['error EEXIST Error', 'close', 'file "abcdefghij"'] },
)

sharedCases.push(
  { name: 'fs.createReadStream mode 0o600 leaves an existing file unchanged', run: async () => { const { file } = await streamFile('ten.txt', 'abcdefghij'); const before = (await fsp.stat(file)).mode & 0o777; const events = await streamEvents(s.fs.createReadStream(file, { mode: 0o600 })); const after = (await fsp.stat(file)).mode & 0o777; return [...events, before === after ? 'mode unchanged' : 'mode changed to ' + after.toString(8)] }, expected: ['data abcdefghij', 'close', 'mode unchanged'] },
)

const collectFor = (stream, ms) => new Promise((resolve) => {
  const got = []
  stream.on('data', (chunk) => got.push('data ' + String(chunk)))
  stream.on('end', () => got.push('end'))
  stream.on('error', (error) => got.push('error ' + error.code + ' ' + error.name))
  stream.on('close', () => got.push('close'))
  setTimeout(() => { resolve([...got]); stream.destroy() }, ms)
})
sharedCases.push(
  { name: 'fs.createReadStream autoClose false reads the data and never emits close', run: async () => { const { file } = await streamFile('ten.txt', 'abcdefghij'); return collectFor(s.fs.createReadStream(file, { autoClose: false }), 300) }, expected: ['data abcdefghij', 'end'] },
  { name: 'fs.createReadStream autoClose false on a missing file emits ENOENT and no close', run: async () => { const { dir } = await streamFile('ten.txt', 'abcdefghij'); return collectFor(s.fs.createReadStream(dir + '/missing.txt', { autoClose: false }), 300) }, expected: ['error ENOENT Error'] },
)

sharedCases.push(
  { name: 'fs.createReadStream flags rs reads or fails as Node does', run: () => flagsOutcome('rs'), expected: ['data abcdefghij', 'close', 'file "abcdefghij"'] },
)

sharedCases.push(
  { name: 'fs.createReadStream flags rs+ reads or fails as Node does', run: () => flagsOutcome('rs+'), expected: ['data abcdefghij', 'close', 'file "abcdefghij"'] },
)

sharedCases.push(
  { name: 'fs.createReadStream flags w+ reads or fails as Node does', run: () => flagsOutcome('w+'), expected: ['close', 'file ""'] },
)

sharedCases.push(
  { name: 'fs.createReadStream flags wx+ reads or fails as Node does', run: () => flagsOutcome('wx+'), expected: ['error EEXIST Error', 'close', 'file "abcdefghij"'] },
)

sharedCases.push(
  { name: 'fs.createReadStream flags a reads or fails as Node does', run: () => flagsOutcome('a'), expected: ['error EBADF Error', 'close', 'file "abcdefghij"'] },
)

sharedCases.push(
  { name: 'fs.createReadStream flags ax reads or fails as Node does', run: () => flagsOutcome('ax'), expected: ['error EEXIST Error', 'close', 'file "abcdefghij"'] },
)

sharedCases.push(
  { name: 'fs.createReadStream flags a+ reads or fails as Node does', run: () => flagsOutcome('a+'), expected: ['data abcdefghij', 'close', 'file "abcdefghij"'] },
)

sharedCases.push(
  { name: 'fs.createReadStream flags ax+ reads or fails as Node does', run: () => flagsOutcome('ax+'), expected: ['error EEXIST Error', 'close', 'file "abcdefghij"'] },
)

sharedCases.push(
  { name: 'fs.createReadStream flags as reads or fails as Node does', run: () => flagsOutcome('as'), expected: ['error EBADF Error', 'close', 'file "abcdefghij"'] },
)

sharedCases.push(
  { name: 'fs.createReadStream flags as+ reads or fails as Node does', run: () => flagsOutcome('as+'), expected: ['data abcdefghij', 'close', 'file "abcdefghij"'] },
)

sharedCases.push(
  { name: 'fs.createReadStream flags zz reads or fails as Node does', run: () => flagsOutcome('zz'), expected: ['error ERR_INVALID_ARG_VALUE TypeError', 'close', 'file "abcdefghij"'] },
)

const signalTypeError = (signal) => {
  try { s.fs.createReadStream('/tmp/never-read-signal', { signal }) } catch (error) { return { code: error.code, name: error.name, message: error.message } }
  return 'no throw'
}
sharedCases.push(
  { name: 'fs.createReadStream signal 1 throws ERR_INVALID_ARG_TYPE', run: () => signalTypeError(1), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: 'The "options.signal" property must be an instance of AbortSignal. Received type number (1)' } },
  { name: 'fs.createReadStream signal abc throws ERR_INVALID_ARG_TYPE', run: () => signalTypeError('abc'), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: "The \"options.signal\" property must be an instance of AbortSignal. Received type string ('abc')" } },
  { name: 'fs.createReadStream signal true throws ERR_INVALID_ARG_TYPE', run: () => signalTypeError(true), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: 'The "options.signal" property must be an instance of AbortSignal. Received type boolean (true)' } },
  { name: 'fs.createReadStream signal null throws ERR_INVALID_ARG_TYPE', run: () => signalTypeError(null), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: 'The "options.signal" property must be an instance of AbortSignal. Received null' } },
  { name: 'fs.createReadStream signal {} throws ERR_INVALID_ARG_TYPE', run: () => signalTypeError({}), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: 'The "options.signal" property must be an instance of AbortSignal. Received an instance of Object' } },
  { name: 'fs.createReadStream signal function throws ERR_INVALID_ARG_TYPE', run: () => { function namedSignal() {} return signalTypeError(namedSignal) }, expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: 'The "options.signal" property must be an instance of AbortSignal. Received function namedSignal' } },
)

sharedCases.push(
  { name: 'fs.createReadStream signal { aborted: false } without addEventListener throws a TypeError', run: () => signalTypeError({ aborted: false }), expected: { name: 'TypeError', message: 'signal.addEventListener is not a function' } },
  { name: 'fs.createReadStream signal { aborted: false, addEventListener: 1 } throws a TypeError', run: () => signalTypeError({ aborted: false, addEventListener: 1 }), expected: { name: 'TypeError', message: 'signal.addEventListener is not a function' } },
)

sharedCases.push(
  { name: 'fs.createReadStream signal { aborted: true } emits ABORT_ERR AbortError then close', run: async () => { const { file } = await streamFile('aborted-shape.txt', 'abcdefghij'); return streamEvents(s.fs.createReadStream(file, { signal: { aborted: true } })) }, expected: ['error ABORT_ERR AbortError', 'close'] },
)

const streamOptionThrow = (options) => {
  try { s.fs.createReadStream('/tmp/never-read-range', options) } catch (error) { return { code: error.code, name: error.name, message: error.message } }
  return 'no throw'
}
sharedCases.push(
  { name: 'fs.createReadStream start -1 throws ERR_OUT_OF_RANGE RangeError', run: () => streamOptionThrow({ start: -1 }), expected: { code: 'ERR_OUT_OF_RANGE', name: 'RangeError', message: 'The value of "start" is out of range. It must be >= 0 && <= 9007199254740991. Received -1' } },
  { name: 'fs.createReadStream end before start throws ERR_OUT_OF_RANGE RangeError', run: () => streamOptionThrow({ start: 5, end: 2 }), expected: { code: 'ERR_OUT_OF_RANGE', name: 'RangeError', message: 'The value of "start" is out of range. It must be <= "end" (here: 2). Received 5' } },
  { name: 'fs.createReadStream start 1.5 throws ERR_OUT_OF_RANGE RangeError', run: () => streamOptionThrow({ start: 1.5 }), expected: { code: 'ERR_OUT_OF_RANGE', name: 'RangeError', message: 'The value of "start" is out of range. It must be an integer. Received 1.5' } },
  { name: 'fs.createReadStream start Infinity throws ERR_OUT_OF_RANGE RangeError', run: () => streamOptionThrow({ start: Infinity }), expected: { code: 'ERR_OUT_OF_RANGE', name: 'RangeError', message: 'The value of "start" is out of range. It must be an integer. Received Infinity' } },
  { name: 'fs.createReadStream start "1" throws ERR_INVALID_ARG_TYPE TypeError', run: () => streamOptionThrow({ start: '1' }), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: 'The "start" argument must be of type number. Received type string (\'1\')' } },
  { name: 'fs.createReadStream start null throws ERR_INVALID_ARG_TYPE TypeError', run: () => streamOptionThrow({ start: null }), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: 'The "start" argument must be of type number. Received null' } },
  { name: 'fs.createReadStream end -1 throws ERR_OUT_OF_RANGE RangeError', run: () => streamOptionThrow({ end: -1 }), expected: { code: 'ERR_OUT_OF_RANGE', name: 'RangeError', message: 'The value of "end" is out of range. It must be >= 0 && <= 9007199254740991. Received -1' } },
  { name: 'fs.createReadStream end 1.5 throws ERR_OUT_OF_RANGE RangeError', run: () => streamOptionThrow({ end: 1.5 }), expected: { code: 'ERR_OUT_OF_RANGE', name: 'RangeError', message: 'The value of "end" is out of range. It must be an integer. Received 1.5' } },
  { name: 'fs.createReadStream end "9" throws ERR_INVALID_ARG_TYPE TypeError', run: () => streamOptionThrow({ end: '9' }), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: 'The "end" argument must be of type number. Received type string (\'9\')' } },
  { name: 'fs.createReadStream end Infinity reads to the end', run: async () => { const { file } = await streamFile('rng.txt', 'abcdefghij'); return readStreamText(s.fs.createReadStream(file, { end: Infinity })) }, expected: 'abcdefghij' },
  { name: 'fs.createReadStream start equal to end reads one byte', run: async () => { const { file } = await streamFile('rng.txt', 'abcdefghij'); return readStreamText(s.fs.createReadStream(file, { start: 3, end: 3 })) }, expected: 'd' },
)

const writeOptionThrow = (options) => withScratch(async (dir) => {
  try { await s['fs-promises'].writeFile(dir + '/f', 'hello', options) } catch (error) { return { code: error.code, name: error.name, message: error.message } }
  return 'no throw'
})
const writeOptionText = (options) => withScratch(async (dir) => {
  await s['fs-promises'].writeFile(dir + '/f', 'hello', options)
  return String(await s['fs-promises'].readFile(dir + '/f', 'utf8'))
})
const writeMissingCodes = (options) => withScratch(async (dir) => {
  try { await s['fs-promises'].writeFile(dir + '/missing', 'hello', options) } catch (error) { return [error.code, error.name] }
  return 'no throw'
})
sharedCases.push(
  { name: 'fs.promises.writeFile flag rs+ on a missing file rejects with ENOENT', run: () => writeMissingCodes({ flag: 'rs+' }), expected: ['ENOENT', 'Error'] },
  { name: 'fs.promises.writeFile flag as writes the data', run: () => writeOptionText({ flag: 'as' }), expected: 'hello' },
  { name: 'fs.promises.writeFile flag as+ writes the data', run: () => writeOptionText({ flag: 'as+' }), expected: 'hello' },
  { name: 'fs.promises.writeFile mode zz throws ERR_INVALID_ARG_VALUE TypeError', run: () => writeOptionThrow({ mode: 'zz' }), expected: { code: 'ERR_INVALID_ARG_VALUE', name: 'TypeError', message: "The argument 'mode' must be a 32-bit unsigned integer or an octal string. Received 'zz'" } },
  { name: 'fs.promises.writeFile mode 0o600 throws ERR_INVALID_ARG_VALUE TypeError', run: () => writeOptionThrow({ mode: '0o600' }), expected: { code: 'ERR_INVALID_ARG_VALUE', name: 'TypeError', message: "The argument 'mode' must be a 32-bit unsigned integer or an octal string. Received '0o600'" } },
  { name: 'fs.promises.writeFile signal aborted rejects with AbortError', run: () => writeOptionThrow({ signal: abortedSignal() }), expected: { code: 'ABORT_ERR', name: 'AbortError', message: 'The operation was aborted' } },
  { name: 'fs.promises.writeFile signal 1 throws ERR_INVALID_ARG_TYPE TypeError', run: () => writeOptionThrow({ signal: 1 }), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: 'The "options.signal" property must be an instance of AbortSignal. Received type number (1)' } },
  { name: 'fs.promises.writeFile signal object with aborted false writes the data', run: () => writeOptionText({ signal: { aborted: false } }), expected: 'hello' },
  { name: 'fs.promises.writeFile flush true writes the data', run: () => writeOptionText({ flush: true }), expected: 'hello' },
  { name: 'fs.promises.writeFile flush yes throws ERR_INVALID_ARG_TYPE TypeError', run: () => writeOptionThrow({ flush: 'yes' }), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: "The \"options.flush\" property must be of type boolean. Received type string ('yes')" } },
)

const objectChunkThrow = (make) => {
  try { make() } catch (error) { return { code: error.code, name: error.name, message: error.message } }
  return 'no throw'
}
sharedCases.push(
  { name: 'stream.Readable objectMode with encoding passes a string push through as is', run: () => { const r = new s.stream.Readable({ read() {}, objectMode: true, encoding: 'hex' }); r.push('6869'); return r.read() }, expected: '6869' },
  { name: 'stream.Readable objectMode with encoding rejects an object push', run: () => objectChunkThrow(() => { const r = new s.stream.Readable({ read() {}, objectMode: true, encoding: 'hex' }); r.push({ a: 1 }) }), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: 'The "buf" argument must be an instance of Buffer, TypedArray, or DataView. Received an instance of Object' } },
  { name: 'stream.PassThrough objectMode with encoding rejects an object write', run: () => objectChunkThrow(() => { const p = new s.stream.PassThrough({ objectMode: true, encoding: 'hex' }); p.write({ a: 1 }) }), expected: { code: 'ERR_INVALID_ARG_TYPE', name: 'TypeError', message: 'The "buf" argument must be an instance of Buffer, TypedArray, or DataView. Received an instance of Object' } },
  { name: 'stream.Readable unshift with objectMode into an empty stream returns the object', run: () => { const r = new s.stream.Readable({ read() {}, objectMode: true }); const returned = r.unshift({ a: 1 }); return [returned, r.read()] }, expected: [true, { a: 1 }] },
  { name: 'stream.Readable unshift with objectMode puts the object in front of a pushed one', run: () => { const r = new s.stream.Readable({ read() {}, objectMode: true }); r.push({ b: 2 }); const returned = r.unshift({ a: 1 }); return [returned, r.read(), r.read()] }, expected: [true, { a: 1 }, { b: 2 }] },
)

const highWaterMarkEvents = async (options) => {
  const { file } = await streamFile('hwm.txt', 'abcdefghij')
  const got = []
  await new Promise((resolve) => {
    const stream = s.fs.createReadStream(file, options)
    stream.on('data', (chunk) => got.push('data ' + String(chunk)))
    stream.on('end', () => got.push('end'))
    stream.on('error', (error) => got.push('error ' + error.code + ' ' + error.name))
    stream.on('close', () => { got.push('close'); resolve() })
  })
  return got
}
const highWaterMarkErrorEvent = async (options) => {
  const { file } = await streamFile('hwm-error.txt', 'abcdefghij')
  return new Promise((resolve) => {
    let error = 'no error'
    const stream = s.fs.createReadStream(file, options)
    stream.on('error', (e) => { error = { code: e.code, name: e.name, message: e.message } })
    stream.on('close', () => resolve(error))
    stream.on('data', () => {})
  })
}
sharedCases.push(
  { name: 'fs.createReadStream highWaterMark 1e300 emits the size message with Node separators', run: () => highWaterMarkErrorEvent({ highWaterMark: 1e300 }), expected: { code: 'ERR_OUT_OF_RANGE', name: 'RangeError', message: 'The value of "size" is out of range. It must be >= 0 && <= 9007199254740991. Received 1e+_300' } },
  { name: 'fs.createReadStream highWaterMark 1e21 emits the size message with Node separators', run: () => highWaterMarkErrorEvent({ highWaterMark: 1e21 }), expected: { code: 'ERR_OUT_OF_RANGE', name: 'RangeError', message: 'The value of "size" is out of range. It must be >= 0 && <= 9007199254740991. Received 1e_+21' } },
  { name: 'fs.createReadStream highWaterMark 2^53 emits the size message with Node separators', run: () => highWaterMarkErrorEvent({ highWaterMark: 2 ** 53 }), expected: { code: 'ERR_OUT_OF_RANGE', name: 'RangeError', message: 'The value of "size" is out of range. It must be >= 0 && <= 9007199254740991. Received 9_007_199_254_740_992' } },
)

const highWaterMarkThrow = (highWaterMark) => {
  try { s.fs.createReadStream('/tmp/never-read-hwm', { highWaterMark }) } catch (error) { return { code: error.code, message: error.message } }
  return 'no throw'
}
sharedCases.push(
  { name: 'fs.createReadStream highWaterMark 0 reads nothing and ends', run: () => highWaterMarkEvents({ highWaterMark: 0 }), expected: ['end', 'close'] },
  { name: 'fs.createReadStream highWaterMark -1 throws ERR_INVALID_ARG_VALUE', run: () => highWaterMarkThrow(-1), expected: { code: 'ERR_INVALID_ARG_VALUE', message: "The property 'options.highWaterMark' is invalid. Received -1" } },
  { name: 'stream.Readable highWaterMark 0 push returns false', run: () => { const r = new s.stream.Readable({ read() {}, highWaterMark: 0 }); return [r.push(Buffer.from('ab')), r.push(Buffer.from('c'))] }, expected: [false, false] },
  { name: 'stream.Writable highWaterMark 0 write returns false', run: () => { const w = new s.stream.Writable({ highWaterMark: 0, write(chunk, enc, cb) {} }); return [w.write(Buffer.from('abc')), w.write(Buffer.from('d'))] }, expected: [false, false] },
  { name: 'stream.Readable highWaterMark 1e300 push returns true', run: () => { const r = new s.stream.Readable({ read() {}, highWaterMark: 1e300 }); return [r.push(Buffer.from('ab')), r.push(Buffer.from('c'))] }, expected: [true, true] },
  { name: 'stream.Writable highWaterMark 1e300 write returns true', run: () => { const w = new s.stream.Writable({ highWaterMark: 1e300, write(chunk, enc, cb) {} }); return [w.write(Buffer.from('abc')), w.write(Buffer.from('d'))] }, expected: [true, true] },
)

const highWaterMarkTypeError = (highWaterMark) => {
  try { s.fs.createReadStream('/tmp/never-read-hwm', { highWaterMark }) } catch (error) { return { code: error.code, name: error.name, message: error.message } }
  return 'no throw'
}
sharedCases.push(
  { name: 'fs.createReadStream highWaterMark 2^40 emits ERR_MEMORY_ALLOCATION_FAILED RangeError', run: () => highWaterMarkEvents({ highWaterMark: 2 ** 40 }), expected: ['error ERR_MEMORY_ALLOCATION_FAILED RangeError', 'close'] },
  { name: 'fs.createReadStream highWaterMark 1e300 emits ERR_OUT_OF_RANGE RangeError', run: () => highWaterMarkEvents({ highWaterMark: 1e300 }), expected: ['error ERR_OUT_OF_RANGE RangeError', 'close'] },
  { name: 'fs.createReadStream highWaterMark -1 throws a TypeError', run: () => highWaterMarkTypeError(-1), expected: { code: 'ERR_INVALID_ARG_VALUE', name: 'TypeError', message: "The property 'options.highWaterMark' is invalid. Received -1" } },
)

const readObjects = (stream) => new Promise((resolve) => {
  const got = []
  stream.on('data', (chunk) => got.push(typeof chunk + ':' + JSON.stringify(chunk)))
  stream.on('end', () => resolve(got))
})
sharedCases.push(
  { name: 'stream.Readable objectMode push returns follow a 16-object limit', run: () => { const r = new s.stream.Readable({ read() {}, objectMode: true }); const ret = []; for (let i = 0; i < 17; i++) ret.push(r.push({ i })); return { ret, length: r.readableLength } }, expected: { ret: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false, false], length: 17 } },
  { name: 'stream.Readable objectMode data events emit objects, numbers and strings', run: async () => { const r = new s.stream.Readable({ read() {}, objectMode: true }); r.push({ a: 1 }); r.push(7); r.push('s'); r.push(null); return readObjects(r) }, expected: ['object:{"a":1}', 'number:7', 'string:"s"'] },
  { name: 'stream.Readable objectMode read returns one object per call', run: () => { const r = new s.stream.Readable({ read() {}, objectMode: true }); r.push({ a: 1 }); r.push(2); const first = r.read(5); const second = r.read(); const third = r.read(); return [first, second, third, r.readableLength] }, expected: [{ a: 1 }, 2, null, 0] },
  { name: 'stream.Readable objectMode read on an empty stream returns null', run: () => { const r = new s.stream.Readable({ read() {}, objectMode: true }); return [r.read(), r.readableLength] }, expected: [null, 0] },
  { name: 'stream.Readable objectMode keeps a Buffer as one object', run: async () => { const r = new s.stream.Readable({ read() {}, objectMode: true }); r.push(Buffer.from('ab')); r.push(null); const got = []; r.on('data', (chunk) => got.push(typeof chunk + ':' + chunk.length)); await new Promise((resolve) => r.on('end', resolve)); return got }, expected: ['object:2'] },
  { name: 'stream.PassThrough objectMode round trips objects and numbers', run: async () => { const p = new s.stream.PassThrough({ objectMode: true }); const got = readObjects(p); const ret = [p.write({ a: 1 }), p.write(7)]; p.end(); return { ret, got: await got } }, expected: { ret: [true, true], got: ['object:{"a":1}', 'number:7'] } },
  { name: 'stream.Readable objectMode highWaterMark 2 push returns', run: () => { const r = new s.stream.Readable({ read() {}, objectMode: true, highWaterMark: 2 }); return [r.push({ a: 1 }), r.push({ a: 2 }), r.push({ a: 3 }), r.readableLength] }, expected: [true, false, false, 3] },
)

const errorOf = (run) => { try { run() } catch (error) { return { code: error.code, message: error.message } } return 'no throw' }
sharedCases.push(
  { name: 'stream.Readable highWaterMark -1 throws ERR_INVALID_ARG_VALUE', run: () => errorOf(() => new s.stream.Readable({ read() {}, highWaterMark: -1 })), expected: { code: 'ERR_INVALID_ARG_VALUE', message: "The property 'options.highWaterMark' is invalid. Received -1" } },
  { name: 'stream.Readable highWaterMark string 4 throws ERR_INVALID_ARG_VALUE', run: () => errorOf(() => new s.stream.Readable({ read() {}, highWaterMark: '4' })), expected: { code: 'ERR_INVALID_ARG_VALUE', message: "The property 'options.highWaterMark' is invalid. Received '4'" } },
  { name: 'stream.Readable highWaterMark 1.5 throws ERR_INVALID_ARG_VALUE', run: () => errorOf(() => new s.stream.Readable({ read() {}, highWaterMark: 1.5 })), expected: { code: 'ERR_INVALID_ARG_VALUE', message: "The property 'options.highWaterMark' is invalid. Received 1.5" } },
  { name: 'stream.Readable objectMode highWaterMark -2 throws ERR_INVALID_ARG_VALUE', run: () => errorOf(() => new s.stream.Readable({ read() {}, objectMode: true, highWaterMark: -2 })), expected: { code: 'ERR_INVALID_ARG_VALUE', message: "The property 'options.highWaterMark' is invalid. Received -2" } },
  { name: 'stream.Writable highWaterMark -1 throws ERR_INVALID_ARG_VALUE', run: () => errorOf(() => new s.stream.Writable({ write(chunk, enc, cb) { cb() }, highWaterMark: -1 })), expected: { code: 'ERR_INVALID_ARG_VALUE', message: "The property 'options.highWaterMark' is invalid. Received -1" } },
  { name: 'stream.PassThrough highWaterMark -1 throws ERR_INVALID_ARG_VALUE naming the readable side', run: () => errorOf(() => new s.stream.PassThrough({ highWaterMark: -1 })), expected: { code: 'ERR_INVALID_ARG_VALUE', message: "The property 'options.readableHighWaterMark' is invalid. Received -1" } },
  { name: 'fs.createReadStream highWaterMark -1 throws ERR_INVALID_ARG_VALUE', run: () => errorOf(() => s.fs.createReadStream('/tmp/gap-never-read', { highWaterMark: -1 })), expected: { code: 'ERR_INVALID_ARG_VALUE', message: "The property 'options.highWaterMark' is invalid. Received -1" } },
  { name: 'fs.createReadStream highWaterMark 2.5 throws ERR_INVALID_ARG_VALUE', run: () => errorOf(() => s.fs.createReadStream('/tmp/gap-never-read', { highWaterMark: 2.5 })), expected: { code: 'ERR_INVALID_ARG_VALUE', message: "The property 'options.highWaterMark' is invalid. Received 2.5" } },
  { name: 'stream.Readable highWaterMark 0 is accepted', run: () => errorOf(() => new s.stream.Readable({ read() {}, highWaterMark: 0 })), expected: 'no throw' },
)

export const gapCases = [
  { name: 'fs.readFileSync', run: () => s.fs.readFileSync('/etc/hostname') },
  { name: 'process.exitCode', run: () => proc.exitCode },
  { name: 'worker_threads.Worker', run: () => new s['worker-threads'].Worker('x') },
  { name: 'vm.Script', run: () => new s.vm.Script('1') },
  { name: 'child-process uid 1000', run: () => s['child-process'].spawn('id', ['-u'], { uid: '1000' }) },
  { name: 'child-process gid 1000', run: () => s['child-process'].spawn('id', ['-g'], { gid: '1000' }) },
  { name: 'child-process.spawn option detached', run: () => s['child-process'].spawn('true', [], { detached: true }) },
  { name: 'child-process stdio foo', run: () => s['child-process'].spawn('/bin/sh', ['-c', 'echo ok'], { stdio: 'foo' }) },
  { name: 'child-process maxBuffer abc', run: () => s['child-process'].execFile('/bin/sh', ['-c', 'echo ok'], { maxBuffer: 'abc' }, () => {}) },
  { name: 'child-process signal abc', run: () => s['child-process'].execFile('/bin/sh', ['-c', 'echo ok'], { signal: 'abc' }, () => {}) },
  { name: 'child-process killSignal 99', run: () => s['child-process'].execFile('/bin/sh', ['-c', 'exec sleep 5'], { timeout: 100, killSignal: 99 }, () => {}) },
  { name: 'child-process windowsHide yes', run: () => s['child-process'].execFile('/bin/sh', ['-c', 'echo ok'], { windowsHide: 'yes' }, () => {}) },
  { name: 'crypto.createHash outputLength abc', run: () => s.crypto.createHash('sha256', { outputLength: 'abc' }) },
  { name: 'crypto.createHash shake256', run: () => s.crypto.createHash('shake256', { outputLength: 8 }) },
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
