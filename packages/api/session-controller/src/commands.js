import { randomUUID } from 'node:crypto'
import { TypertLookupFailure } from '@freddie/freddie-typert-protocol'

export const SESSION_COMMAND_METHODS = [
  'create',
  'rename',
  'fork',
  'prompt',
  'attachment',
  'updateQueue',
  'cancel',
  'selectModel',
]

export class SessionCommandController {
  constructor(ctx) {
    this.ctx = ctx
  }

  gateway() {
    const proxy = this.ctx.get('apiProxy')
    const sessions = proxy === undefined || proxy === null ? undefined : proxy.sessions
    return typeof sessions === 'object' && sessions !== null ? sessions : undefined
  }

  absent(method) {
    return new TypertLookupFailure({
      code: 'session/commands-unavailable',
      message: `session.${method} is unavailable: this deployment mounts no session command gateway`,
      details: { method },
    })
  }

  async invoke(method, request) {
    const sessions = this.gateway()
    if (sessions === undefined || typeof sessions[method] !== 'function') {
      throw this.absent(method)
    }
    const answered = await sessions[method]({ rpcId: randomUUID(), payload: request })
    const outcome = answered === undefined || answered === null ? undefined : answered.result
    if (outcome?.ok === true) return outcome.value
    if (outcome?.ok === false) {
      const error = outcome.error ?? {}
      throw new TypertLookupFailure({
        code: typeof error.code === 'string' ? error.code : 'internal',
        message: typeof error.message === 'string' ? error.message : `session.${method} failed`,
        details: error.details ?? {},
      })
    }
    throw new TypertLookupFailure({
      code: 'internal',
      message: `session.${method} returned no outcome`,
      details: {},
    })
  }
}

export default SessionCommandController
