/**
 * Service Definition for the authorization capability seam (`ctx.authorization`):
 * obtaining a credential nobody can supply from configuration alone, because
 * getting it requires a conversation with the human — open this page, paste
 * that code, pick an account.
 *
 * The seam owns the conversation and the lifecycle; it never owns the protocol.
 * A plugin that knows how to obtain its own credential registers a flow keyed
 * by the credential key that flow writes, and the flow talks to whatever
 * surface started it through one neutral vocabulary of notices and prompts. So
 * a second authorization protocol arrives as another flow rather than as
 * another seam, and a surface that renders one flow renders all of them.
 *
 * ```js
 * const dispose = ctx.authorization.registerFlow({
 *   key: credentialKey('llm-pi-ai', 'openai-codex'),
 *   label: 'ChatGPT (Codex)',
 *   methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
 *   async run(session) {
 *     session.notify({ message: 'Continue in your browser', url })
 *     await session.commit(await exchange(session.signal))
 *   },
 * })
 * ```
 *
 * @module @freddie/freddie-authorization
 */

import { Service } from '@freddie/cordis'
import { parseCredentialKey } from '@freddie/freddie-credentials'
import { HarnessError } from '@freddie/freddie-llm'

/** @typedef {import('./types.js').AuthorizationEntry} AuthorizationEntry */
/** @typedef {import('./types.js').AuthorizationFlow} AuthorizationFlow */
/** @typedef {import('./types.js').AuthorizationInteraction} AuthorizationInteraction */
/** @typedef {import('./types.js').AuthorizationOutcome} AuthorizationOutcome */
/** @typedef {import('./types.js').AuthorizationRequest} AuthorizationRequest */
/** @typedef {import('./types.js').AuthorizationSettlement} AuthorizationSettlement */

/**
 * `authorization/settled (key, settlement)` — emit. One authorization attempt
 * has finished and released its key. Fires for every terminal outcome,
 * failures included, so a surface watching a key it did not start (a second
 * browser tab) learns the attempt is over.
 */

/** Stable error taxonomy for authorization failures. */
export class AuthorizationError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
    this.name = 'AuthorizationError'
  }
}

/**
 * The rejection an {@link AuthorizationInteraction.prompt} uses to say the
 * human declined — dismissed the question, chose not to answer — rather than
 * that the surface broke. An attempt whose flow fails after a prompt was
 * declined settles as `cancelled`, the same outcome as a withdrawn signal,
 * because the human saying no is a refusal, not a breakage. Only a human's
 * "no" may reject with this class: a prompt withdrawn by its own `signal` (a
 * flow retiring the losing question of a race) must reject with something
 * else, or a later genuine failure would be misread as a decline.
 */
export class AuthorizationDeclinedError extends AuthorizationError {
  constructor(message = 'the authorization prompt was declined') {
    super(message, 'DECLINED')
    this.name = 'AuthorizationDeclinedError'
  }
}

/**
 * One attempt in flight, with the handle that withdraws it.
 * @typedef {object} InFlight
 * @property {AbortController} controller
 * @property {boolean} committing
 */

/**
 * A promise that resolves `'withdrawn'` once `signal` aborts, so a flow that
 * ignores its signal cannot hold the key past the withdrawal.
 * @param {AbortSignal} signal - the attempt's signal, not yet aborted.
 * @returns {Promise<'withdrawn'>} settles on abort.
 */
function settlesWhenWithdrawn(signal) {
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => { resolve('withdrawn') }, { once: true })
  })
}

/**
 * `ctx.authorization`: a registry of credential-obtaining flows, one attempt at
 * a time per key.
 */
export class AuthorizationService extends Service {
  /** The commit this seam confirms is a credential-record write, so the store is required, not optional. */
  static inject = ['credentials']

  /** @type {Map<string, AuthorizationFlow>} */
  flows = new Map()
  /** @type {Map<string, InFlight>} */
  running = new Map()

  constructor(ctx) {
    super(ctx, 'authorization')
  }

  /**
   * Offer a way to obtain one credential. One flow per key: two plugins
   * claiming the same key would each write a record in their own format, and
   * whichever ran last would leave the other reading a payload it cannot parse.
   *
   * @param {AuthorizationFlow} flow - the key it writes, its label, its methods, and its runner.
   * @returns {() => void} Disposer that withdraws this flow.
   * @throws {AuthorizationError} code `DUPLICATE_FLOW` when the key is already
   *   claimed, `BAD_KEY` when the key is not a `<scope>/<id>` credential key,
   *   or `NO_METHOD` when the flow offers no method to begin.
   */
  registerFlow(flow) {
    const key = this.admit(flow)
    const dispose = this.ctx.effect(function* () {
      if (this.flows.has(key)) {
        throw new AuthorizationError(
          `an authorization flow for "${key}" is already registered`, 'DUPLICATE_FLOW')
      }
      this.flows.set(key, flow)
      const withdrawFlowAndItsAttempt = () => {
        this.flows.delete(key)
        this.cancel(key)
      }
      yield withdrawFlowAndItsAttempt
    }.bind(this), 'authorization.registerFlow()')
    return () => void dispose()
  }

