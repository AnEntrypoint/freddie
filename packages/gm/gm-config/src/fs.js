import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

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
