import z from '@freddie/schemastery'
import { readdirSync } from 'node:fs'
import { open, mkdir, readFile, readdir, realpath, link, rm, stat, truncate } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { scheduler } from 'node:timers/promises'
import { randomBytes } from 'node:crypto'
import {
  DEFAULT_PREPARED_SESSION_CACHE_SIZE, DEFAULT_WRITE_BATCH_MAX_DELAY_MS, MAX_WRITE_BATCH_DELAY_MS,
  SessionPersistence, SessionPersistenceRevision, PersistenceCoordinator, SessionFormatUnsupportedError,
} from '@freddie/freddie-session-persistence'
import {
  encodeSegment, eventLines, logPath, logSuffix, parseHeaderMeta, projectDir, scanLog, sessionDir,
  SessionLogScanner, toHeaderLine,
} from './format.js'
import {
  compressZstdFrame, createZstdFrameDecoder, decompressZstdFrame, decompressZstdPrefix, scanZstdFrames,
} from './zstd.js'
import { ensureDurableDirectoryWin32, publishNewFileWin32 } from './win32.js'

export { logSuffix } from './format.js'

const DEFAULT_PACK_CHUNKS = true
const DEFAULT_COMPRESSION = 'zstd'
const ZSTD_DECODE_YIELD_INTERVAL_MS = 500

function assertZstdHeaderFrame(plaintext) {
  if (plaintext.length === 0 || plaintext.indexOf(0x0A) !== plaintext.length - 1) {
    throw new Error('corrupt Zstandard session log: first frame is not exactly one header line')
  }
}

export const JsonlCompressionSchema = z.union([
  z.const('zstd'),
  z.const('none'),
]).default(DEFAULT_COMPRESSION)

function fileRevision(identity) {
  return SessionPersistenceRevision([
    identity.dev,
    identity.ino,
    identity.size,
    identity.mtimeNs,
    identity.ctimeNs,
  ].join(':'))
}

function isENOENT(error) {
  return error?.code === 'ENOENT'
}

export class JsonlSessionPersistence extends SessionPersistence {
  supportsRawArtifacts = true

  static inject = ['sessions']

  static Config = z.object({
    root: z.string().required(),
    extraRoots: z.array(z.string()).default([]),
    packChunks: z.boolean().default(DEFAULT_PACK_CHUNKS),
    compression: JsonlCompressionSchema,
    preparedSessionCacheSize: z.number().step(1).min(1).default(DEFAULT_PREPARED_SESSION_CACHE_SIZE),
    writeBatchMaxDelayMs: z.number().step(1).min(1).max(MAX_WRITE_BATCH_DELAY_MS)
      .default(DEFAULT_WRITE_BATCH_MAX_DELAY_MS),
  })

  name = 'session-persistence-jsonl'

  root
  extraRoots
  packChunks
  compression
  coordinator
  rootEncodingCheck

  constructor(ctx, config) {
    super(ctx)
    this.config = config
    this.root = resolve(config.root)
    this.extraRoots = [...new Set((config.extraRoots ?? []).map(root => resolve(root)))]
      .filter(root => root !== this.root)
    const preparedSessionCacheSize = config.preparedSessionCacheSize
      ?? DEFAULT_PREPARED_SESSION_CACHE_SIZE
    const writeBatchMaxDelayMs = config.writeBatchMaxDelayMs
      ?? DEFAULT_WRITE_BATCH_MAX_DELAY_MS
    this.packChunks = config.packChunks ?? DEFAULT_PACK_CHUNKS
    this.compression = config.compression ?? DEFAULT_COMPRESSION
    this.assertUsableRoot()
    this.coordinator = new PersistenceCoordinator(this.ctx, this, {
      preparedSessionCacheSize,
      writeBatchMaxDelayMs,
    })
    this.ctx.effect(() => () => {
      if (this.writerLockPath === undefined) return
      const path = this.writerLockPath
      this.writerLockPath = undefined
      return rm(path, { force: true })
    }, 'jsonlSessionPersistence.writerLock()')
  }

