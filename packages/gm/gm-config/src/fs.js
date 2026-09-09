/**
  * Synchronous UTF-8 file reads for already-materialized gm-config files.
  * @module @freddie/freddie-gm-config/src/fs
  */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

/**
  * Read a UTF-8 file. Missing or unreadable paths return undefined.
  * @param path - absolute or relative path.
  * @returns file text, or undefined.
  */
export function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (error !== null && typeof error === 'object' && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return undefined
    }
    throw error
  }
}

/**
  * Operator home used by the user-wide spec tier: HOME, then USERPROFILE, then os.homedir().
  * @returns trimmed home directory without a trailing slash, or undefined.
  */
export function homeDir() {
  for (const key of ['HOME', 'USERPROFILE']) {
    const raw = process.env[key]
    if (typeof raw === 'string') {
      const t = raw.trim().replace(/[/\\]+$/, '')
      if (t !== '') return t
    }
  }
  const fallback = homedir()
  if (typeof fallback === 'string') {
    const t = fallback.trim().replace(/[/\\]+$/, '')
    if (t !== '') return t
  }
  return undefined
}
