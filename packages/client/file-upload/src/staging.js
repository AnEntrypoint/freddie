/**
 * Host-owned staging layout for one deployment.
 *
 * Every destination below the root is derived here, from two inputs the host
 * produced itself: the validated session id and the SHA-256 digest of the
 * bytes that actually arrived. A client-supplied name is display-only and
 * never reaches a path. Each derived path is resolved and checked against the
 * root before it is used, so a future caller that changes the shape still
 * cannot write outside the staging tree.
 * @module @freddie/freddie-client-file-upload/staging
 */

import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/** Session ids allowed to name a staging directory: no separators, no dot-dot, no leading dot. */
const SESSION_LEAF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/** SHA-256 hex digests, and only those, may name a staged object. */
const DIGEST_PATTERN = /^[0-9a-f]{64}$/

/**
 * The staged-upload tree below `FREDDIE_HOME/uploads/v1`.
 */
export class UploadStaging {
  /** @param root - absolute staging root; resolved once so every check compares like for like. */
  constructor(root) {
    this.root = resolve(root)
  }

  /**
   * Validate one session id into a single safe directory name.
   * @param sessionId - the session the upload is addressed to.
   * @returns the leaf, or undefined when the id is not a bare safe name.
   */
  sessionLeaf(sessionId) {
    if (typeof sessionId !== 'string') return undefined
    return SESSION_LEAF_PATTERN.test(sessionId) ? sessionId : undefined
  }

  /**
   * Resolve one derived path and prove it stays inside the staging root.
   * Fails closed: an unexpected shape throws rather than writing.
   * @param path - a path built from validated components.
   * @returns the resolved absolute path.
   */
  assertContained(path) {
    const full = resolve(path)
    if (full === this.root || full.startsWith(this.root + sep)) return full
    throw new Error(`file-upload: refusing a staged path outside the staging root: ${full}`)
  }

  /**
   * Create and return the staging directory for one session.
   * @param sessionId - validated session id.
   * @returns the contained absolute directory, or undefined for an unsafe id.
   */
  async sessionDir(sessionId) {
    const leaf = this.sessionLeaf(sessionId)
    if (leaf === undefined) return undefined
    const dir = this.assertContained(join(this.root, leaf))
    await mkdir(dir, { recursive: true })
    return dir
  }

  /**
   * The intake file for one upload in progress. A random name, so a cancelled
   * or oversized intake can never collide with a committed object.
   * @param dir - contained session directory from {@link UploadStaging.sessionDir}.
   */
  tempPath(dir) {
    return this.assertContained(join(dir, `${randomUUID()}.part`))
  }

  /**
   * The committed, content-addressed destination for one upload.
   * @param sessionId - validated session id.
   * @param digest - SHA-256 hex digest of the staged bytes.
   * @returns the contained absolute path, or undefined for an unsafe input.
   */
  digestPath(sessionId, digest) {
    const leaf = this.sessionLeaf(sessionId)
    if (leaf === undefined || !DIGEST_PATTERN.test(digest)) return undefined
    return this.assertContained(join(this.root, leaf, `${digest}.bin`))
  }

  /**
   * Delete one staged object. The path is contained first, so a caller holding
   * an unexpected value still cannot reach outside the tree.
   * @param path - a path this layout produced.
   */
  async remove(path) {
    await rm(this.assertContained(path), { force: true })
  }
}
