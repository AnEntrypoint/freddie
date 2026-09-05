/**
 * Vocabulary for the filesystem Service Definition (`ctx.fs`): the opaque target/version
 * identities, the metadata `stat` returns, the write-intent and outcome shapes, the
 * literal-edit request/outcome, and the typed error taxonomy.
 * @module @freddie/freddie-fs/types
 */

import { HarnessError } from '@freddie/freddie-llm'

/**
 * Brand a string as an FsTargetKey. For backend use only — a consumer
 * never manufactures a key, it receives one from `resolve()`.
 * @param key - the backend's raw key string (the local backend passes a realpath).
 * @returns the same string, branded; no validation is performed.
 */
export function FsTargetKey(key) {
  return key
}

/**
 * Brand a string as an FsVersion. For backend use only — a consumer
 * never manufactures a version, it receives one from `stat`/write/edit outcomes.
 * @param v - the backend's raw version string.
 * @returns the same string, branded; no validation is performed.
 */
export function FsVersion(v) {
  return v
}

/**
 * Typed filesystem error. Extends {@link HarnessError} so it carries a stable
 * FsErrorCode and chains `cause`. `freddie-fs` owns this vocabulary so
 * backends and the policy layer raise the same codes instead of each inventing
 * message strings.
 */
export class FsError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
    this.code = code
  }
}
