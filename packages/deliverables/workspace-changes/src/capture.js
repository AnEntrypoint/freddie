/**
 * Whole-file captures around file-tool edits: the content of a path before
 * the turn's first mutation of it and at turn end, stored content-addressed
 * under the Session's temporary directory so both sides of a comparison
 * survive later edits without depending on git.
 *
 * @typedef {{ kind: 'absent' } | { kind: 'oversized' } | { kind: 'file'; file: string; binary: boolean }} Capture
 *   One captured side of a path: no file at the path; a regular file larger than the configured cap
 *   (content not stored); or a stored copy, named by the SHA-1 of its bytes.
 */
import { createHash } from 'node:crypto'
import { mkdir, open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Bytes git inspects for a NUL byte before treating content as binary. */
const BINARY_PROBE_BYTES = 8000

/** Whether a filesystem error names a missing path. */
function isMissing(error) {
  return typeof error === 'object' && error !== null && error.code === 'ENOENT'
}

/**
 * Store the current content of one path. At most `maxBytes + 1` bytes are
 * read, so a file that grows past the cap while it is read costs no more
 * memory than the cap.
 * @param {string} absolute - canonical absolute path of the file.
 * @param {string} directory - directory holding content-addressed copies; created when missing.
 * @param {number} maxBytes - inclusive byte cap on a stored copy.
 * @returns {Promise<Capture | undefined>} the capture, or undefined for a path that is neither absent nor a regular file.
 * @throws when the path cannot be opened or read for a reason other than absence, or the copy cannot be written.
 */
export async function captureFile(absolute, directory, maxBytes) {
  let handle
  try {
    handle = await open(absolute, 'r')
  } catch (error) {
    if (!isMissing(error)) throw error
    return { kind: 'absent' }
  }
  let bytes
  try {
    if (!(await handle.stat()).isFile()) return undefined
    const probe = Buffer.allocUnsafe(maxBytes + 1)
    let length = 0
    while (length < probe.length) {
      const { bytesRead } = await handle.read(probe, length, probe.length - length, length)
      if (bytesRead === 0) break
      length += bytesRead
    }
    if (length > maxBytes) return { kind: 'oversized' }
    bytes = probe.subarray(0, length)
  } finally {
    await handle.close()
  }
  const file = join(directory, createHash('sha1').update(bytes).digest('hex'))
  await mkdir(directory, { recursive: true })
  // Identical content across paths and turns shares one copy; `wx` keeps an existing copy as is.
  await writeFile(file, bytes, { flag: 'wx' }).catch((error) => {
    if (error?.code !== 'EEXIST') throw error
  })
  return { kind: 'file', file, binary: bytes.subarray(0, BINARY_PROBE_BYTES).includes(0) }
}

/**
 * Whether two captures are known to hold the same content. Two absent sides
 * are the same; two stored copies are the same when their bytes hash alike;
 * an oversized side is never known to match anything, since its content was
 * not read.
 * @param {Capture} a - one side.
 * @param {Capture} b - the other side.
 * @returns {boolean} true only when both sides are known to match.
 */
export function sameCapture(a, b) {
  if (a.kind === 'absent' || b.kind === 'absent') return a.kind === b.kind
  return a.kind === 'file' && b.kind === 'file' && a.file === b.file
}

/** A non-blank string, or undefined. */
function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * The path a first-party file-tool call is about to mutate: `write`, `edit`,
 * and the mutating `str_replace_editor` commands. Other tools, reads, and
 * incomplete arguments yield undefined.
 * @param {string} name - wire tool name.
 * @param {unknown} args - parsed call arguments.
 * @returns {string | undefined} the model-facing path, or undefined.
 */
export function mutationPath(name, args) {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined
  const record = args
  switch (name) {
    case 'write':
      return typeof record.content === 'string' ? text(record.file_path) : undefined
    case 'edit':
      return typeof record.old_string === 'string' && typeof record.new_string === 'string' ? text(record.file_path) : undefined
    case 'str_replace_editor':
      return record.command === 'create' || record.command === 'str_replace' || record.command === 'insert' ? text(record.path) : undefined
    default:
      return undefined
  }
}
