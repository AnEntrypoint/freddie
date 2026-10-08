
import { lstat, readdir } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export { activeAtToken, formatFileMention } from '@freddie/freddie-file-reference/grammar'

export const DEFAULT_FILE_SEARCH_MAX_RESULTS = 20
export const DEFAULT_FILE_SEARCH_MAX_ENTRIES = 10_000
export const DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES = ['.git', 'node_modules']

export class WorkspaceFileSearch {
  constructor(root, config) {
    this.root = root
    this.config = config
    this.generation = undefined
    this.disposed = false
    if (!Number.isSafeInteger(config.maxResults) || config.maxResults <= 0) {
      throw new Error('file search maxResults must be a positive safe integer')
    }
    if (!Number.isSafeInteger(config.maxEntries) || config.maxEntries <= 0) {
      throw new Error('file search maxEntries must be a positive safe integer')
    }
    if (config.excludedDirectories.some(name => name.length === 0 || name.includes('/') || name.includes('\\'))) {
      throw new Error('file search excludedDirectories entries must be non-empty directory basenames')
    }
    this.excludedDirectories = new Set(config.excludedDirectories)
  }

  async list(rawQuery, signal) {
    signal.throwIfAborted()
    if (this.disposed) return []
    const query = rawQuery.replaceAll('\\', '/')
    const slash = query.lastIndexOf('/')
    if (query === '' || slash >= 0) {
      const directory = slash < 0 ? '' : query.slice(0, slash + 1)
      const fragment = slash < 0 ? '' : query.slice(slash + 1)
      return this.listDirectory(directory, fragment, signal)
    }
    const indexed = await waitForPromise(this.ensureIndex(), signal)
    return rankCandidates(
      indexed.filter(candidate => visibleForGlobalQuery(candidate.path, query)),
      query,
      this.config.maxResults,
    )
  }

  invalidate() {
    this.generation?.controller.abort(new Error('file search index invalidated'))
    this.generation = undefined
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.invalidate()
  }

  ensureIndex() {
    if (this.generation !== undefined) return this.generation.promise
    const controller = new AbortController()
    const generation = {
      controller,
      promise: Promise.resolve([]),
    }
    generation.promise = this.scanWorkspace(controller.signal).catch((error) => {
      if (this.generation === generation) this.generation = undefined
      throw error
    })
    this.generation = generation
    return generation.promise
  }

  async scanWorkspace(signal) {
    const indexed = []
    const directories = [{ absolute: this.root, relative: '' }]
    for (let cursor = 0; cursor < directories.length && indexed.length < this.config.maxEntries; cursor += 1) {
      signal.throwIfAborted()
      const directory = directories[cursor]
      if (directory === undefined) {
        throw new Error('file search selected a missing directory')
      }
      const entries = await readDirectory(directory.absolute, signal)
      for (const entry of entries) {
        signal.throwIfAborted()
        const path = directory.relative === '' ? entry.name : `${directory.relative}/${entry.name}`
        if (entry.isDirectory()) {
          if (this.excludedDirectories.has(entry.name)) continue
          indexed.push({ path, kind: 'directory' })
          directories.push({ absolute: join(directory.absolute, entry.name), relative: path })
        } else if (entry.isFile()) {
          indexed.push({ path, kind: 'file' })
        }
        if (indexed.length >= this.config.maxEntries) break
      }
    }
    return indexed
  }

  async listDirectory(displayDirectory, fragment, signal) {
    if (displayDirectory.split('/').some(segment => this.excludedDirectories.has(segment))) return []
    const absolute = await resolveDisplayDirectory(this.root, displayDirectory, signal)
    if (absolute === undefined) return []
    const entries = await readDirectory(absolute, signal)
    const candidates = []
    for (const entry of entries) {
      if (entry.name.startsWith('.') && !fragment.startsWith('.')) continue
      if (entry.isDirectory()) {
        if (this.excludedDirectories.has(entry.name)) continue
        candidates.push({ path: `${displayDirectory}${entry.name}`, kind: 'directory' })
      } else if (entry.isFile()) {
        candidates.push({ path: `${displayDirectory}${entry.name}`, kind: 'file' })
      }
    }
    return rankCandidates(candidates, fragment, this.config.maxResults)
  }
}

async function resolveDisplayDirectory(root, displayDirectory, signal) {
  const resolvedRoot = resolve(root)
  const absolute = resolve(resolvedRoot, displayDirectory === '' ? '.' : displayDirectory)
  const fromRoot = relative(resolvedRoot, absolute)
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) return undefined
  if (isAbsolute(fromRoot)) return undefined
  let current = resolvedRoot
  for (const segment of fromRoot.split(sep).filter(Boolean)) {
    signal.throwIfAborted()
    current = join(current, segment)
    try {
      const status = await lstat(current)
      signal.throwIfAborted()
      if (status.isSymbolicLink() || !status.isDirectory()) return undefined
    } catch (_error) {
      signal.throwIfAborted()
      return undefined
    }
  }
  return absolute
}

async function readDirectory(absolute, signal) {
  signal.throwIfAborted()
  try {
    const entries = await readdir(absolute, { withFileTypes: true })
    signal.throwIfAborted()
    return entries.sort((left, right) => compareText(left.name, right.name))
  } catch (_error) {
    signal.throwIfAborted()
    return []
  }
}

function visibleForGlobalQuery(path, query) {
  if (query.startsWith('.') || query.includes('/.')) return true
  return !path.split('/').some(segment => segment.startsWith('.'))
}

function rankCandidates(candidates, query, limit) {
  const ranked = []
  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, query)
    if (score !== undefined) ranked.push({ candidate, score })
  }
  ranked.sort((left, right) =>
    right.score - left.score
    || kindRank(left.candidate.kind) - kindRank(right.candidate.kind)
    || (query === '' ? 0 : left.candidate.path.length - right.candidate.path.length)
    || compareText(left.candidate.path, right.candidate.path))
  return ranked.slice(0, limit).map(entry => entry.candidate)
}

function scoreCandidate(candidate, query) {
  if (query === '') return 0
  const path = candidate.path.toLowerCase()
  const name = path.slice(path.lastIndexOf('/') + 1)
  const needle = query.toLowerCase()
  const directoryBonus = candidate.kind === 'directory' ? 25 : 0
  if (name === needle) return 1_000 + directoryBonus
  if (name.startsWith(needle)) return 900 + directoryBonus
  if (name.includes(needle)) return 700 + directoryBonus
  if (path.includes(needle)) return 500 + directoryBonus
  const subsequence = subsequenceScore(path, needle)
  return subsequence === undefined ? undefined : 300 + subsequence + directoryBonus
}

function subsequenceScore(target, query) {
  let targetIndex = 0
  let gap = 0
  for (const character of query) {
    const found = target.indexOf(character, targetIndex)
    if (found < 0) return undefined
    gap += found - targetIndex
    targetIndex = found + 1
  }
  return Math.max(0, 100 - gap)
}

function kindRank(kind) {
  return kind === 'directory' ? 0 : 1
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function waitForPromise(promise, signal) {
  if (signal.aborted) return Promise.reject(errorReason(signal.reason, 'file search aborted'))
  return new Promise((resolvePromise, rejectPromise) => {
    const onAbort = () => { rejectPromise(errorReason(signal.reason, 'file search aborted')) }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolvePromise(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        rejectPromise(errorReason(error, 'file search index failed'))
      },
    )
  })
}

function errorReason(reason, fallback) {
  return reason instanceof Error ? reason : new Error(fallback, { cause: reason })
}
