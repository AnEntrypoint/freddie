export function provideCmdline(ctx, host) {
  const snapshot = Object.freeze([...host.args])
  ctx.provide('cmdlineArgs', { get: () => snapshot })
  ctx.provide('appExit', host.exit)
}

export const internals = {
  stdout: process.stdout,
  stderr: process.stderr,
}

export const stdio = {
  stdin: process.stdin,
}

export function exitOnStdinEnd(ctx, label) {
  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error(`${label}: the launcher must provide ctx.appExit before the tree mounts`)
  }
  let ended = false
  const requestExit = () => {
    if (ended) return
    ended = true
    exit(0)
  }
  stdio.stdin.on('end', requestExit)
  ctx.effect(() => () => void stdio.stdin.off('end', requestExit), label)
}

export function parseCmdline(ctx, program) {
  const args = ctx.get('cmdlineArgs')
  const exit = ctx.get('appExit')
  if (args === undefined || exit === undefined) {
    throw new Error(`${program.name()}: the launcher must provide ctx.cmdlineArgs and ctx.appExit before the tree mounts`)
  }
  if (!hasAction(program)) {
    throw new Error(`${program.name()}: no command in the program declares an action; parseCmdline runs the invoked command's action on a successful parse, and app code there publishes its service`)
  }
  configureExitAndOutput(program)
  try {
    program.parse(args.get(), { from: 'user' })
  } catch (error) {
    if (!isCommanderError(error)) throw error
    exit(error.exitCode)
  }
}

function hasAction(command) {
  if (typeof command._actionHandler === 'function') return true
  return command.commands.some(hasAction)
}

function configureExitAndOutput(command) {
  command
    .exitOverride()
    .configureOutput({
      writeOut: text => void internals.stdout.write(text),
      writeErr: text => void internals.stderr.write(text),
    })
  for (const child of command.commands) configureExitAndOutput(child)
}

function isCommanderError(error) {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error
  return typeof candidate.code === 'string' && candidate.code.startsWith('commander.')
    && typeof candidate.exitCode === 'number'
}
