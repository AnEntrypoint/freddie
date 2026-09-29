/**
 * Event-only filesystem observation policy; it registers no service. A weak owner/target map
 * records every authoritative presence/absence observation, single-slot intent listeners derive
 * guards from that state, and the provider performs the atomic freshness/no-clobber check. Without
 * this plugin, tools retain the bare provider's unconditional mutation behavior. See the package
 * README for composition rules.
 * @module @freddie/freddie-fs-observation-policy
 */

import { FsError } from '@freddie/freddie-fs'

/**
 * Per-context observed-file state and the three `fs/*` decisions over it. One
 * instance is created per `apply()` so disposal can drop all state for HMR.
 */
class ObservedStateGate {
  /**
   * Observed-file state, keyed first by the owner object (weakly held, so a
   * collected session frees its state), then by the resolved `FsTarget`'s
   * `targetKey`. An
   * entry's presence is the prior-observation record; its discriminant keeps
   * confirmed absence distinct from an unseen target.
   */
  observed = new WeakMap()

  /**
   * Derive the observed-state owner from the opaque event actor — normally the
   * active agent session. `undefined` when no owner can be derived (e.g. a
   * direct tool call with no agent); such calls read freely but cannot satisfy
   * the write/edit prior-observation policy.
   */
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

  /** Drop all recorded state (HMR safety / disposal). */
  clear() {
    this.observed = new WeakMap()
  }

  /**
   * Decide the write intent: unseen or confirmed absent ⇒ `createIfAbsent`;
   * confirmed present ⇒ `replaceIfVersion` at the observed version.
   */
  writeIntent(target, actor) {
    const owner = this.owner(actor)
    const prior = owner ? this.get(owner, target.targetKey) : undefined
    return prior?.kind === 'present'
      ? { kind: 'replaceIfVersion', version: prior.version }
      : { kind: 'createIfAbsent' }
  }

  /**
   * Decide the edit version guard: unseen rejects with `FS_NOT_OBSERVED`,
   * confirmed absence rejects with `FS_NOT_FOUND`, and presence supplies the
   * observed version as the CAS basis.
   */
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

  /** Record an authoritative present or absent observation for this owner and target. */
  observe(target, observation, actor) {
    const owner = this.owner(actor)
    if (owner) this.set(owner, target.targetKey, observation)
  }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'fs-observation-policy'

/**
 * Register the three `fs/*` listeners. No `inject` — this plugin reads no
 * services; it operates only on its own `WeakMap`. The waterfalls are unbound
 * (the tool dispatches them with no `this`), so the listeners take the raw
 * `(target, actor, next)` arguments.
 */
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
