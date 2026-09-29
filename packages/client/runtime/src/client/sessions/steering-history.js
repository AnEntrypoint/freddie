
export class SteeringHistory {
  inbox = {
    'next-turn': [],
    'next-step': [],
  }

  claimedNextStep = new Set()

  reset() {
    this.inbox['next-turn'] = []
    this.inbox['next-step'] = []
    this.claimedNextStep.clear()
  }

  apply(event) {
    if (event.type === 'agent/inbox/spliced') {
      this.applySplice(event.data)
      return false
    }
    if (event.type !== 'user/message') return false
    const id = event.data.id
    if (!this.claimedNextStep.delete(id)) return false
    return event.data.source.kind === 'user'
  }

  applySplice({ target, start, removedCount = 0, inserted, outcome }) {
    const removed = this.inbox[target].splice(start, removedCount, ...inserted)
    for (const identity of inserted) this.claimedNextStep.delete(identity.id)
    if (target !== 'next-step' || outcome === 'canceled') return
    for (const identity of removed) this.claimedNextStep.add(identity.id)
  }
}
