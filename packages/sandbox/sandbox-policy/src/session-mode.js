export const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access']

export function effectiveSandboxMode(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.type === 'sandbox/mode') return event.data.mode
  }
  return undefined
}

export function setSandboxMode(session, mode) {
  session.append('sandbox/mode', { mode })
}
