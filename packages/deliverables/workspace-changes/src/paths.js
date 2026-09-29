import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

export function toPosix(path) {
  return path.split(sep).join('/')
}

export function isInside(root, path) {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export async function temporaryRoots(candidates = ['/tmp', tmpdir()]) {
  const roots = new Set()
  for (const root of candidates) {
    roots.add(root)
    roots.add(await canonicalPath(root))
  }
  return [...roots]
}

export async function canonicalPath(path) {
  const missing = []
  let head = path
  for (;;) {
    try {
      return join(await realpath(head), ...missing)
    } catch {
      const parent = dirname(head)
      if (parent === head || dirname(parent) === parent) return path
      missing.unshift(basename(head))
      head = parent
    }
  }
}

export function isTemporaryPath(path, roots) {
  return roots.some(root => isInside(root, path))
}

export function displayPathOf(absolute, cwd, root, home) {
  if (isInside(cwd, absolute) || isInside(root, absolute)) return toPosix(relative(cwd, absolute))
  if (home !== '' && isInside(home, absolute)) return `~/${toPosix(relative(home, absolute))}`
  return toPosix(absolute)
}

export function durablePathOf(absolute, cwd) {
  return isInside(cwd, absolute) ? toPosix(relative(cwd, absolute)) : absolute
}

export function compareDisplay(a, b) {
  return a.display < b.display ? -1 : a.display > b.display ? 1 : 0
}
