import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, link, lstat, mkdir, open, readFile, realpath, readdir, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { TextDecoder } from 'node:util'
import { FsError, FsTargetKey, FsVersion } from '@freddie/freddie-fs'
import { copyFileDaclWin32, replaceFileWin32 } from './win32.js'

const BINARY_SAMPLE_BYTES = 8192
const DIFF_BASIS_READ_CHUNK_BYTES = 64 * 1024

function isENOENT(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isEEXIST(error) {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}

function isENOTDIR(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOTDIR'
}

function isAbortError(error) {
  return error instanceof Error && error.name === 'AbortError'
}

/* v8 ignore start -- composes secondary cleanup-failure messages, which require a filesystem/kernel fault after the primary failure. */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
/* v8 ignore stop */

function isPermissionError(error) {
  return error instanceof Error && 'code' in error && (error.code === 'EACCES' || error.code === 'EPERM')
}

function throwIfAborted(signal, verb) {
  if (signal?.aborted) throw new FsError(`${verb} aborted`, 'FS_ABORTED')
}

async function readFileAbortable(absolutePath, verb, signal) {
  try {
    return await readFile(absolutePath, signal ? { signal } : {})
  } catch (error) {
    /* v8 ignore next 2 -- a non-abort readFile rejection needs a permission/IO fault racing an open file. */
    if (!isAbortError(error)) throw error
    throw new FsError(`${verb} aborted`, 'FS_ABORTED')
  }
}

function versionOf(info) {
  return FsVersion(`${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`)
}






export async function resolveLocalTarget(cwd, path) {
  if (path.trim().length === 0) throw new FsError('file_path must be a non-empty string', 'FS_NOT_FOUND')
  const displayPath = resolve(cwd, path)
  try {
    return { displayPath, targetKey: FsTargetKey(await realpath(displayPath)) }
  } catch (error) {
    /* v8 ignore next -- Windows reports this case as ENOENT and repairs it in the ancestor walk below. */
    if (isENOTDIR(error)) throw new FsError(`cannot resolve "${displayPath}": a parent path segment is not a directory`, 'FS_NOT_FOUND')
    /* v8 ignore next -- non-ENOENT realpath failure needs a permission/IO fault; ENOENT falls through to ancestor resolution. */
    if (!isENOENT(error)) throw error
  }
  const missing = [basename(displayPath)]
  let ancestor = dirname(displayPath)
  while (true) {
    try {
      const realAncestor = await realpath(ancestor)
      /* v8 ignore start -- native Windows coverage exercises this repair; POSIX reports ENOTDIR before this point. */
      if (process.platform === 'win32') {
        const parentInfo = await stat(realAncestor)
        if (!parentInfo.isDirectory()) {
          throw new FsError(`cannot resolve "${displayPath}": a parent path segment is not a directory`, 'FS_NOT_FOUND')
        }
      }
      /* v8 ignore stop */
      return { displayPath, targetKey: FsTargetKey(join(realAncestor, ...missing)) }
    } catch (error) {
      /* v8 ignore next -- native Windows coverage exercises the FsError raised by the repair above. */
      if (error instanceof FsError) throw error
      /* v8 ignore next -- a non-ENOENT realpath failure needs a permission/IO fault. */
      if (!isENOENT(error)) throw error
      const parent = dirname(ancestor)
      /* v8 ignore next -- the filesystem root always realpaths, so the walk terminates before parent === ancestor. */
      if (parent === ancestor) return { displayPath, targetKey: FsTargetKey(displayPath) }
      missing.unshift(basename(ancestor))
      ancestor = parent
    }
  }
}

function pathType(info) {
  if (info.isFile()) return 'file'
  /* v8 ignore else -- Windows has no special-entry fixture for the non-directory branch. */
  if (info.isDirectory()) return 'directory'
  /* v8 ignore next -- the corresponding special-entry return is covered on POSIX. */
  return 'other'
}

function pathLinkType(info) {
  if (info.isSymbolicLink()) return 'symlink'
  return pathType(info)
}

async function probeStats(absolutePath, readStats) {
  try {
    return await readStats(absolutePath)
  } catch (error) {
    /* v8 ignore next -- a non-ENOENT/ENOTDIR metadata failure needs a permission/IO fault; surface it. */
    if (!isENOENT(error) && !isENOTDIR(error)) throw error
    return null
  }
}

export async function probe(absolutePath) {
  const info = await probeStats(absolutePath, path => stat(path, { bigint: true }))
  if (!info) return null
  return {
    version: versionOf(info),
    mode: Number(info.mode & 0o777n),
    type: pathType(info),
    size: Number(info.size),
  }
}

export async function probeNoFollow(absolutePath) {
  const info = await probeStats(absolutePath, path => lstat(path, { bigint: true }))
  if (!info) return null
  return {
    version: versionOf(info),
    mode: Number(info.mode & 0o777n),
    type: pathLinkType(info),
    size: Number(info.size),
  }
}


function listingIoError(displayPath, error) {
  /* v8 ignore next -- defensive pass-through for races where a child resolver has already produced a structured FsError. */
  if (error instanceof FsError) return error
  /* v8 ignore next -- requires the listed target/parent to disappear between successful preflight and listing/child resolution. */
  if (isENOENT(error) || isENOTDIR(error)) return new FsError(`cannot list "${displayPath}": not found`, 'FS_NOT_FOUND', { cause: error })
  /* v8 ignore next -- Windows chmod does not deny directory listing; POSIX covers permission translation. */
  if (isPermissionError(error)) return new FsError(`cannot list "${displayPath}": permission denied`, 'FS_PERMISSION_DENIED', { cause: error })
  return new FsError(`cannot list "${displayPath}": ${errorMessage(error)}`, 'FS_IO_ERROR', { cause: error })
}

async function resolveListedChildTarget(parent, name) {
  const identity = await resolveLocalTarget(parent.targetKey, name)
  return { displayPath: join(parent.displayPath, name), targetKey: identity.targetKey }
}

export async function listDirectory(target, signal) {
  throwIfAborted(signal, 'list')
  let info
  try {
    info = await probe(target.targetKey)
  } catch (error) {
    throw listingIoError(target.displayPath, error)
  }
  if (!info) throw new FsError(`cannot list "${target.displayPath}": not found`, 'FS_NOT_FOUND')
  if (info.type !== 'directory') throw new FsError(`cannot list "${target.displayPath}": not a directory`, 'FS_NOT_DIRECTORY')

  let entries
  try {
    entries = await readdir(target.targetKey, { withFileTypes: true, encoding: 'utf8' })
  } catch (error) {
    /* v8 ignore next -- requires permission/kernel failure from readdir after a successful directory stat. */
    throw listingIoError(target.displayPath, error)
  }
  throwIfAborted(signal, 'list')

  const result = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    throwIfAborted(signal, 'list')
    try {
      const childTarget = await resolveListedChildTarget(target, entry.name)
      const childInfo = await probe(childTarget.targetKey)
      result.push({
        name: entry.name,
        type: childInfo?.type ?? 'other',
        target: childTarget,
        ...(childInfo ? { version: childInfo.version } : {}),
        ...(childInfo?.type === 'file' ? { size: childInfo.size } : {}),
      })
    } catch (error) {
      throw listingIoError(join(target.displayPath, entry.name), error)
    }
    throwIfAborted(signal, 'list')
  }
  return result
}