  writerLockPath

  /* jscpd:ignore-start */

  locate(meta) {
    return { kind: 'jsonl', path: logPath(this.root, meta.cwd, meta.id, this.compression) }
  }

  create(meta) {
    return this.coordinator.create(meta)
  }

  append(id, events) {
    return this.coordinator.append(id, events)
  }

  prepare(id, signal) {
    return this.coordinator.prepare(id, signal)
  }

  load(id) {
    return this.coordinator.load(id)
  }

  inspect(id, signal) {
    return this.coordinator.inspect(id, signal)
  }

  readFrom(id, fromSeq, signal) {
    return this.coordinator.readFrom(id, fromSeq, signal)
  }

  /* jscpd:ignore-end */

  async loadStored(id, signal) {
    signal?.throwIfAborted()
    await this.ensureRootEncoding()
    signal?.throwIfAborted()
    const path = await this.findLog(id, signal)
    if (path === undefined) return undefined
    return this.readPrefix(path, id, signal)
  }

  async readStoredRevision(id, signal) {
    signal?.throwIfAborted()
    await this.ensureRootEncoding()
    signal?.throwIfAborted()
    const path = await this.findLog(id, signal)
    if (path === undefined) return undefined
    try {
      const identity = await stat(path, { bigint: true })
      signal?.throwIfAborted()
      return fileRevision(identity)
    } catch (error) {
      signal?.throwIfAborted()
      if (isENOENT(error)) return undefined
      throw error
    }
  }

  async readRaw(id, signal) {
    signal?.throwIfAborted()
    await this.ensureRootEncoding()
    signal?.throwIfAborted()
    const path = await this.findLog(id, signal)
    if (path === undefined) return undefined
    const { buffer } = await this.readStableFile(path, signal)
    let content
    if (this.compression === 'zstd') {
      const { frames } = scanZstdFrames(buffer)
      if (frames.length === 0) throw new Error('empty or header-less Zstandard session log')
      const decoder = createZstdFrameDecoder()
      const plaintexts = []
      for (const plaintext of decoder.decode(buffer, frames)) {
        signal?.throwIfAborted()
        plaintexts.push(Buffer.from(plaintext))
      }
      content = Buffer.concat(plaintexts).toString('utf8')
    } else {
      content = buffer.toString('utf8')
    }
    const meta = parseHeaderMeta(content.split('\n', 1)[0])
    if (meta === undefined || meta.id !== id) {
      throw new Error(`corrupt session log: invalid header line in "${path}"`)
    }
    return { meta, filename: 'session.jsonl', content }
  }

  async readStableFile(path, signal) {
    for (;;) {
      signal?.throwIfAborted()
      const before = fileRevision(await stat(path, { bigint: true }))
      const buffer = await readFile(path, { signal })
      signal?.throwIfAborted()
      const after = fileRevision(await stat(path, { bigint: true }))
      if (before === after) return { buffer, revision: after }
    }
  }

  async readPrefix(path, expectedId, signal) {
    const { buffer, revision } = await this.readStableFile(path, signal)
    let prefix
    try {
      if (this.compression === 'zstd') {
        prefix = await this.readZstdPrefix(buffer, signal)
      } else {
        signal?.throwIfAborted()
        const { meta, events, committedBytes } = scanLog(buffer)
        signal?.throwIfAborted()
        prefix = {
          meta,
          events,
          ...committedBytes < buffer.byteLength
            ? { tornMarker: { truncateTo: committedBytes, recoveredEvents: [] } }
            : {},
        }
      }
    } catch (error) {
      if (error instanceof SessionFormatUnsupportedError && error.location === undefined) {
        throw new SessionFormatUnsupportedError(`${error.message} (raw log: ${path})`, { kind: 'jsonl', path })
      }
      throw error
    }
    signal?.throwIfAborted()
    await this.assertStoredIdentity(path, prefix.meta, expectedId, signal)
    signal?.throwIfAborted()
    return { ...prefix, revision }
  }

