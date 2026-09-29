
import { Command } from 'commander'
import { exitOnStdinEnd, parseCmdline } from '@freddie/freddie-cmdline'

export const name = 'acp-startup'

export const inject = ['cmdlineArgs']

export const ACP_STARTUP_SERVICE = 'acpStartup'

function acpCommand() {
  return new Command()
    .name('freddie --profile acp')
    .description('Serve automation clients over Agent Client Protocol stdio.')
    .helpOption('-h, --help', 'show this help')
    .addHelpText('after', `
Example:
  freddie --profile acp     serve ACP until the client disconnects
`)
}

export function apply(ctx) {
  const program = acpCommand()
  program.action(() => {
    exitOnStdinEnd(ctx, 'acp-app.stdin')
    ctx.provide(ACP_STARTUP_SERVICE, { accepted: true })
  })
  parseCmdline(ctx, program)
}
