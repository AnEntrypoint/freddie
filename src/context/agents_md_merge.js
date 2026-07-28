import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

/**
 * Merge AGENTS.md files from the current directory up to the filesystem root.
 * Matches kimi's behavior: root→leaf merging, .kimi/AGENTS.md support.
 *
 * Each file's content is wrapped with a source annotation:
 * <!-- From: <path> -->
 * <content>
 *
 * Files are collected from root→leaf (parent first), so the most specific
 * (deepest) file is last and takes precedence for conflicting instructions.
 *
 * @param {string} cwd - starting directory
 * @param {object} [opts]
 * @param {number} [opts.maxDepth=10] - max directories to walk up
 * @returns {string} merged content, or empty string
 */
export function mergeAgentsMd(cwd, { maxDepth = 10 } = {}) {
  const parts = []
  const seen = new Set()
  let dir = resolve(cwd)
  let depth = 0

  while (dir && depth < maxDepth) {
    // Check .kimi/AGENTS.md first (kimi-specific), then standard variants
    for (const name of ['.kimi/AGENTS.md', 'AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md']) {
      const filePath = join(dir, name)
      if (seen.has(filePath)) continue
      try {
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8')
          if (content.trim()) {
            parts.unshift(`<!-- From: ${filePath} -->\n${content}`)
            seen.add(filePath)
          }
        }
      } catch { /* permission denied, missing, etc. — skip */ }
    }

    const parent = dirname(dir)
    if (parent === dir) break // reached filesystem root
    dir = parent
    depth++
  }

  return parts.join('\n\n')
}

/**
 * Browser-compatible variant: same logic but accepts a synchronous file reader
 * instead of node:fs. When called without arguments in a browser, returns ''.
 *
 * @param {string} cwd
 * @param {object} [opts]
 * @param {number} [opts.maxDepth=10]
 * @param {function} [opts.readFile] - (filePath) => string|null
 * @param {function} [opts.fileExists] - (filePath) => boolean
 * @param {function} [opts.resolvePath] - (path) => string
 * @param {function} [opts.dirname] - (path) => string
 * @param {function} [opts.joinPath] - (...parts) => string
 * @returns {string}
 */
export function mergeAgentsMdBrowser(cwd, {
  maxDepth = 10,
  readFile,
  fileExists,
  resolvePath,
  dirname: dirnameFn,
  joinPath,
} = {}) {
  if (!readFile || !fileExists || !resolvePath || !dirnameFn || !joinPath) return ''

  const parts = []
  const seen = new Set()
  let dir = resolvePath(cwd)
  let depth = 0

  while (dir && depth < maxDepth) {
    for (const name of ['.kimi/AGENTS.md', 'AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md']) {
      const filePath = joinPath(dir, name)
      if (seen.has(filePath)) continue
      try {
        if (fileExists(filePath)) {
          const content = readFile(filePath)
          if (content && content.trim()) {
            parts.unshift(`<!-- From: ${filePath} -->\n${content}`)
            seen.add(filePath)
          }
        }
      } catch { /* skip */ }
    }

    const parent = dirnameFn(dir)
    if (parent === dir) break
    dir = parent
    depth++
  }

  return parts.join('\n\n')
}