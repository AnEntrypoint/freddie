import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function attempt(command, args, options = {}) {
  const result = spawnSync(command, [...args], { cwd: options.cwd, env: options.env, encoding: 'utf8' })
  if (result.error !== undefined) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

export function attemptEchoed(command, args, options = {}) {
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  if (result.error !== undefined) throw result.error
  if (result.stdout !== '') process.stdout.write(result.stdout)
  if (result.stderr !== '') process.stderr.write(result.stderr)
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

export function capture(command, args, options = {}) {
  const result = attempt(command, args, options)
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}:\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout.trim()
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, [...args], { cwd: options.cwd, env: options.env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
}

export function isEntry(moduleUrl) {
  const invoked = process.argv[1]
  if (invoked === undefined) return false
  return realpathSync(invoked) === realpathSync(fileURLToPath(moduleUrl))
}
