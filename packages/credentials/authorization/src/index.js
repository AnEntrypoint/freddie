import { Service } from '@freddie/cordis'
import { parseCredentialKey } from '@freddie/freddie-credentials'
import { HarnessError } from '@freddie/freddie-llm'



export class AuthorizationError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
    this.name = 'AuthorizationError'
  }
}

export class AuthorizationDeclinedError extends AuthorizationError {
  constructor(message = 'the authorization prompt was declined') {
    super(message, 'DECLINED')
    this.name = 'AuthorizationDeclinedError'
  }
}


function settlesWhenWithdrawn(signal) {
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => { resolve('withdrawn') }, { once: true })
  })
}

export class AuthorizationService extends Service {
  static inject = ['credentials']

  flows = new Map()
  running = new Map()

  constructor(ctx) {
    super(ctx, 'authorization')
  }

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

  list() {
    return [...this.flows.values()].map(flow => this.entry(flow))
  }

  describe(key) {
    const flow = this.flows.get(key)
    return flow === undefined ? undefined : this.entry(flow)
  }

  entry(flow) {
    return {
      key: flow.key,
      label: flow.label,
      methods: flow.methods,
      inFlight: this.running.has(flow.key),
    }
  }

  cancel(key) {
    const running = this.running.get(key)
    if (running !== undefined && !running.committing) running.controller.abort()
  }

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

  warnSettledListenerFailure(key, error) {
    this.ctx.logger.warn('authorization: an authorization/settled listener for "%s" failed', key)
    this.ctx.logger.warn(error)
  }

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
