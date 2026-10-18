import { mkdir, opendir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, posix, resolve, win32 } from 'node:path'
import z from '@freddie/schemastery'
import {
  DirectoryPicker, DirectoryPickerError,
} from '@freddie/freddie-host-directory-picker'

function ancestryCrumbs(target) {
  const crumbs = []
  let current = target
  for (;;) {
    const parent = dirname(current)
    crumbs.unshift({ name: parent === current ? current : basename(current), path: current, hidden: false })
    if (parent === current) return crumbs
    current = parent
  }
}

export function fullyQualified(path, platform = process.platform) {
  return platform === 'win32'
    ? win32.isAbsolute(path) && /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/]+[^\\/]+)/.test(path)
    : posix.isAbsolute(path)
}

export function boundedInsert(window, candidate, keep) {
  if (window.length === keep && candidate.name.localeCompare(window[window.length - 1].name) >= 0) return true
  let lo = 0
  let hi = window.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (candidate.name.localeCompare(window[mid].name) < 0) hi = mid
    else lo = mid + 1
  }
  window.splice(lo, 0, candidate)
  if (window.length <= keep) return false
  window.pop()
  return true
}

export function raceAbort(operation, signal) {
  if (signal === undefined) return operation
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      operation.catch(() => {
      })
      reject(asError(signal.reason))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (reason) => {
        signal.removeEventListener('abort', onAbort)
        reject(asError(reason))
      },
    )
  })
}

function asError(reason) {
  return reason instanceof Error ? reason : new Error(String(reason))
}

function swallowCloseFailure() {}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

async function directoryRow(
  parent, name, isDirectory, isSymbolicLink, signal,
) {
  const path = join(parent, name)
  let enterable = isDirectory
  if (!enterable && isSymbolicLink) {
    try {
      enterable = (await raceAbort(stat(path), signal)).isDirectory()
    } catch {
      if (signal?.aborted) throw asError(signal.reason)
      return null
    }
  }
  if (!enterable) return null
  return { name, path, hidden: name.startsWith('.') }
}

export default class BrowseDirectoryPicker extends DirectoryPicker {
  static Config = z.object({
    maxEntries: z.natural().min(1).default(1000),
  })

  browseCapability = {
    kind: 'browse',
    list: (path, signal) => this.list(path, signal),
    createDirectory: (path, name) => this.createDirectory(path, name),
  }

  constructor(ctx, config) {
    super(ctx)
    this.config = config
  }

  capability() {
    return this.browseCapability
  }

  async list(path, signal) {
    const home = homedir()
    if (path !== undefined && !fullyQualified(path)) {
      throw new DirectoryPickerError('directory-unreadable', path, `cannot list "${path}": not a fully qualified path`)
    }
    const target = resolve(path ?? home)
    const keep = this.config.maxEntries + 1
    const window = []
    let evicted = false
    try {
      const opening = opendir(target)
      const level = await raceAbort(opening, signal).catch((error) => {
        void opening.then(dir => dir.close().catch(swallowCloseFailure), () => {
        })
        throw error
      })
      try {
        for (;;) {
          const dirent = await raceAbort(level.read(), signal)
          if (dirent === null) break
          if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue
          const candidate = { name: dirent.name, isDirectory: dirent.isDirectory(), isSymbolicLink: dirent.isSymbolicLink() }
          if (boundedInsert(window, candidate, keep)) evicted = true
        }
      } finally {
        const closing = level.close()
        if (signal?.aborted) {
          closing.catch(swallowCloseFailure)
        } else {
          await closing
        }
      }
    } catch (error) {
      signal?.throwIfAborted()
      throw new DirectoryPickerError('directory-unreadable', target, `cannot list ${target}: ${messageOf(error)}`)
    }
    const entries = []
    let truncated = evicted
    for (const candidate of window) {
      signal?.throwIfAborted()
      const row = await directoryRow(target, candidate.name, candidate.isDirectory, candidate.isSymbolicLink, signal)
      if (row === null) continue
      if (entries.length === this.config.maxEntries) {
        truncated = true
        break
      }
      entries.push(row)
    }
    return { path: target, home, crumbs: ancestryCrumbs(target), entries, truncated }
  }

  async createDirectory(path, name) {
    if (!fullyQualified(path)) {
      throw new DirectoryPickerError('directory-create-failed', path, `cannot create under "${path}": not a fully qualified parent path`)
    }
    const parent = resolve(path)
    if (name.trim() === '' || name === '.' || name === '..' || /[/\\]/.test(name)) {
      throw new DirectoryPickerError('directory-create-failed', join(parent, name), `"${name}" is not a single path segment`)
    }
    const target = join(parent, name)
    try {
      await mkdir(target)
      return target
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
        throw new DirectoryPickerError('directory-exists', target, `${target} already exists`)
      }
      throw new DirectoryPickerError('directory-create-failed', target, `cannot create ${target}: ${messageOf(error)}`)
    }
  }
}
