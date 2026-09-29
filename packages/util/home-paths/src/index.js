import { opendir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

export const FREDDIE_HOME_DIR_NAME = '.freddie'

export const DEFAULT_FREDDIE_HOME_DISPLAY = `~/${FREDDIE_HOME_DIR_NAME}`

export const FREDDIE_HOME_ENV = 'FREDDIE_HOME'

export async function canonicalizeWatchPath(path) {
  let current = resolve(path)
  const missing = []
  while (true) {
    try {
      const canonical = await realpath(current)
      if (missing.length > 0) {
        const directory = await opendir(canonical)
        await directory.close()
      }
      return join(canonical, ...missing.reverse())
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = dirname(current)
      /* v8 ignore next -- a filesystem root exists, so traversal resolves before this guard */
      if (parent === current) throw error
      missing.push(basename(current))
      current = parent
    }
  }
}

export function defaultFreddieHome() {
  return join(homedir(), FREDDIE_HOME_DIR_NAME)
}

export function expandHomePath(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

export function resolveFreddieHome(configured, env = process.env) {
  const fromEnv = env[FREDDIE_HOME_ENV]
  const selected = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : defaultFreddieHome())
  return resolve(expandHomePath(selected))
}

export function freddieHomePath(...segments) {
  return join(resolveFreddieHome(), ...segments)
}

export function freddieHomeDisplay(resolvedHome) {
  return resolvedHome === resolve(defaultFreddieHome()) ? DEFAULT_FREDDIE_HOME_DISPLAY : `$${FREDDIE_HOME_ENV}`
}
