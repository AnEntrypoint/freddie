import { Service } from '@freddie/cordis'
import { settingsNamespace } from '@freddie/freddie-settings'

export const SHELL_SETTINGS_NAMESPACE = settingsNamespace('shell')

export { FREDDIE_ENV_PREFIX } from './types.js'
export { parseExitStatus } from './render.js'




export class ShellExecutor extends Service {
  constructor(ctx) {
    super(ctx, 'shell')
  }

  get sandboxMode() {
    return undefined
  }

  resolve(request) {
    throw new Error('not implemented')
  }

  run(spec) {
    throw new Error('not implemented')
  }

  start(spec) {
    throw new Error('not implemented')
  }
}

export default ShellExecutor
