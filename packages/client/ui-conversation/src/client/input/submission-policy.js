import { createSnapshotStore } from '@freddie/freddie-client-runtime/client'
import { BUSY_ENTER_FIELD, DEFAULT_BUSY_ENTER_BEHAVIOR } from '../../submission-settings.js'

export { DEFAULT_BUSY_ENTER_BEHAVIOR } from '../../submission-settings.js'

export class ComposerSubmissionPolicy {
  constructor(host) {
    this.busyEnter = createSnapshotStore(DEFAULT_BUSY_ENTER_BEHAVIOR)
    this.host = host
    if (host !== undefined) {
      host.subscribe(() => { this.adopt(host) })
      this.adopt(host)
    }
  }

  resolve(running, gesture, steeringAvailable) {
    if (!running || !steeringAvailable) return 'queue'
    const preferred = this.busyEnter.getSnapshot()
    if (gesture === 'enter') return preferred
    return preferred === 'queue' ? 'steer' : 'queue'
  }

  setBusyEnter(behavior) {
    if (this.busyEnter.getSnapshot() === behavior) return
    this.busyEnter.set(behavior)
    void this.host?.set(BUSY_ENTER_FIELD, behavior)
  }

  adopt(host) {
    const section = host.getSnapshot().value
    if (section === undefined || this.busyEnter.getSnapshot() === section.busyEnter) return
    this.busyEnter.set(section.busyEnter)
  }
}
