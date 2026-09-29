
import { Command } from 'commander'
import { parseCmdline } from '@freddie/freddie-cmdline'

export const name = 'headless-startup'

export const inject = ['cmdlineArgs']

export const HEADLESS_STARTUP_SERVICE = 'headlessStartup'

function headlessCommand() {
  return new Command()
    .name('freddie --profile headless')
    .description('Answer one task, print the final assistant message, and exit.')
    .helpOption('-h, --help', 'show this help')
    .argument('[task...]', 'the task text; multiple words are joined by spaces')
    .addHelpText('after', `
Examples:
  freddie --profile headless "run the tests"     answer one task and exit
`)
}

export function apply(ctx) {
  const program = headlessCommand()
  program.action(() => {
    const task = program.args.join(' ')
    if (task.trim() === '') program.error('error: a task is required, for example: freddie --profile headless "run the tests"')
    ctx.provide(HEADLESS_STARTUP_SERVICE, { task })
  })
  parseCmdline(ctx, program)
}