  async readZstdPrefix(buffer, signal) {
    signal?.throwIfAborted()
    const { frames, tornStart } = scanZstdFrames(buffer)
    signal?.throwIfAborted()
    if (frames.length === 0) throw new Error('empty or header-less Zstandard session log')

    const decoder = createZstdFrameDecoder()
    let yieldDeadline = performance.now() + ZSTD_DECODE_YIELD_INTERVAL_MS
    try {
      const decodedFrames = decoder.decode(buffer, frames)
      signal?.throwIfAborted()
      const headerFrame = decodedFrames.next()
      signal?.throwIfAborted()
      /* v8 ignore next */
      if (headerFrame.done) throw new Error('empty or header-less Zstandard session log')
      assertZstdHeaderFrame(headerFrame.value)
      const scanner = new SessionLogScanner(headerFrame.value)

      let remainingFrames = frames.length - 1
      for (const plaintext of decodedFrames) {
        signal?.throwIfAborted()
        scanner.write(plaintext)
        remainingFrames -= 1
        if (remainingFrames > 0 && performance.now() >= yieldDeadline) {
          await scheduler.yield()
          signal?.throwIfAborted()
          yieldDeadline = performance.now() + ZSTD_DECODE_YIELD_INTERVAL_MS
        }
      }
      signal?.throwIfAborted()
      const complete = scanner.checkpoint()
      if (complete.committedBytes !== complete.inputBytes) {
        throw new Error('corrupt Zstandard session log: complete frame contains a torn JSONL record')
      }
      if (tornStart === undefined) {
        const prefix = scanner.finish()
        return { meta: prefix.meta, events: prefix.events }
      }

      let recoveredPlaintext = Buffer.alloc(0)
      try {
        signal?.throwIfAborted()
        recoveredPlaintext = await decompressZstdPrefix(buffer.subarray(tornStart))
      } catch {
        /* v8 ignore next */
        if (signal?.aborted) signal.throwIfAborted()
      }
      signal?.throwIfAborted()
      scanner.write(recoveredPlaintext)
      const recoveredPrefix = scanner.finish()
      signal?.throwIfAborted()
      return {
        meta: recoveredPrefix.meta,
        events: recoveredPrefix.events,
        tornMarker: {
          truncateTo: tornStart,
          recoveredEvents: recoveredPrefix.events.slice(complete.eventCount),
        },
      }
    } catch (error) {
      /* v8 ignore next */
      if (signal?.aborted) signal.throwIfAborted()
      throw error
    } finally {
      decoder.close()
    }
  }

  async appendBatch(meta, events, isMaterialized) {
    await this.ensureRootEncoding()
    if (isMaterialized) {
      await this.appendLines(meta, events)
    } else {
      await this.materialize(meta, events)
    }
  }

  async commitRepair(meta, tornMarker, closers) {
    if (tornMarker !== undefined) await this.repair(meta, tornMarker.truncateTo)
    const repairedEvents = [...(tornMarker?.recoveredEvents ?? []), ...closers]
    if (repairedEvents.length > 0) await this.appendLines(meta, repairedEvents)
  }

  async list(signal) {
    return (await this.listArtifacts(signal)).map(artifact => artifact.header)
  }

  async listForeign(root, signal) {
    signal?.throwIfAborted()
    const resolved = resolve(root)
    if (resolved === this.root) return this.list(signal)
    return (await this.listArtifactsAt(resolved, signal)).map(artifact => artifact.header)
  }