  /**
   * Hold a flow to the two invariants its TypeScript type carries upstream and
   * plain JavaScript cannot: that its key is addressable in the credential-record
   * space, and that it offers at least one method. Refusing here fails the
   * registering plugin's activation, instead of letting a methodless flow
   * register cleanly and then throw from inside `begin()` on the day a surface
   * offers it to somebody.
   *
   * @param {AuthorizationFlow} flow - the flow being registered.
   * @returns {string} the validated key.
   */
  admit(flow) {
    let key
    try {
      key = parseCredentialKey(flow.key)
    } catch (error) {
      throw new AuthorizationError(
        `an authorization flow's key must be a "<scope>/<id>" credential key, got ${JSON.stringify(flow.key)}`,
        'BAD_KEY',
        { cause: error },
      )
    }
    if (!flow.methods?.length) {
      throw new AuthorizationError(
        `an authorization flow for "${key}" offers no method to begin`, 'NO_METHOD')
    }
    return key
  }

  /**
   * Every registered flow, for a surface listing what can be authorized.
   * @returns {readonly AuthorizationEntry[]} one entry per flow, in registration order.
   */
  list() {
    return [...this.flows.values()].map(flow => this.entry(flow))
  }

  /**
   * One registered flow.
   * @param {string} key - the credential record to ask about.
   * @returns {AuthorizationEntry | undefined} the entry, or undefined when no flow claims that key.
   */
  describe(key) {
    const flow = this.flows.get(key)
    return flow === undefined ? undefined : this.entry(flow)
  }

  /**
   * The public view of one registered flow.
   * @param {AuthorizationFlow} flow - the flow to describe.
   * @returns {AuthorizationEntry} its entry.
   */
  entry(flow) {
    return {
      key: flow.key,
      label: flow.label,
      methods: flow.methods,
      inFlight: this.running.has(flow.key),
    }
  }

  /**
   * Withdraw the attempt running for a key, if any. Separate from the
   * request's own signal because a request/response transport answers a Cancel
   * button on a second call, with no handle on the first one's signal.
   * @param {string} key - the credential record whose attempt should stop.
   * @returns {void}
   */
  cancel(key) {
    const running = this.running.get(key)
    if (running !== undefined && !running.committing) running.controller.abort()
  }

  /**
   * Run one attempt to authorize a key, and report how it ended.
   *
   * One attempt per key at a time. A second caller is refused rather than
   * joined: the two would be prompting different humans through the same flow,
   * and the second would answer questions the first was asked.
   *
   * @param {AuthorizationRequest} request - the key, the method, the surface, and the cancel signal.
   * @returns {Promise<AuthorizationOutcome>} `authorized` once the flow's
   *   record is committed during this attempt and observed, or `cancelled`
   *   when the human declined or the caller withdrew.
   * @throws {AuthorizationError} code `NO_FLOW` when nothing claims the key,
   *   `UNKNOWN_METHOD` when the named method is not one the flow offers,
   *   `ALREADY_IN_FLIGHT` when an attempt is already running for the key, or
   *   `NOT_COMMITTED` when the flow resolved without committing a record
   *   during the attempt.
   */
  async begin(request) {
    const { key } = request
    const flow = this.flows.get(key)
    if (flow === undefined) {
      throw new AuthorizationError(`no authorization flow is registered for "${key}"`, 'NO_FLOW')
    }
    const method = request.method ?? flow.methods[0].id
    if (!flow.methods.some(candidate => candidate.id === method)) {
      throw new AuthorizationError(
        `authorization flow for "${key}" offers no method "${method}"`, 'UNKNOWN_METHOD')
    }
    if (this.running.has(key)) {
      throw new AuthorizationError(
        `an authorization attempt for "${key}" is already running`, 'ALREADY_IN_FLIGHT')
    }
    const withdrawnBeforeBegin = request.signal?.aborted === true
    if (withdrawnBeforeBegin) return { status: 'cancelled' }
    const controller = new AbortController()
    const withdraw = () => {
      const running = this.running.get(key)
      if (running !== undefined && !running.committing) controller.abort(request.signal?.reason)
    }
    request.signal?.addEventListener('abort', withdraw, { once: true })
    this.running.set(key, { controller, committing: false })
    /** @type {AuthorizationSettlement} */
    let settlement = 'failed'
    try {
      const outcome = await this.attempt(flow, method, controller.signal, request.interaction)
      settlement = outcome.status
      return outcome
    } finally {
      request.signal?.removeEventListener('abort', withdraw)
      this.running.delete(key)
      this.settle(key, settlement)
    }
  }

