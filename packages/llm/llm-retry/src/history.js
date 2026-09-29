export function providerForOpenStep(events, turn, step) {
  const stepStartIndex = events.findLastIndex(event =>
    event.type === 'step/start'
    && event.data.turn === turn
    && event.data.step === step,
  )
  if (stepStartIndex < 0 || events.slice(stepStartIndex + 1).some(event =>
    event.type === 'step/end' || event.type === 'turn/end')) return undefined
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.type === 'request/header') return event.data.header.config.provider
  }
  return undefined
}
