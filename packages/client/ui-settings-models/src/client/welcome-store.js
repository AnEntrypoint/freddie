import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'
import {
  WELCOME_NOTICE_ACK_FIELD, WELCOME_NOTICE_VERSION,
} from '../onboarding-copy.js'

export function decodeWelcomeSection(section) {
  return typeof section === 'object' && section !== null && !Array.isArray(section)
    ? section
    : {}
}

function assertNever(_value) {
  throw new Error('unexpected welcome settings status')
}

export class WelcomeNoticeStore {
  store = createSnapshotStore({
    status: 'idle', acknowledged: false, error: null,
  })

  localAcknowledged = false
  saving = false
  following

  constructor(scope) {
    this.scope = scope
  }

  load() {
    this.following ??= this.scope.subscribe(() => { this.derive() })
    this.derive()
    return Promise.resolve()
  }

  async acknowledge() {
    if (this.scope.getSnapshot().mode === 'memory') {
      this.localAcknowledged = true
      this.derive()
      return true
    }
    this.saving = true
    this.store.update((state) => { state.status = 'saving'; state.error = null })
    try {
      await this.scope.set(WELCOME_NOTICE_ACK_FIELD, WELCOME_NOTICE_VERSION)
    } finally {
      this.saving = false
    }
    this.derive()
    const { acknowledged } = this.store.getSnapshot()
    if (!acknowledged) {
      this.store.update((state) => {
        state.status = 'error'
        state.error = 'the acknowledgement did not persist'
      })
    }
    return acknowledged
  }

  dispose() {
    this.following?.()
    this.following = undefined
  }

  derive() {
    if (this.saving) return
    const scope = this.scope.getSnapshot()
    if (scope.mode === 'memory') {
      this.store.update((state) => {
        state.status = 'ready'
        state.acknowledged = this.localAcknowledged
        state.error = null
      })
      return
    }
    switch (scope.status) {
      case 'loading':
        this.store.update((state) => { state.status = 'loading'; state.error = null })
        return
      case 'unavailable':
        this.store.update((state) => {
          state.status = 'error'
          state.acknowledged = false
          state.error = 'welcome acknowledgement settings are unavailable'
        })
        return
      case 'ready': {
        const acknowledged = scope.value?.[WELCOME_NOTICE_ACK_FIELD] === WELCOME_NOTICE_VERSION
        this.store.update((state) => {
          state.status = 'ready'
          state.acknowledged = acknowledged
          state.error = null
        })
        return
      }
      default: return assertNever(scope.status)
    }
  }
}
