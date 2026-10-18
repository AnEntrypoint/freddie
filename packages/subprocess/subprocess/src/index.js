import { Service } from '@freddie/cordis'
import { FREDDIE_ENV_PREFIX } from './types.js'

export { FREDDIE_ENV_PREFIX } from './types.js'

export const SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i

export function scrubbedParentEnv() {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !SENSITIVE_ENV_PATTERN.test(key) && !key.toUpperCase().startsWith(FREDDIE_ENV_PREFIX)) env[key] = value
  }
  return env
}

export class SubprocessRuntime extends Service {
  constructor(ctx) {
    super(ctx, 'subprocess')
  }

  resolveExecutable(command, env, signal) {
    throw new Error('SubprocessRuntime.resolveExecutable is abstract and must be implemented by a concrete provider')
  }

  spawn(spec) {
    throw new Error('SubprocessRuntime.spawn is abstract and must be implemented by a concrete provider')
  }

  spawnTerminal(spec) {
    throw new Error('SubprocessRuntime.spawnTerminal is abstract and must be implemented by a concrete provider')
  }
}

export default SubprocessRuntime
