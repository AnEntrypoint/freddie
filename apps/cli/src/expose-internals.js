/**
 * One-time re-exec so the `web` profile can launch Node with
 * `--expose-internals`, the flag cordis-plugin-hmr's module-reload service
 * requires (it hard-throws in its constructor without it) and which can only
 * be set at the original process launch, never at runtime.
 * @module @freddie/freddie/expose-internals
 */

import { spawn } from 'node:child_process'

/**
 * Re-spawn this exact invocation with `--expose-internals` added, then exit
 * with the child's code. A no-op when the flag is already present (the
 * re-spawned child re-enters this same check and must not loop).
 * @returns resolves only when no re-exec was needed; otherwise the process exits.
 */
export async function reexecWithExposeInternals() {
  if (process.execArgv.includes('--expose-internals')) return
  const child = spawn(
    process.execPath,
    ['--expose-internals', ...process.execArgv, process.argv[1], ...process.argv.slice(2)],
    { stdio: 'inherit' },
  )
  const code = await new Promise((resolvePromise) => {
    child.on('exit', (exitCode, signal) => {
      // A signal-terminated child (SIGINT/SIGTERM forwarded by the shell to
      // this whole process group) has no numeric code; re-raising the same
      // signal on this process reproduces the shell's usual 128+n reporting
      // instead of inventing an exit code that was never really produced.
      if (signal !== null) {
        process.kill(process.pid, signal)
        return
      }
      resolvePromise(exitCode ?? 1)
    })
  })
  process.exit(code)
}
