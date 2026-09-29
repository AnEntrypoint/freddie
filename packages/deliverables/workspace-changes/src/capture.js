import { createHash } from 'node:crypto'
import { mkdir, open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BINARY_PROBE_BYTES = 8000

function isMissing(error) {
  return typeof error === 'object' && error !== null && error.code === 'ENOENT'
}

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
  await writeFile(file, bytes, { flag: 'wx' }).catch((error) => {
    if (error?.code !== 'EEXIST') throw error
  })
  return { kind: 'file', file, binary: bytes.subarray(0, BINARY_PROBE_BYTES).includes(0) }
}

export function sameCapture(a, b) {
  if (a.kind === 'absent' || b.kind === 'absent') return a.kind === b.kind
  return a.kind === 'file' && b.kind === 'file' && a.file === b.file
}

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

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
