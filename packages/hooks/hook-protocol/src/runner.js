import { parseHookOutput } from './codec.js'

export const DEFAULT_HOOK_TIMEOUT_MS = 600_000

export async function runHook(bash, hook, options, now) {
  const started = now()
  const timeoutMs = hook.timeoutSec !== undefined ? hook.timeoutSec * 1000 : options.defaultTimeoutMs
  const stdin = JSON.stringify(options.payload) + (options.trailingNewline ? '\n' : '')

  const request = {
    command: hook.command,
    timeoutMs,
    stdin,
    signal: options.signal,
    ...options.cwd !== undefined ? { workdir: options.cwd } : {},
    ...options.env !== undefined ? { env: options.env } : {},
  }

  try {
    const result = await bash.run(bash.resolve(request))
    const exitCode = result.exitCode ?? undefined
    return {
      output: parseHookOutput(exitCode, result.stdout.text, result.stderr.text, options.expectedEventName),
      durationMs: now() - started,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      output: parseHookOutput(undefined, '', message),
      durationMs: now() - started,
    }
  }
}
