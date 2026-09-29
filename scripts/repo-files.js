import { globSync, readFileSync, realpathSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

export function isArchivedAgentNotePath(path) {
  return path.replaceAll('\\', '/').startsWith('.agents/notes/archived/')
}

export function uniqueRepoFiles(
  root,
  patterns,
  isExcluded = () => false,
) {
  const seen = new Set()
  const files = []
  for (const pattern of patterns) {
    for (const match of globSync(pattern, { cwd: root })) {
      const repoPath = match.split(sep).join('/')
      if (isExcluded(repoPath)) continue
      const abs = resolve(root, repoPath)
      const real = realpathSync(abs)
      if (seen.has(real)) continue
      seen.add(real)
      files.push({ abs, real })
    }
  }
  return files
}

export function findReferenceViolations(
  root,
  absPath,
  pattern,
  normalize,
  isViolation,
) {
  const file = relative(root, absPath).split(sep).join('/')
  const out = []
  const lines = readFileSync(absPath, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue
    for (const match of line.matchAll(pattern)) {
      const ref = normalize(match[0])
      if (isViolation(ref)) out.push({ file, line: i + 1, ref })
    }
  }
  return out
}
