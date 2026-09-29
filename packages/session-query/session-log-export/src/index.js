export const name = 'session-log-download'
export const inject = ['commands']

const REQUESTED = {
  kind: 'success',
  text: 'Session log download requested.',
}

export function apply(ctx) {
  ctx.effect(() => ctx.commands.register({
    name: 'export',
    description: 'Download this Session log as a ZIP archive',
    handler: invocation => Promise.resolve(invocation.rawInput.trim() === ''
      ? REQUESTED
      : { kind: 'error', text: 'The Web /export command does not accept a path.' }),
  }), 'session-log-download: command')
}
