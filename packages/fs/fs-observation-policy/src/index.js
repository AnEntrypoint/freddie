import { FsError } from '@freddie/freddie-fs'

class ObservedStateGate {
  observed = new WeakMap()

  owner(actor) {
    return actor?.agent?.session
  }

  get(owner, targetKey) {
    return this.observed.get(owner)?.get(targetKey)
  }

  set(owner, targetKey, observation) {
    let byTarget = this.observed.get(owner)
    if (!byTarget) {
      byTarget = new Map()
      this.observed.set(owner, byTarget)
    }
    byTarget.set(targetKey, observation)
  }

  clear() {
    this.observed = new WeakMap()
  }

  writeIntent(target, actor) {
    const owner = this.owner(actor)
    const prior = owner ? this.get(owner, target.targetKey) : undefined
    return prior?.kind === 'present'
      ? { kind: 'replaceIfVersion', version: prior.version }
      : { kind: 'createIfAbsent' }
  }

  editIntent(target, actor) {
    const owner = this.owner(actor)
    const prior = owner ? this.get(owner, target.targetKey) : undefined
    if (!owner || prior === undefined) {
      throw new FsError(`edit requires reading "${target.displayPath}" first`, 'FS_NOT_OBSERVED')
    }
    if (prior.kind === 'absent') {
      throw new FsError(`cannot edit "${target.displayPath}": not found`, 'FS_NOT_FOUND')
    }
    return { version: prior.version }
  }

  observe(target, observation, actor) {
    const owner = this.owner(actor)
    if (owner) this.set(owner, target.targetKey, observation)
  }
}

export const name = 'fs-observation-policy'

export function apply(ctx) {
  const gate = new ObservedStateGate()

  ctx.effect(() => () => {
    gate.clear()
  }, 'fs-observation-policy observed-state teardown')

  ctx.on('fs/write-intent', (target, actor) => Promise.resolve().then(() => gate.writeIntent(target, actor)))

  ctx.on('fs/edit-intent', (target, actor) => Promise.resolve().then(() => gate.editIntent(target, actor)))

  ctx.on('fs/observed', (target, observation, actor) => {
    gate.observe(target, observation, actor)
  })
}
