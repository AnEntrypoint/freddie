
import { Command } from 'commander'
import Schema from '@freddie/schemastery'
import { exitOnStdinEnd, parseCmdline } from '@freddie/freddie-cmdline'

export const name = 'sdk-startup'

export const inject = ['cmdlineArgs']

export const SDK_STARTUP_SERVICE = 'sdkStartup'

export const Config = Schema.object({
  profile: Schema.string().default('sdk'),
})

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

export function apply(ctx, config) {
  const program = sdkCommand(config.profile)
  program.action(() => {
    exitOnStdinEnd(ctx, 'sdk-app.stdin')
    ctx.provide(SDK_STARTUP_SERVICE, { accepted: true })
  })
  parseCmdline(ctx, program)
}