function notTextError(verb, displayPath) {
  return new FsError(`cannot ${verb} "${displayPath}": invalid UTF-8 text`, 'FS_NOT_TEXT')
}

function decodeUtf8(buffer, verb, displayPath) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch (error) {
    /* v8 ignore next 2 -- TextDecoder({fatal}) only throws TypeError on invalid bytes; any other throw is an unreachable runtime fault. */
    if (!(error instanceof TypeError)) throw error
    throw notTextError(verb, displayPath)
  }
}

function decodeUtf8Stream(decoder, chunk, verb, displayPath) {
  try {
    return chunk ? decoder.decode(chunk, { stream: true }) : decoder.decode()
  } catch (error) {
    /* v8 ignore next 2 -- TextDecoder({fatal}) only throws TypeError on invalid bytes; any other throw is an unreachable runtime fault. */
    if (!(error instanceof TypeError)) throw error
    throw notTextError(verb, displayPath)
  }
}

async function statRegularFile(target, verb, signal) {
  throwIfAborted(signal, verb)
  let info
  try {
    info = await stat(target.targetKey)
  } catch (error) {
    /* v8 ignore next 2 -- a non-ENOENT stat failure needs a permission/IO fault; only the not-found path is reachable in tests. */
    if (!isENOENT(error)) throw error
    throw new FsError(`cannot ${verb} "${target.displayPath}": not found`, 'FS_NOT_FOUND')
  }
  if (!info.isFile()) throw new FsError(`cannot ${verb} "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
  return info
}

export async function readWholeText(target, signal) {
  await statRegularFile(target, 'read', signal)
  const raw = await readFileAbortable(target.targetKey, 'read', signal)
  throwIfAborted(signal, 'read')
  if (raw.subarray(0, BINARY_SAMPLE_BYTES).includes(0)) {
    throw new FsError(`cannot read "${target.displayPath}": binary file`, 'FS_NOT_TEXT')
  }
  return decodeUtf8(raw, 'read', target.displayPath)
}

export async function readWholeBytes(target, signal, maxBytes, internals = {}) {
  const info = await statRegularFile(target, 'read', signal)
  if (info.size > maxBytes) {
    throw new FsError(`cannot read "${target.displayPath}": ${info.size} bytes exceeds the ${maxBytes}-byte limit`, 'FS_TOO_LARGE')
  }
  await internals.inspectReadBytesAfterStat?.(target)
  const stream = createReadStream(target.targetKey, {
    end: maxBytes,
    ...signal ? { signal } : {},
  })
  const chunks = []
  let bytes = 0
  try {
    for await (const chunk of stream) {
      bytes += chunk.length
      if (bytes > maxBytes) {
        throw new FsError(`cannot read "${target.displayPath}": content exceeds the ${maxBytes}-byte limit`, 'FS_TOO_LARGE')
      }
      chunks.push(chunk)
    }
  } catch (error) {
    /* v8 ignore next 2 -- a mid-stream abort needs cancellation racing an active read; pre-abort is deterministic. */
    if (isAbortError(error)) throw new FsError('read aborted', 'FS_ABORTED')
    throw error
  }
  return Buffer.concat(chunks, bytes)
}

export async function* streamWholeText(target, signal) {
  await statRegularFile(target, 'read', signal)
  const stream = createReadStream(target.targetKey, signal ? { signal } : {})
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let sampledBytes = 0

  function scanBinarySample(chunk) {
    if (sampledBytes >= BINARY_SAMPLE_BYTES) return
    const sample = chunk.subarray(0, Math.min(chunk.length, BINARY_SAMPLE_BYTES - sampledBytes))
    if (sample.includes(0)) {
      throw new FsError(`cannot read "${target.displayPath}": binary file`, 'FS_NOT_TEXT')
    }
    sampledBytes += sample.length
  }

  try {
    for await (const chunk of stream) {
      scanBinarySample(chunk)
      yield decodeUtf8Stream(decoder, chunk, 'read', target.displayPath)
    }
    yield decodeUtf8Stream(decoder, undefined, 'read', target.displayPath)
  } catch (error) {
    /* v8 ignore next 4 -- mid-stream errors need an abort/IO fault racing the loop; pre-abort is caught by throwIfAborted. */
    if (isAbortError(error)) throw new FsError('read aborted', 'FS_ABORTED')
    throw error
  }
}


async function removeStagingDirOrThrow(stagingDir, originalError, removeStagingDir) {
  try {
    await removeStagingDir(stagingDir)
  } catch (cleanupError) {
    /* v8 ignore next 1 -- cleanup failure here needs a second filesystem fault after the primary write failure. */
    throw new FsError(`write failed (${errorMessage(originalError)}) and temp cleanup failed (${errorMessage(cleanupError)})`, 'FS_NOT_FOUND', { cause: originalError })
  }
  throw originalError
}

async function throwGuardedCreateFailure(error, absolutePath, displayPath, inspectPublicationTarget) {
  let existing
  try {
    existing = await inspectPublicationTarget(absolutePath)
  } catch (metadataError) {
    if (!isENOENT(metadataError) && !isENOTDIR(metadataError)) {
      throw new FsError(`cannot write "${displayPath}": ${errorMessage(metadataError)}`, 'FS_IO_ERROR', { cause: metadataError })
    }
  }

  if (existing !== undefined) {
    if (!existing.isFile()) {
      throw new FsError(`cannot write "${displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE', { cause: error })
    }
    throw new FsError(
      `cannot overwrite existing "${displayPath}" without reading it first`,
      'FS_NOT_OBSERVED',
      { cause: error },
    )
  }
  if (isEEXIST(error)) {
    throw new FsError(
      `cannot overwrite existing "${displayPath}" without reading it first`,
      'FS_NOT_OBSERVED',
      { cause: error },
    )
  }
  throw new FsError(`cannot write "${displayPath}": ${errorMessage(error)}`, 'FS_IO_ERROR', { cause: error })
}

