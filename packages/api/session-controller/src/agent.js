/** Agent activation and Session inspection owned by API Session. */

import { SessionQueryError } from '@freddie/freddie-session-query'
import { TypertLookupFailure } from '@freddie/freddie-typert-protocol'

/** Cold Session identity absent from persistence. */
export class ApiSessionNotFound extends Error {}

/** Session identity whose lifecycle belongs to subagent routing. */
export class ApiSessionSubagentOwnership extends Error {
  /**
   * @param {string} sessionId - identity reserved to subagent routing.
   */
  constructor(sessionId) {
    super(`session "${sessionId}" is a subagent session; use subagent delivery`)
    this.sessionId = sessionId
  }
}

/**
 * Failures produced while resolving one ordinary Session identity to its live Agent.
 * @typedef {TypertLookupFailure} ApiSessionAgentError
 */

/**
 * @typedef {{ agent: object } | { error: ApiSessionAgentError }} ApiSessionAgentResult
 */

/**
 * Test whether generic Session routing must leave an identity to subagent routing.
 * @param {import('@freddie/cordis').Context} ctx - Host context carrying the Agent ownership registry.
 * @param {{ header: object }} session - attached or live Session whose ownership is tested.
 * @param {object | undefined} agent - live Agent when one exists for the Session.
 * @returns {boolean} whether subagent routing owns the Session identity.
 */
export function hasApiSessionSubagentOwner(ctx, session, agent) {
  if (session.header.origin === 'subagent') return true
  const parentId = session.header.parentSession
  if (parentId === undefined || agent === undefined) return false
  const parent = ctx.agents.get(parentId)
  return parent !== undefined && ctx.agents.isOwnedBy(agent.id, parent)
}

/**
 * Build the stable caller-facing subagent ownership rejection.
 * @param {string} sessionId - Session identity owned by subagent routing.
 * @returns {ApiSessionAgentError} a stable Session-domain failure.
 */
export function apiSessionSubagentOwnershipError(sessionId) {
  return new TypertLookupFailure({
    code: 'session/agent-busy',
    message: `session "${sessionId}" is owned by subagent routing`,
    details: { reason: 'use subagent delivery for this child session' },
  })
}

/**
 * Inspect one cold Session without repairing, resuming, or publishing it.
 * @param {import('@freddie/cordis').Context} ctx - Host context carrying Session query.
 * @param {string} sessionId - durable Session identity.
 * @param {AbortSignal} [signal] - optional cancellation for persistence reads.
 * @returns {Promise<import('./types.js').SessionInspection>} the persisted header and complete event prefix.
 */
export async function inspectApiSession(ctx, sessionId, signal) {
  let read
  try {
    read = await ctx.sessionQuery.readSession(sessionId)
  } catch (error) {
    if (error instanceof SessionQueryError
      && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
      throw new ApiSessionNotFound(`session "${sessionId}" not found`)
    }
    throw error
  }
  signal?.throwIfAborted()
  if (read.session.cwd === undefined) {
    throw new ApiSessionNotFound(`session "${sessionId}" not found`)
  }
  return {
    meta: read.session,
    inheritedEventCount: read.session.seedLength ?? 0,
    events: [...read.events],
  }
}

/** Owns every operation that may create, resume, or configure a Host Agent. */
export class ApiSessionAgentController {
  /**
   * @param {import('@freddie/cordis').Context} ctx - Host context carrying Agent, model, and query services.
   */
  constructor(ctx) {
    this.ctx = ctx
    this.resumes = new Map()
  }

  /**
   * Resolve or resume one ordinary Session, deduplicating concurrent resumes.
   * @param {string} sessionId - ordinary Session identity.
   * @returns {Promise<ApiSessionAgentResult>} the live Agent or a stable Session-domain failure.
   */
  resolveAgent(sessionId) {
    return this.resolve(sessionId)
  }

  /**
   * @param {string} sessionId - ordinary Session identity.
   * @returns {Promise<ApiSessionAgentResult>} the live Agent or a stable Session-domain failure.
   */
  async resolve(sessionId) {
    const live = this.liveAgent(sessionId)
    if (live !== undefined) return live
    const attached = this.ctx.sessions.get(sessionId)
    if (attached !== undefined && hasApiSessionSubagentOwner(this.ctx, attached, undefined)) {
      return { error: apiSessionSubagentOwnershipError(sessionId) }
    }
    let resume = this.resumes.get(sessionId)
    if (resume === undefined) {
      resume = this.resume(sessionId).finally(() => { this.resumes.delete(sessionId) })
      this.resumes.set(sessionId, resume)
    }
    try {
      const agent = await resume
      const identityAdoptedBySubagentRouting = this.liveAgent(sessionId)
      return identityAdoptedBySubagentRouting ?? { agent }
    } catch (error) {
      if (error instanceof ApiSessionNotFound) {
        return {
          error: new TypertLookupFailure({
            code: 'session/not-found',
            message: error.message,
            details: { sessionId },
          }),
        }
      }
      if (error instanceof ApiSessionSubagentOwnership) {
        return { error: apiSessionSubagentOwnershipError(error.sessionId) }
      }
      const raced = this.liveAgent(sessionId)
      if (raced !== undefined) return raced
      const racedSession = this.ctx.sessions.get(sessionId)
      if (racedSession !== undefined && hasApiSessionSubagentOwner(this.ctx, racedSession, undefined)) {
        return { error: apiSessionSubagentOwnershipError(sessionId) }
      }
      return {
        error: new TypertLookupFailure({
          code: 'internal',
          message: `resume failed for session "${sessionId}": ${String(error)}`,
          details: {},
        }),
      }
    }
  }

  /**
   * @param {string} sessionId - ordinary Session identity.
   * @returns {ApiSessionAgentResult | undefined} the already-published Agent or its ownership rejection.
   */
  liveAgent(sessionId) {
    const agent = this.ctx.agents.get(sessionId)
    if (agent === undefined) return undefined
    return hasApiSessionSubagentOwner(this.ctx, agent.session, agent)
      ? { error: apiSessionSubagentOwnershipError(sessionId) }
      : { agent }
  }

  /**
   * Load one ordinary Session and resume its Agent through the registered factory.
   * @param {string} sessionId - ordinary Session identity.
   * @returns {Promise<object>} the resumed Agent.
   */
  async resume(sessionId) {
    const attached = this.ctx.sessions.get(sessionId)
    const header = attached?.header ?? (await this.readHeader(sessionId))
    if (header.cwd === undefined) {
      throw new ApiSessionNotFound(`session "${sessionId}" not found`)
    }
    if (hasApiSessionSubagentOwner(this.ctx, { header }, undefined)) {
      throw new ApiSessionSubagentOwnership(sessionId)
    }
    const published = this.liveAgent(sessionId)
    if (published !== undefined) {
      if ('error' in published) throw new ApiSessionSubagentOwnership(sessionId)
      return published.agent
    }
    const { provider, model } = this.ctx.agentDefaultModel.currentSelection()
    return (await this.ctx.agents.resume({
      resumeSessionId: sessionId,
      agentOptions: { provider, model },
    })).agent
  }

  /**
   * @param {string} sessionId - cold Session identity.
   * @returns {Promise<object>} the persisted header.
   */
  async readHeader(sessionId) {
    try {
      return (await this.ctx.sessionQuery.readSession(sessionId)).session
    } catch (error) {
      if (error instanceof SessionQueryError
        && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
        throw new ApiSessionNotFound(`session "${sessionId}" not found`)
      }
      throw error
    }
  }
}