  async listSnapshots(signal) {
    const snapshots = []
    for (const artifact of await this.listArtifacts(signal)) {
      signal?.throwIfAborted()
      try {
        const identity = await stat(artifact.path, { bigint: true })
        signal?.throwIfAborted()
        snapshots.push({
          header: artifact.header,
          revision: fileRevision(identity),
        })
      } catch (error) {
        signal?.throwIfAborted()
        if (!isENOENT(error)) throw error
      }
    }
    signal?.throwIfAborted()
    return snapshots
  }

  async listArtifacts(signal) {
    signal?.throwIfAborted()
    await this.ensureRootEncoding()
    signal?.throwIfAborted()
    return this.listArtifactsAt(this.root, signal)
  }

  async listArtifactsAt(root, signal) {
    signal?.throwIfAborted()
    const artifacts = []
    const ids = new Set()
    for (const project of await this.listProjectDirsAt(root, signal)) {
      signal?.throwIfAborted()
      for (const dir of await this.listSessionDirs(project, signal)) {
        signal?.throwIfAborted()
        const opposite = join(dir, `session${logSuffix(this.oppositeCompression())}`)
        const oppositeExists = await this.exists(opposite)
        signal?.throwIfAborted()
        if (oppositeExists) throw this.encodingMismatch(opposite)
        const path = join(dir, `session${logSuffix(this.compression)}`)
        const pathExists = await this.exists(path)
        signal?.throwIfAborted()
        if (!pathExists) continue
        let first
        try {
          first = this.compression === 'zstd'
            ? await this.readFirstZstdLine(path, signal)
            : await this.readFirstLine(path, signal)
        } catch (error) {
          if (signal?.aborted) throw error
          this.ctx.logger.warn(`skipping unreadable session artifact "${path}": ${String(error.message ?? error)}`)
          continue
        }
        signal?.throwIfAborted()
        if (first === undefined) continue
        const meta = parseHeaderMeta(first)
        if (meta === undefined) continue
        await this.assertStoredIdentityAt(root, path, meta, undefined, signal)
        signal?.throwIfAborted()
        if (ids.has(meta.id)) {
          throw new Error(`duplicate JSONL session id "${meta.id}" appears in multiple project directories`)
        }
        ids.add(meta.id)
        artifacts.push({ header: meta, path })
      }
    }
    signal?.throwIfAborted()
    return artifacts
  }

  async materialize(meta, events) {
    const project = projectDir(this.root, meta.cwd)
    const dir = sessionDir(this.root, meta.cwd, meta.id)
    const finalPath = logPath(this.root, meta.cwd, meta.id, this.compression)
    await this.rejectOppositeArtifact(meta.cwd, meta.id)
    const content = await this.encodeMaterialization(meta, events)
    /* v8 ignore next */
    if (process.platform === 'win32') {
      await this.materializeWin32(project, dir, finalPath, meta.id, content)
    } else {
      await this.materializePosix(project, dir, finalPath, meta.id, content)
    }
  }

  /* v8 ignore start */
  async materializePosix(project, dir, finalPath, id, content) {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    await this.syncDirPosix(dirname(this.root))
    await mkdir(project, { recursive: true, mode: 0o700 })
    await this.syncDirPosix(this.root)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await this.syncDirPosix(project)
    await this.rejectExistingLog(finalPath, id)
    const tmp = await this.writeSyncedTempFile(finalPath, content)
    let linked = false
    try {
      await link(tmp, finalPath)
      linked = true
    } finally {
      /* v8 ignore next */
      if (!linked) await rm(tmp, { force: true })
    }
    await this.syncDirPosix(dir)
    try {
      await rm(tmp, { force: true })
    } catch {
      /* v8 ignore next */
    }
  }
  /* v8 ignore stop */

  /* v8 ignore start */
  async materializeWin32(project, dir, finalPath, id, content) {
    await ensureDurableDirectoryWin32(this.root)
    await ensureDurableDirectoryWin32(project)
    await ensureDurableDirectoryWin32(dir)
    await this.rejectExistingLog(finalPath, id)
    const tmp = await this.writeSyncedTempFile(finalPath, content)
    try {
      await publishNewFileWin32(tmp, finalPath)
    } catch (error) {
      await rm(tmp, { force: true })
      throw error
    }
  }
  /* v8 ignore stop */

