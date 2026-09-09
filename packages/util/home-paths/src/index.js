/**
 * Shared filesystem path helpers for Freddie user data.
 *
 * @module @freddie/freddie-home-paths
 */

import { opendir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Directory name for the default Freddie home under the OS home. */
export const FREDDIE_HOME_DIR_NAME = '.freddie'

/** Stable user-facing display form for the default Freddie home. */
export const DEFAULT_FREDDIE_HOME_DISPLAY = `~/${FREDDIE_HOME_DIR_NAME}`

/** Environment variable that overrides the default Freddie home. */
export const FREDDIE_HOME_ENV = 'FREDDIE_HOME'

/**
 * Give a native filesystem watcher one canonical spelling of a path, even
 * when its final components do not exist yet. The deepest existing ancestor
 * is resolved through {@link realpath}; when a suffix is missing, that
 * ancestor is also proved to be an enumerable directory before the suffix is
 * restored. This prevents Windows from treating a regular-file ancestor as
 * ordinary absence, and prevents short-name aliases from being mixed with
 * long paths emitted by the native watcher backend.
 * @param path - Watch target or root, resolved against the current directory.
 * @returns the target with its existing ancestor canonicalized.
 * @throws when ancestor traversal encounters an error other than absence, or
 * the existing ancestor of a missing suffix is not an enumerable directory.
 */
export async function canonicalizeWatchPath(path) {
  let current = resolve(path)
  const missing = []
  while (true) {
    try {
      const canonical = await realpath(current)
      if (missing.length > 0) {
        // A Windows file-as-parent probe reports ENOENT. Opening the resolved
        // ancestor preserves the cross-platform directory requirement.
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

/**
 * Resolve the default Freddie home using Node's platform path rules.
 * @returns the absolute default harness home path.
 */
export function defaultFreddieHome() {
  return join(homedir(), FREDDIE_HOME_DIR_NAME)
}

/**
 * Expand supported tilde prefixes against the operating-system home.
 * @param path - configured path that may begin with `~`, `~/`, or `~\`.
 * @returns the expanded path, or the original value when no supported prefix is present.
 */
export function expandHomePath(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the single-root Freddie home.
 *
 * Precedence, highest first: an explicit configured path, `$FREDDIE_HOME`, then
 * `~/.freddie`. The harness keeps all user data under one root. An empty or
 * whitespace-only `$FREDDIE_HOME` is treated as unset, so a blank override never
 * resolves the home to the current working directory.
 * @param configured - explicit harness-home override, which has highest precedence.
 * @param env - environment mapping used to read `FREDDIE_HOME`.
 * @returns the normalized absolute harness home path.
 */
export function resolveFreddieHome(configured, env = process.env) {
  const fromEnv = env[FREDDIE_HOME_ENV]
  const selected = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : defaultFreddieHome())
  return resolve(expandHomePath(selected))
}

/**
 * Join path segments onto the resolved Freddie home.
 * @param segments - path segments appended to the Harness home; an empty list returns the home itself.
 * @returns the normalized absolute joined path.
 */
export function freddieHomePath(...segments) {
  return join(resolveFreddieHome(), ...segments)
}

/**
 * Describe a resolved harness home symbolically for user-facing display.
 *
 * It never returns an absolute machine path: the default home is labelled
 * `~/.freddie`, and any configured home is labelled `$FREDDIE_HOME`.
 * @param resolvedHome - the absolute path returned by {@link resolveFreddieHome}.
 * @returns `~/.freddie` for the default home, otherwise `$FREDDIE_HOME`.
 */
export function freddieHomeDisplay(resolvedHome) {
  return resolvedHome === resolve(defaultFreddieHome()) ? DEFAULT_FREDDIE_HOME_DISPLAY : `$${FREDDIE_HOME_ENV}`
}
