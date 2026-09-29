import { spawn } from 'node:child_process'

export async function reexecWithExposeInternals() {
  if (process.execArgv.includes('--expose-internals')) return
  const child = spawn(
    process.execPath,
    ['--expose-internals', ...process.execArgv, process.argv[1], ...process.argv.slice(2)],
    { stdio: 'inherit' },
  )
  const code = await new Promise((resolvePromise) => {
    child.on('exit', (exitCode, signal) => {
      if (signal !== null) {
        process.kill(process.pid, signal)
        return
      }
      resolvePromise(exitCode ?? 1)
    })
  })
  process.exit(code)
}
