const OUTPUT_MAX_BYTES = 512 * 1024
const TERMINATION_GRACE_MS = 3_000

function text(value) {
  return value?.text ?? ''
}

function failure(command, result) {
  const output = text(result.collected.stdout?.finalize()).trim()
  const error = text(result.collected.stderr?.finalize()).trim()
  let message = error || output || `bsk ${command} failed`
  try {
    const parsed = JSON.parse(output)
    if (typeof parsed.message === 'string') {
      message = parsed.hint === undefined ? parsed.message : `${parsed.message} (hint: ${parsed.hint})`
    }
  } catch {
  }
  return new Error(`browserskill: ${message}`)
}

export async function runBsk(subprocess, command, args, signal, config, allowFailure = false) {
  const executable = await subprocess.resolveExecutable(config.bskPath, undefined, signal)
  const handle = subprocess.spawn({
    argv: [executable, ...args, '--json'],
    cwd: config.cwd,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: OUTPUT_MAX_BYTES },
      stderr: { maxBytes: OUTPUT_MAX_BYTES },
    },
    graceMs: TERMINATION_GRACE_MS,
    signal,
  })
  const outcome = await handle.done
  if (signal?.aborted) throw new Error('browserskill: command aborted')
  const output = text(handle.collected.stdout?.finalize()).trim()
  try {
    const parsed = JSON.parse(output)
    if (outcome.exitCode === 0 || allowFailure) return parsed
  } catch (error) {
    if (outcome.exitCode === 0) throw new Error(`browserskill: bsk ${command} did not return JSON`, { cause: error })
  }
  throw failure(command, handle)
}

export async function checkBsk(subprocess, signal, config) {
  return runBsk(subprocess, 'doctor', ['doctor'], signal, config, true)
}
