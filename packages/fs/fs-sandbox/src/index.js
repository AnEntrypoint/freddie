import { LocalFileSystem } from '@freddie/freddie-fs-local'
import { FsError } from '@freddie/freddie-fs'
import { writableRoots } from '@freddie/freddie-sandbox'
import { isPathUnder } from './containment.js'

export class SandboxedFileSystem extends LocalFileSystem {
  static inject = ['sandboxPolicy']

  defaultMode
  constructor(ctx, config) {
    super(ctx, config)
    this.defaultMode = ctx.sandboxPolicy.defaultMode
  }

  get sandboxMode() {
    return this.defaultMode
  }

  async writeText(
    target,
    content,
    expected,
    signal,
    sandboxPolicy,
  ) {
    return super.writeText(await this.checkedTarget(target, sandboxPolicy), content, expected, signal)
  }

  async editText(
    target,
    edit,
    expected,
    signal,
    sandboxPolicy,
  ) {
    return super.editText(await this.checkedTarget(target, sandboxPolicy), edit, expected, signal)
  }

  async checkedTarget(target, sandboxPolicy) {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
    const { mode } = policy
    if (mode === 'danger-full-access') return target
    if (mode === 'read-only') {
      throw new FsError(`cannot write "${target.displayPath}": file access denied under read-only mode`, 'FS_SANDBOX_DENIED')
    }
    const fresh = await this.resolve(target.displayPath)
    let contained = false
    for (const root of writableRoots(policy)) {
      if (await isPathUnder(fresh.targetKey, root)) {
        contained = true
        break
      }
    }
    if (!contained) {
      throw new FsError(`cannot write "${target.displayPath}": file access denied under workspace-write mode`, 'FS_SANDBOX_DENIED')
    }
    return fresh
  }
}

export default SandboxedFileSystem