  async rejectExistingLog(finalPath, id) {
    /* v8 ignore next 3 */
    if (await this.exists(finalPath)) {
      throw new Error(`refusing to materialize "${id}": a log already exists on disk (load/resume it instead)`)
    }
  }

  async writeSyncedTempFile(finalPath, content) {
    const tmp = `${finalPath}.${randomBytes(6).toString('hex')}.tmp`
    const handle = await open(tmp, 'wx', 0o600)
    try {
      await handle.writeFile(content)
      await handle.sync()
    } finally {
      await handle.close()
    }
    return tmp
  }

  async encodeMaterialization(meta, events) {
    const header = JSON.stringify(toHeaderLine(meta)) + '\n'
    const body = eventLines(events, this.packChunks) + '\n'
    if (this.compression === 'none') return header + body
    const headerFrame = await compressZstdFrame(header)
    const eventFrame = await compressZstdFrame(body)
    return Buffer.concat([headerFrame, eventFrame])
  }

  async encodeEventBatch(events) {
    const body = eventLines(events, this.packChunks) + '\n'
    return this.compression === 'zstd' ? compressZstdFrame(body) : body
  }

  /* v8 ignore start */
  async syncDirPosix(dir) {
    const handle = await open(dir, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  }
  /* v8 ignore stop */

  async appendLines(meta, events) {
    const content = await this.encodeEventBatch(events)
    const path = logPath(this.root, meta.cwd, meta.id, this.compression)
    const handle = await open(path, 'a')
    let closed = false
    const closeAppendHandle = async () => {
      if (closed) return
      closed = true
      await handle.close()
    }

    try {
      const { size: before } = await handle.stat()
      try {
        await handle.writeFile(content)
        await handle.sync()
      } catch (error) {
        try {
          await closeAppendHandle()
          await this.rollbackAppend(path, before)
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], `failed to roll back append to "${path}"`)
        }
        throw error
      }
    } finally {
      await closeAppendHandle()
    }
  }

  async rollbackAppend(path, size) {
    const handle = await open(path, 'r+')
    try {
      await handle.truncate(size)
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  async repair(meta, offset) {
    const path = logPath(this.root, meta.cwd, meta.id, this.compression)
    await truncate(path, offset)
    const handle = await open(path, 'r+')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  async readFirstLine(path, signal) {
    signal?.throwIfAborted()
    const handle = await open(path, 'r')
    try {
      signal?.throwIfAborted()
      const chunks = []
      const buf = Buffer.alloc(8192)
      for (;;) {
        signal?.throwIfAborted()
        const { bytesRead } = await handle.read(buf, 0, buf.length, null)
        signal?.throwIfAborted()
        if (bytesRead === 0) return undefined
        const slice = buf.subarray(0, bytesRead)
        const nl = slice.indexOf(0x0a)
        if (nl !== -1) {
          chunks.push(slice.subarray(0, nl))
          signal?.throwIfAborted()
          return Buffer.concat(chunks).toString('utf8')
        }
        chunks.push(Buffer.from(slice))
      }
    } finally {
      await handle.close()
    }
  }

  async readFirstZstdLine(path, signal) {
    signal?.throwIfAborted()
    const handle = await open(path, 'r')
    try {
      signal?.throwIfAborted()
      let content = Buffer.alloc(0)
      const chunk = Buffer.alloc(8192)
      for (;;) {
        signal?.throwIfAborted()
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
        signal?.throwIfAborted()
        if (bytesRead === 0) return undefined
        signal?.throwIfAborted()
        content = Buffer.concat([content, chunk.subarray(0, bytesRead)])
        signal?.throwIfAborted()
        const first = scanZstdFrames(content, 1).frames[0]
        signal?.throwIfAborted()
        if (first === undefined) continue
        let plaintext
        try {
          signal?.throwIfAborted()
          plaintext = await decompressZstdFrame(content.subarray(first.start, first.end))
        } catch (error) {
          /* v8 ignore next */
          if (signal?.aborted) signal.throwIfAborted()
          throw new Error('corrupt Zstandard session log: header frame failed validation', { cause: error })
        }
        signal?.throwIfAborted()
        assertZstdHeaderFrame(plaintext)
        return plaintext.subarray(0, -1).toString('utf8')
      }
    } finally {
      await handle.close()
    }
  }

  async findLog(id, signal) {
    const matches = []
    for (const project of await this.listProjectDirs(signal)) {
      signal?.throwIfAborted()
      await this.rejectLegacyFlatArtifact(project, id, signal)
      signal?.throwIfAborted()
      const dir = join(project, encodeSegment(id))
      const path = join(dir, `session${logSuffix(this.compression)}`)
      const opposite = join(dir, `session${logSuffix(this.oppositeCompression())}`)
      const oppositeExists = await this.exists(opposite)
      signal?.throwIfAborted()
      if (oppositeExists) throw this.encodingMismatch(opposite)
      const pathExists = await this.exists(path)
      signal?.throwIfAborted()
      if (pathExists) matches.push(path)
    }
    if (matches.length > 1) {
      throw new Error(`duplicate JSONL session id "${id}" appears in multiple project directories`)
    }
    signal?.throwIfAborted()
    return matches[0]
  }

  assertUsableRoot() {
    try {
      readdirSync(this.root)
    } catch (error) {
      if (isENOENT(error)) return
      throw error
    }
  }

  async assertStoredIdentity(path, meta, expectedId, signal) {
    return this.assertStoredIdentityAt(this.root, path, meta, expectedId, signal)
  }

  async assertStoredIdentityAt(root, path, meta, expectedId, signal) {
    signal?.throwIfAborted()
    if (expectedId !== undefined && meta.id !== expectedId) {
      throw new Error(`corrupt session log "${path}": requested id "${expectedId}" does not match header id "${meta.id}"`)
    }
    let expectedPath
    try {
      expectedPath = logPath(root, meta.cwd, meta.id, this.compression)
    } catch (error) {
      throw new Error(`corrupt session log "${path}": header id cannot name a storage path`, { cause: error })
    }
    if (path !== expectedPath && !await this.sameFile(path, expectedPath, signal)) {
      throw new Error(`corrupt session log "${path}": header id "${meta.id}" and cwd identify "${expectedPath}"`)
    }
    signal?.throwIfAborted()
  }

  async sameFile(path, expectedPath, signal) {
    signal?.throwIfAborted()
    try {
      const [actual, expected] = await Promise.all([realpath(path), realpath(expectedPath)])
      signal?.throwIfAborted()
      return actual === expected
    } catch (error) {
      signal?.throwIfAborted()
      /* v8 ignore else */
      if (isENOENT(error)) return false
      /* v8 ignore next */
      throw error
    }
  }

  async listProjectDirs(signal) {
    return this.listProjectDirsAt(this.root, signal)
  }

  async listProjectDirsAt(root, signal) {
    try {
      signal?.throwIfAborted()
      const entries = await readdir(root, { withFileTypes: true })
      signal?.throwIfAborted()
      return entries.filter(e => e.isDirectory()).map(e => join(root, e.name))
    } catch (error) {
      if (isENOENT(error)) return []
      throw error
    }
  }

  async listSessionDirs(project, signal) {
    signal?.throwIfAborted()
    const entries = await readdir(project, { withFileTypes: true })
    signal?.throwIfAborted()
    const legacy = entries.find(entry =>
      entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.jsonl.zstd')))
    if (legacy !== undefined) throw this.legacyLayout(join(project, legacy.name))
    return entries.filter(entry => entry.isDirectory()).map(entry => join(project, entry.name))
  }

  ensureRootEncoding() {
    this.rootEncodingCheck ??= this.checkRootEncoding()
    return this.rootEncodingCheck
  }

  async checkRootEncoding() {
    await this.claimWriterLock()
    for (const project of await this.listProjectDirs()) {
      for (const dir of await this.listSessionDirs(project)) {
        const incompatible = join(dir, `session${logSuffix(this.oppositeCompression())}`)
        if (await this.exists(incompatible)) throw this.encodingMismatch(incompatible)
      }
    }
  }

  async claimWriterLock() {
    const lockPath = join(this.root, '.writer.lock')
    const record = () => JSON.stringify({ pid: process.pid, since: Date.now() })
    await mkdir(this.root, { recursive: true })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(lockPath, 'wx')
        try {
          await handle.writeFile(record())
        } finally {
          await handle.close()
        }
        this.writerLockPath = lockPath
        return
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
        const holder = await this.readWriterLock(lockPath)
        if (holder !== undefined && this.processAlive(holder.pid)) {
          throw new Error(
            `session store at "${this.root}" is already held by pid ${holder.pid}. `
            + 'Two processes writing one store corrupt its session logs; stop the other one first.',
          )
        }
        await rm(lockPath, { force: true })
      }
    }
    throw new Error(`could not claim the session-store writer lock at "${lockPath}"`)
  }

  async readWriterLock(lockPath) {
    try {
      const parsed = JSON.parse(await readFile(lockPath, 'utf8'))
      return typeof parsed?.pid === 'number' ? parsed : undefined
    } catch {
      return undefined
    }
  }

  processAlive(pid) {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return error.code === 'EPERM'
    }
  }

  async rejectLegacyFlatArtifact(project, id, signal) {
    signal?.throwIfAborted()
    const encoded = encodeSegment(id)
    for (const compression of ['zstd', 'none']) {
      const path = join(project, encoded + logSuffix(compression))
      const artifactExists = await this.exists(path)
      signal?.throwIfAborted()
      if (artifactExists) throw this.legacyLayout(path)
    }
  }

  async rejectOppositeArtifact(cwd, id) {
    const path = logPath(this.root, cwd, id, this.oppositeCompression())
    if (await this.exists(path)) throw this.encodingMismatch(path)
  }

  oppositeCompression() {
    return this.compression === 'zstd' ? 'none' : 'zstd'
  }

  encodingMismatch(path) {
    return new Error(
      `session artifact ${JSON.stringify(path)} uses ${logSuffix(this.oppositeCompression())}, `
      + `but this backend is configured for compression ${JSON.stringify(this.compression)}; `
      + 'use a separate root or select the matching compression mode',
    )
  }

  legacyLayout(path) {
    return new Error(
      `session artifact ${JSON.stringify(path)} uses the unsupported flat-file layout; `
      + 'use a separate root or move it into a project/session directory before loading',
    )
  }

  async exists(path) {
    try {
      const handle = await open(path, 'r')
      await handle.close()
      return true
    } catch (error) {
      /* v8 ignore else */
      if (isENOENT(error)) {
        await this.assertLogParentAllowsAbsence(path)
        return false
      }
      /* v8 ignore next */
      throw error
    }
  }

  /* v8 ignore start */
  async assertLogParentAllowsAbsence(path) {
    try {
      const parent = dirname(path)
      const info = await stat(parent)
      if (info.isDirectory()) return
      const error = new Error(`ENOTDIR: parent path exists but is not a directory: ${parent}`)
      error.code = 'ENOTDIR'
      error.path = parent
      throw error
    } catch (error) {
      if (isENOENT(error)) return
      throw error
    }
  }
  /* v8 ignore stop */
}

export default JsonlSessionPersistence
