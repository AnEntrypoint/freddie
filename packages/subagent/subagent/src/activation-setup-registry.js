import { errorChain } from '@freddie/freddie-llm'
import { SubagentError } from './error.js'





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
    if (indexed !== undefined) {
      indexed.delete(installation)
      if (indexed.size === 0) this.byChild.delete(installation.childCtx)
    }
    if (installation.transaction !== undefined) installation.transaction.invalidated = true
    installation.dispose()
  }
}

export default SubagentActivationSetupRegistry
