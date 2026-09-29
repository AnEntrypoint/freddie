/**
 * Session commands this deployment already implements behind `ctx.apiProxy`.
 *
 * Every command here mutates live Agent state — it starts turns, cancels them,
 * edits the pending queue, forks and creates Sessions, or reads stored image
 * bytes. freddie implements all of that once, in the host API gateway
 * (`api.sessions.*`), which owns the Agent activation policy, the preset
 * conflict rules, the Workspace attach, and the attachment authorization.
 * Re-implementing them here would fork that policy, so the command half of the
 * Session Remote delegates to the gateway through `ctx.get`, which needs no
 * package dependency and therefore adds no composition cycle.
 *
 * A deployment that composes no gateway answers a typed
 * `session/commands-unavailable` instead of a broken call.
 *
 * @module @freddie/freddie-session-controller/commands
 */

import { randomUUID } from 'node:crypto'
import { TypertLookupFailure } from '@freddie/freddie-typert-protocol'

/** Command methods the gateway owns, in declaration order. */
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

/**
 * @typedef {{ sessionId?: string, workspaceId?: string, cwd?: string, agentPreset?: string }} SessionCreateRequest
 * @typedef {{ sessionId: string, agentPreset?: string }} SessionCreateValue
 * @typedef {{ sessionId: string, title: string }} SessionRenameRequest
 * @typedef {{ title: string, seq: number }} SessionRenameValue
 * @typedef {{ sessionId: string, atSeq?: number }} SessionForkRequest
 * @typedef {{ sessionId: string }} SessionForkValue
 * @typedef {{ sessionId: string, content: unknown[], mode?: string, clientTimeZone?: string }} SessionPromptRequest
 * @typedef {{ accepted: boolean }} SessionPromptValue
 * @typedef {{ sessionId: string, attachmentId: string }} SessionAttachmentRequest
 * @typedef {{ attachment: unknown, data: string }} SessionAttachmentValue
 * @typedef {{ sessionId: string, itemId: string, action: { kind: string, content?: unknown[] } }} SessionUpdateQueueRequest
 * @typedef {{ accepted: boolean }} SessionUpdateQueueValue
 * @typedef {{ sessionId: string, confirm?: boolean }} SessionCancelRequest
 * @typedef {{ accepted: boolean }} SessionCancelValue
 * @typedef {{ sessionId: string, provider: string, model: string, reasoningEffort?: string }} SessionSelectModelRequest
 * @typedef {{ selected: { provider: string, model: string, reasoningEffort?: string } }} SessionSelectModelValue
 */

/** Delegates the Session command surface to the composed Host API gateway. */
export class SessionCommandController {
  /**
   * @param {import('@freddie/cordis').Context} ctx - Host context whose
   *   `apiProxy` service carries the command surface when one is composed.
   */
  constructor(ctx) {
    this.ctx = ctx
  }

  /**
   * The gateway's Session command face, or undefined when this deployment
   * composes no gateway.
   * @returns {Record<string, Function> | undefined} `api.sessions`.
   */
  gateway() {
    const proxy = this.ctx.get('apiProxy')
    const sessions = proxy === undefined || proxy === null ? undefined : proxy.sessions
    return typeof sessions === 'object' && sessions !== null ? sessions : undefined
  }

  /**
   * Turn one command into a Session-domain failure when no gateway is mounted.
   * @param {string} method - command name.
   * @returns {TypertLookupFailure} the stable absence failure.
   */
  absent(method) {
    return new TypertLookupFailure({
      code: 'session/commands-unavailable',
      message: `session.${method} is unavailable: this deployment mounts no session command gateway`,
      details: { method },
    })
  }

  /**
   * Invoke one gateway command and narrow its answer to a Typert outcome.
   * @param {string} method - command name on `api.sessions`.
   * @param {object} request - command payload, already validated by the wire codec.
   * @returns {Promise<object>} the command's value.
   * @throws {TypertLookupFailure} the gateway's own failure, or the typed absence.
   */
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
