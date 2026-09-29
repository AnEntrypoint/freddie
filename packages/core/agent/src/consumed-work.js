function accountsForClaim(reason) {
  switch (reason.kind) {
    case 'completed':
      return false
    case 'blocked':
    case 'aborted':
    case 'interrupted':
    case 'error':
      return true
    /* v8 ignore next 4 -- unreachable: the one unnamed built-in, `max-tokens`, requires a step,
     * so its turn short-circuits as stepped before this call, and `TurnEndReasonMap` is
     * merge-extensible, so a backend-added variant cannot be listed; an unnameable ending over
     * consumed input must not read as success. */
    default:
      return true
  }
}

export function foldConsumedWork(events) {
  const stepped = new Set()
  const claimed = new Set()
  let open
  let end
  let droppedUnrun = false
  for (const event of events) {
    switch (event.type) {
      case 'turn/start':
        open = event.data.turn
        break
      case 'step/start':
        stepped.add(event.data.turn)
        break
      case 'agent/inbox/spliced': {
        const { removedCount, outcome, inserted } = event.data
        if (removedCount === undefined) break
        if (outcome === 'canceled') droppedUnrun ||= inserted.length === 0
        else if (open !== undefined) claimed.add(open)
        break
      }
      case 'turn/end': {
        const { turn, reason } = event.data
        open = undefined
        if (stepped.delete(turn) || (claimed.delete(turn) && accountsForClaim(reason))) {
          end = event
          droppedUnrun = false
        }
        break
      }
      default:
        break
    }
  }
  return { ...end === undefined ? {} : { end }, droppedUnrun }
}
