import { stat } from 'node:fs/promises'
import { dirname, sep } from 'node:path'

const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR'])

function isMissing(error) {
  const code = error.code
  return MISSING_CODES.has(code)
}

function comparablePath(path, caseSensitive) {
  return caseSensitive ? path : path.toLowerCase()
}

function isLexicallyUnder(path, root, caseSensitive) {
  const comparableTarget = comparablePath(path, caseSensitive)
  const comparableRoot = comparablePath(root, caseSensitive)
  if (comparableTarget === comparableRoot) return true
  const prefix = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep
  return comparableTarget.startsWith(prefix)
}

async function statIfPresent(path) {
  try {
    return await stat(path, { bigint: true })
  } catch (error) {
    /* v8 ignore else -- a non-missing stat failure requires a host permission or I/O fault after resolve reached this ancestor. */
    if (isMissing(error)) return undefined
    /* v8 ignore next -- requires a host permission or I/O fault after resolve already reached this ancestor. */
    throw error
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
}

export async function isPathUnder(
  path,
  root,
  caseSensitive = process.platform !== 'win32',
) {
  if (isLexicallyUnder(path, root, caseSensitive)) return true

  const rootInfo = await statIfPresent(root)
  if (!rootInfo) return false

  let ancestor = path
  while (true) {
    const ancestorInfo = await statIfPresent(ancestor)
    if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo)) return true
    const parent = dirname(ancestor)
    if (parent === ancestor) return false
    ancestor = parent
  }
}
