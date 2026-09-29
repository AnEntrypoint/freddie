/**
 * The ACP profile's command-line and stdin-lifetime provider. A successful
 * parse publishes {@link ACP_STARTUP_SERVICE}; the ACP bridge waits for that
 * service, so help starts no transport.
 * @module @freddie/freddie-acp-app/startup
 */

import { Command } from 'commander'
import { exitOnStdinEnd, parseCmdline } from '@freddie/freddie-cmdline'

/** Stable Cordis plugin name. */
export const name = 'acp-startup'

/** Service required before this app can parse its invocation. */
export const inject = ['cmdlineArgs']

/** Service the ACP bridge row waits for before claiming stdio. */
export const ACP_STARTUP_SERVICE = 'acpStartup'

/**
 * This app's command: zero options, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once.
 */
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

/**
 * Accept an ACP profile invocation, publish readiness, and bind EOF to the
 * launcher's bounded shutdown.
 * @param ctx - plugin context carrying the command line and exit request.
 */
export function apply(ctx) {
  const program = acpCommand()
  program.action(() => {
    exitOnStdinEnd(ctx, 'acp-app.stdin')
    ctx.provide(ACP_STARTUP_SERVICE, { accepted: true })
  })
  parseCmdline(ctx, program)
}