  /* jscpd:ignore-start */
  /**
   * Fan `authorization/settled` out with contained listener failures: every
   * listener runs, and a sync throw or async rejection is logged without
   * changing the finished attempt's own outcome — except `INVARIANT`-coded
   * failures, which rethrow after every listener ran. The attempt is already
   * over and its key released when this fires, so a broken watcher (that
   * second browser tab) can never turn the caller's settled result into a
   * failure of its own.
   *
   * @param {string} key - the credential record the finished attempt was authorizing.
   * @param {AuthorizationSettlement} settlement - how it ended.
   * @returns {void}
   */
  settle(key, settlement) {
    let invariantFailure
    const args = ['authorization/settled', key, settlement]
    for (const listener of this.ctx.events.dispatch('emit', args)) {
      try {
        const returned = listener(key, settlement)
        if (returned != null && typeof returned.then === 'function') {
          void Promise.resolve(returned).then(undefined, (error) => {
            this.warnSettledListenerFailure(key, error)
          })
        }
      } catch (error) {
        if (error?.code === 'INVARIANT') {
          invariantFailure ??= error
          continue
        }
        this.warnSettledListenerFailure(key, error)
      }
    }
    if (invariantFailure !== undefined) throw invariantFailure
  }
  /* jscpd:ignore-end */

  /** Contained-listener diagnostic shared by the sync and async failure paths. */
  warnSettledListenerFailure(key, error) {
    this.ctx.logger.warn('authorization: an authorization/settled listener for "%s" failed', key)
    this.ctx.logger.warn(error)
  }

  /**
   * Run the flow, then hold it to its half of the commit contract.
   * @param {AuthorizationFlow} flow - the flow to run.
   * @param {string} method - the method the caller picked.
   * @param {AbortSignal} signal - aborted when the caller withdraws or the key is cancelled.
   * @param {AuthorizationInteraction} interaction - the surface rendering this attempt.
   * @returns {Promise<AuthorizationOutcome>} how the attempt ended.
   */
  async attempt(flow, method, signal, interaction) {
    const withdrawn = settlesWhenWithdrawn(signal)
    const observed = { declined: false, committed: false }
    const unwatch = this.ctx.on('credentials/record-updated', (key) => {
      if (key === flow.key) observed.committed = true
    })
    try {
      const running = flow.run({
        method,
        signal,
        commit: async (record) => {
          signal.throwIfAborted()
          const attempt = this.running.get(flow.key)
          if (attempt === undefined || attempt.controller.signal !== signal) {
            throw new AuthorizationError('authorization attempt is no longer active', 'CANCELLED')
          }
          attempt.committing = true
          await this.ctx.credentials.modifyRecord(flow.key, () => Promise.resolve(record))
        },
        notify: (notice) => {
          try {
            interaction.notify(notice)
          } catch (error) {
            this.ctx.logger.warn('authorization: the interaction surface failed to render a notice')
            this.ctx.logger.warn(error)
          }
        },
        prompt: prompt => interaction.prompt(prompt).catch((error) => {
          if (error instanceof AuthorizationDeclinedError) observed.declined = true
          throw error
        }),
      })
      try {
        if (await Promise.race([running.then(() => 'ran'), withdrawn]) === 'withdrawn') {
          void running.catch(() => {
            this.ctx.logger.debug('authorization: withdrawn flow failed after the fact')
          })
          return { status: 'cancelled' }
        }
      } catch (error) {
        if (signal.aborted || observed.declined) return { status: 'cancelled' }
        throw error
      }
    } finally {
      unwatch()
    }
    if (!observed.committed) {
      throw new AuthorizationError(
        `authorization flow for "${flow.key}" resolved without committing a credential record in this attempt`,
        'NOT_COMMITTED')
    }
    const stored = await this.ctx.credentials.describeRecord(flow.key)
    if (!stored.configured) {
      throw new AuthorizationError(
        `authorization flow for "${flow.key}" deleted its credential record instead of committing one`,
        'NOT_COMMITTED')
    }
    return { status: 'authorized' }
  }
}

export default AuthorizationService