export async function writeFileAtomic(absolutePath, content, mode, signal, internals = {}, createIfAbsent) {
  throwIfAborted(signal, 'write')
  const directory = dirname(absolutePath)
  await mkdir(directory, { recursive: true })

  throwIfAborted(signal, 'write')
  const stagingDirName = internals.tempDirName?.(absolutePath) ?? `.${basename(absolutePath)}.${process.pid}.${randomUUID()}.tmpdir`
  const stagingDir = join(directory, stagingDirName)
  const tempName = internals.tempName?.(absolutePath) ?? `${basename(absolutePath)}.tmp`
  const tempPath = join(stagingDir, tempName)
  const platform = internals.platform ?? process.platform
  const copyFileDacl = internals.copyFileDacl ?? copyFileDaclWin32
  const replaceFile = internals.replaceFile ?? replaceFileWin32
  const linkFile = internals.linkFile ?? link
  const inspectPublicationTarget = internals.inspectPublicationTarget
    ?? (path => lstat(path, { bigint: true }))
  const removeStagingDir = internals.removeStagingDir
    ?? (path => rm(path, { recursive: true, force: true }))
  let handle
  let stagingCreated = false
  try {
    await mkdir(stagingDir, { mode: 0o700 })
    stagingCreated = true
    await chmod(stagingDir, 0o700)

    handle = await open(tempPath, 'wx', 0o600)
    await handle.chmod(0o600)
    if (platform === 'win32' && mode !== undefined) {
      await copyFileDacl(absolutePath, tempPath)
    }
    await handle.writeFile(content, { encoding: 'utf8', ...signal ? { signal } : {} })
    await handle.sync()
    await internals.inspectTemp?.({ stagingDir, tempPath })
    if (mode !== undefined) await handle.chmod(mode)
    await handle.close()
    handle = undefined

    throwIfAborted(signal, 'write')
    if (createIfAbsent !== undefined) {
      try {
        await linkFile(tempPath, absolutePath)
      } catch (error) {
        await throwGuardedCreateFailure(error, absolutePath, createIfAbsent.displayPath, inspectPublicationTarget)
      }
    } else if (platform === 'win32' && mode !== undefined) {
      try {
        await replaceFile(absolutePath, tempPath)
      } catch (error) {
        if (!isENOENT(error)) throw error
        await rename(tempPath, absolutePath)
      }
    } else {
      await rename(tempPath, absolutePath)
    }
    try {
      await removeStagingDir(stagingDir)
    } catch (_committedStagingCleanupFailure) {
    }
  } catch (error) {
    /* v8 ignore next -- abort-mid-write needs a writeFile/signal race; the non-abort (rename/open) side is tested. */
    let failure = isAbortError(error) ? new FsError('write aborted', 'FS_ABORTED') : error
    /* v8 ignore next 8 -- reached only if writeFile/sync throws with the handle open (IO fault); close-failure is a double fault. */
    if (handle) {
      try {
        await handle.close()
      } catch (closeError) {
        failure = new FsError(`write failed (${errorMessage(failure)}) and temp close failed (${errorMessage(closeError)})`, 'FS_NOT_FOUND', { cause: failure })
      }
    }
    if (!stagingCreated) throw failure
    return removeStagingDirOrThrow(stagingDir, failure, removeStagingDir)
  }
}



