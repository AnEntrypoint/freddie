
import { Command } from 'commander'
import { parseCmdline } from '@freddie/freddie-cmdline'

export const name = 'web-startup'

export const inject = ['cmdlineArgs']

export const WEB_STARTUP_SERVICE = 'webStartup'

function webCommand() {
  return new Command()
    .name('freddie --profile web')
    .description('Serve the Freddie browser UI.')
    .helpOption('-h, --help', 'show this help')
    .option('--host <host>', 'bind host')
    .option('--no-open', 'do not open the Web UI in the default browser')
    .option('--port <port>', 'listen port; pass 0 to let the OS pick a free one')
    .option('--trusted-host <authority...>', 'extra authority the /api browser-trust fence accepts (host or host:port; repeatable)')
    .addHelpText('after', `
Examples:
  freddie --profile web                          serve on the composed host and port
  freddie --profile web --no-open                serve without opening a browser
  freddie --profile web --port 8080              serve on another port
`)
}

export function apply(ctx) {
  const program = webCommand()
  program.action(() => {
    const options = program.opts()
    if (options.host === '0.0.0.0') {
      program.error('error: --host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead')
    }
    if (options.port !== undefined && (!/^\d+$/.test(options.port) || Number(options.port) > 65535)) {
      program.error(`error: --port must be a number from 0 to 65535, got ${JSON.stringify(options.port)}`)
    }
    ctx.provide(WEB_STARTUP_SERVICE, {
      openBrowser: options.open,
      ...options.host !== undefined && { host: options.host },
      ...options.port !== undefined && { port: Number(options.port) },
      trustedHosts: options.trustedHost ?? [],
    })
  })
  parseCmdline(ctx, program)
}
