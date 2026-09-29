import { errorChain } from '@freddie/freddie-llm'
import { SubagentError } from './error.js'

/**
 * One deployment capability installed into a continuable child's unpublished
 * creation context. It composes synchronously before publication and returns
 * the disposer for exactly that installation.
 * @callback SubagentSetupContribution
 * @param childCtx - the child's unpublished scoped context.
 * @returns the disposer revoking this installation.
 */

/**
 * One contribution's live registration.
 * @typedef {object} SubagentSetupRegistration
 * @property {SubagentSetupContribution} contribution - the registered installer.
 * @property {boolean} removed - whether this registration has been undone.
 * @property {Set<SubagentSetupInstallation>} installations - live installations of this contribution.
 */

/**
 * One contribution installed into one child context.
 * @typedef {object} SubagentSetupInstallation
 * @property {SubagentSetupRegistration} registration - the contribution this installation came from.
 * @property {object} childCtx - the child's unpublished scoped context.
 * @property {Function} dispose - the disposer returned by the contribution.
 * @property {boolean} released - whether this installation has already been released.
 * @property {SubagentProvisioningBatch|undefined} transaction - the open provisioning batch, while unpublished.
 */

/**
 * One child's provisioning batch.
 * @typedef {object} SubagentProvisioningBatch
 * @property {SubagentSetupInstallation[]} installations - installations composed during this batch.
 * @property {boolean} invalidated - whether a revoked contribution invalidated this batch before commit.
 */

function isRemoved(registration) {
  return registration.removed
}

export class SubagentActivationSetupRegistry {
  registrations = new Set()
  byChild = new Map()

  register(contribution) {
    const registration = { contribution, removed: false, installations: new Set() }
    this.registrations.add(registration)
    return () => {
      if (registration.removed) return
      registration.removed = true
      this.registrations.delete(registration)
      this.releaseAll([...registration.installations], 'contribution removal')
    }
  }

  apply(childCtx) {
    const state = { installations: [], invalidated: false }
    try {
      for (const registration of [...this.registrations]) {
        /* v8 ignore next -- only a synchronous re-entrant revocation of an
         * already-snapshotted registration reaches this guard. */
        if (registration.removed) continue
        const installation = {
          registration,
          childCtx,
          dispose: registration.contribution(childCtx),
          released: false,
          transaction: state,
        }
        registration.installations.add(installation)
        state.installations.push(installation)
        let indexed = this.byChild.get(childCtx)
        if (indexed === undefined) {
          indexed = new Set()
          this.byChild.set(childCtx, indexed)
        }
        indexed.add(installation)
        if (isRemoved(registration)) this.release(installation)
      }
    } catch (error) {
      try {
        this.releaseAll([...state.installations], 'setup rollback')
      } catch (releaseFailure) {
        /* v8 ignore next -- requires independent installer and rollback faults. */
        void releaseFailure
      }
      throw error
    }
    childCtx.effect(() => () => { this.releaseChild(childCtx) }, 'subagents.activationSetup()')
    return {
      commit: () => {
        if (state.invalidated) {
          throw new SubagentError(
            'a continuable-subagent setup contribution was revoked while this child was being built; '
            + 'the child was not established',
            'ACTIVATION_SETUP_REVOKED',
          )
        }
        for (const installation of state.installations) installation.transaction = undefined
      },
    }
  }

  releaseChild(childCtx) {
    const indexed = this.byChild.get(childCtx) ?? []
    this.releaseAll([...indexed], 'child scope disposal')
  }

  releaseAll(installations, during) {
    const failures = []
    for (const installation of installations) {
      try {
        this.release(installation)
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length === 0) return
    throw new SubagentError(
      `continuable-subagent setup ${during} failed to release ${failures.length} installation(s): `
      + failures.map(failure => errorChain(failure)).join('; '),
      'ACTIVATION_SETUP_RELEASE_FAILED',
    )
  }

  release(installation) {
    if (installation.released) return
    installation.released = true
    installation.registration.installations.delete(installation)
    const indexed = this.byChild.get(installation.childCtx)
    /* v8 ignore next 4 -- every live installation is indexed until this method removes it. */
    if (indexed !== undefined) {
      indexed.delete(installation)
      if (indexed.size === 0) this.byChild.delete(installation.childCtx)
    }
    if (installation.transaction !== undefined) installation.transaction.invalidated = true
    installation.dispose()
  }
}

export default SubagentActivationSetupRegistry
