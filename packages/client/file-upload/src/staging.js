import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

const SESSION_LEAF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

const DIGEST_PATTERN = /^[0-9a-f]{64}$/

export class UploadStaging {
  constructor(root) {
    this.root = resolve(root)
  }

  sessionLeaf(sessionId) {
    if (typeof sessionId !== 'string') return undefined
    return SESSION_LEAF_PATTERN.test(sessionId) ? sessionId : undefined
  }

  assertContained(path) {
    const full = resolve(path)
    if (full === this.root || full.startsWith(this.root + sep)) return full
    throw new Error(`file-upload: refusing a staged path outside the staging root: ${full}`)
  }

  async sessionDir(sessionId) {
    const leaf = this.sessionLeaf(sessionId)
    if (leaf === undefined) return undefined
    const dir = this.assertContained(join(this.root, leaf))
    await mkdir(dir, { recursive: true })
    return dir
  }

  tempPath(dir) {
    return this.assertContained(join(dir, `${randomUUID()}.part`))
  }

  digestPath(sessionId, digest) {
    const leaf = this.sessionLeaf(sessionId)
    if (leaf === undefined || !DIGEST_PATTERN.test(digest)) return undefined
    return this.assertContained(join(this.root, leaf, `${digest}.bin`))
  }

  async remove(path) {
    await rm(this.assertContained(path), { force: true })
  }
}
