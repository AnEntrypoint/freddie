/**
 * The SDK profile's command-line and stdin-lifetime provider. A successful
 * parse publishes {@link SDK_STARTUP_SERVICE}; the JSON-RPC server waits for
 * that service, so help starts no transport.
 * @module @freddie/freddie-sdk-app/startup
 */

import { Command } from 'commander'
import Schema from '@freddie/schemastery'
import { exitOnStdinEnd, parseCmdline } from '@freddie/freddie-cmdline'

/** Stable Cordis plugin name. */
export const name = 'sdk-startup'

/** Service required before this app can parse its invocation. */
export const inject = ['cmdlineArgs']

/** Service the JSON-RPC server row waits for before claiming stdio. */
export const SDK_STARTUP_SERVICE = 'sdkStartup'

/** SDK stdio startup configuration. */
export const Config = Schema.object({
  profile: Schema.string().default('sdk'),
})

/**
 * This app's command: zero options, its description, and its help text.
 * @param profile - selected profile name rendered in the command grammar.
 * @returns a fresh program, so one process can parse more than once.
 */
function sdkCommand(profile) {
  return new Command()
    .name(`freddie --profile ${profile}`)
    .description('Serve Freddie SDK clients over stdio JSON-RPC.')
    .helpOption('-h, --help', 'show this help')
    .addHelpText('after', `
Example:
  freddie --profile ${profile}     serve one SDK runtime until its client disconnects
`)
}

/**
 * Accept an SDK profile invocation, publish readiness, and bind EOF to the
 * launcher's bounded shutdown.
 * @param ctx - plugin context carrying the command line and exit request.
 * @param config - selected profile identity for command help.
 */
export function apply(ctx, config) {
  const program = sdkCommand(config.profile)
  program.action(() => {
    exitOnStdinEnd(ctx, 'sdk-app.stdin')
    ctx.provide(SDK_STARTUP_SERVICE, { accepted: true })
  })
  parseCmdline(ctx, program)
}
