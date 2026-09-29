function pendingInboxMessages(events) {
  const inbox = { 'next-turn': [], 'next-step': [] }
  for (const event of events) {
    if (event.type !== 'agent/inbox/spliced') continue
    const pending = inbox[event.data.target]
    pending.splice(event.data.start, event.data.removedCount ?? 0, ...event.data.inserted)
  }
  return [...inbox['next-turn'], ...inbox['next-step']]
}

export function messageAccepted(events, predicate) {
  return events.some(event => event.type === 'user/message' && predicate(event.data))
    || pendingInboxMessages(events).some(predicate)
}