function normalizeLineEndings(content) {
  return content.replaceAll('\r\n', '\n')
}

function detectLineEndings(raw) {
  const sample = raw.slice(0, 4096)
  const crlfCount = sample.split('\r\n').length - 1
  const lfCount = sample.split('\n').length - 1 - crlfCount
  return crlfCount > lfCount ? 'CRLF' : 'LF'
}

function restoreLineEndings(content, lineEndings) {
  return lineEndings === 'LF' ? content : normalizeLineEndings(content).split('\n').join('\r\n')
}

function countOccurrences(content, needle) {
  let count = 0
  let index = 0
  while (true) {
    const found = content.indexOf(needle, index)
    if (found === -1) return count
    count += 1
    index = found + needle.length
  }
}

export async function readForEdit(absolutePath, displayPath, signal) {
  throwIfAborted(signal, 'edit')
  const buffer = await readFileAbortable(absolutePath, 'edit', signal)
  throwIfAborted(signal, 'edit')
  if (buffer.includes(0)) throw new FsError(`cannot edit "${displayPath}": binary file`, 'FS_NOT_TEXT')
  const raw = decodeUtf8(buffer, 'edit', displayPath)
  return { content: normalizeLineEndings(raw), lineEndings: detectLineEndings(raw) }
}

export async function readTextForDiff(absolutePath, maxBytes, signal) {
  throwIfAborted(signal, 'read')
  try {
    const handle = await open(absolutePath, 'r')
    let buffer
    let total = 0
    let openedSize = 0
    try {
      throwIfAborted(signal, 'read')
      const info = await handle.stat()
      throwIfAborted(signal, 'read')
      if (!info.isFile()) return null
      if (info.size >= maxBytes) return null
      openedSize = info.size
      buffer = Buffer.allocUnsafe(openedSize + 1)
      while (total < buffer.length) {
        throwIfAborted(signal, 'read')
        const length = Math.min(buffer.length - total, DIFF_BASIS_READ_CHUNK_BYTES)
        const { bytesRead } = await handle.read(buffer, total, length, null)
        if (bytesRead === 0) break
        total += bytesRead
      }
    } finally {
      await handle.close()
    }
    throwIfAborted(signal, 'read')
    if (total !== openedSize) return null
    const basis = buffer.subarray(0, total)
    if (basis.includes(0)) return null
    try {
      return normalizeLineEndings(new TextDecoder('utf-8', { fatal: true }).decode(basis))
    } catch (error) {
      /* v8 ignore next 2 -- TextDecoder({fatal}) only throws TypeError on invalid bytes;
       * any other throw is an unreachable runtime fault. */
      if (!(error instanceof TypeError)) throw error
      return null
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    if (error instanceof Error && 'code' in error) return null
    throw error
  }
}

export function applyLiteralEdit(content, oldString, newString, replaceAll, displayPath) {
  const oldNorm = normalizeLineEndings(oldString)
  if (oldNorm.length === 0) {
    throw new FsError('old_string must be a non-empty string', 'FS_EDIT_NOT_FOUND')
  }
  const newNorm = normalizeLineEndings(newString)
  const replacements = countOccurrences(content, oldNorm)
  if (replacements === 0) {
    throw new FsError(`old_string was not found in "${displayPath}"`, 'FS_EDIT_NOT_FOUND')
  }
  if (!replaceAll && replacements > 1) {
    throw new FsError(`old_string matched ${replacements} times in "${displayPath}"; provide a more specific old_string or set replace_all to true`, 'FS_AMBIGUOUS_EDIT')
  }
  return { content: content.split(oldNorm).join(newNorm), replacements }
}

export { normalizeLineEndings, restoreLineEndings }
