
import { Service } from '@freddie/cordis'
import { errorChain } from '@freddie/freddie-llm'
import { deepFreeze, snapshotJsonValue } from '@freddie/freddie-values'
import { createWebhookSession } from './session.js'

export * from './brand.js'


function snapshotDelivery(delivery) {
  if (typeof delivery.kind !== 'string' || delivery.kind.trim() === '') {
    throw new TypeError('webhook delivery kind must be a non-empty string')
  }
  if (typeof delivery.source !== 'string' || delivery.source.trim() === '') {
    throw new TypeError('webhook delivery source must be a non-empty string')
  }
  if (typeof delivery.deliveryId !== 'string' || delivery.deliveryId.trim() === '') {
    throw new TypeError('webhook delivery id must be a non-empty string')
  }
  if (!Number.isSafeInteger(delivery.receivedAt) || delivery.receivedAt < 0) {
    throw new TypeError('webhook delivery receivedAt must be a non-negative safe integer')
  }
  const snapshot = snapshotJsonValue(delivery)
  if (snapshot === undefined) throw new TypeError('webhook delivery must be lossless JSON')
  return deepFreeze(snapshot)
}

export class WebhookRuntime extends Service {
  static inject = [
    'agents',
    'agentDefaultModel',
    'agentPresets',
    'permissionPresets',
    'sessionTitle',
    'workspaceRegistry',
  ]

  rules = new Map()
  closing = false

  constructor(ctx) {
    super(ctx, 'webhookRuntime')
    this.selfCtx = ctx
    ctx.effect(() => async () => {
      this.closing = true
      await Promise.all(
        [...this.rules.values()].map(rule => this.disposeRegistration(rule)),
      )
    }, 'webhookRuntime.lifecycle()')
  }

  register(rule) {
    if (this.closing) throw new Error('webhook runtime is closing')
    if (typeof rule.id !== 'string' || rule.id.trim() === '') {
      throw new TypeError('webhook rule id must be a non-empty string')
    }
    if (typeof rule.kind !== 'string' || rule.kind.trim() === '') {
      throw new TypeError(`webhook rule "${String(rule.id)}" kind must be a non-empty string`)
    }
    if (typeof rule.run !== 'function') {
      throw new TypeError(`webhook rule "${String(rule.id)}" requires run()`)
    }

    let registration
    const disposeEffect = this.ctx.effect(() => {
      if (this.closing) throw new Error('webhook runtime is closing')
      if (this.rules.has(rule.id)) throw new Error(`webhook rule "${rule.id}" is already registered`)
      registration = {
        rule,
        controller: new AbortController(),
        active: new Set(),
        closing: false,
      }
      this.rules.set(rule.id, registration)
      return () => this.disposeRegistration(registration)
    }, `webhookRuntime.register(${rule.id})`)
    return async () => { await disposeEffect() }
  }

  dispatch(delivery) {
    if (this.closing) throw new Error('webhook runtime is closing')
    const snapshot = snapshotDelivery(delivery)
    for (const registration of [...this.rules.values()]) {
      if (registration.closing || registration.rule.kind !== snapshot.kind) continue
      this.startInvocation(registration, snapshot)
    }
  }

  startInvocation(registration, delivery) {
    const tracked = Promise.resolve().then(async () => {
      registration.controller.signal.throwIfAborted()
      const request = await registration.rule.run(delivery, registration.controller.signal)
      registration.controller.signal.throwIfAborted()
      if (request !== null) {
        await createWebhookSession(
          this.selfCtx,
          delivery,
          registration.rule.id,
          request,
          registration.controller.signal,
        )
      }
    }).catch((error) => {
      const invocation = `webhook: provider=${JSON.stringify(delivery.kind)} source=${JSON.stringify(delivery.source)} `
        + `delivery=${JSON.stringify(delivery.deliveryId)} rule=${JSON.stringify(registration.rule.id)}`
      if (registration.controller.signal.aborted) {
        this.selfCtx.logger.debug(`${invocation} stopped after disposal: ${errorChain(error)}`)
      } else {
        this.selfCtx.logger.warn(`${invocation} failed: ${errorChain(error)}`)
      }
    }).finally(() => {
      registration.active.delete(tracked)
    })
    registration.active.add(tracked)
  }

  disposeRegistration(registration) {
    registration.disposal ??= (async () => {
      registration.closing = true
      this.rules.delete(registration.rule.id)
      registration.controller.abort(new Error(`webhook rule "${registration.rule.id}" was disposed`))
      while (registration.active.size > 0) {
        await Promise.allSettled([...registration.active])
      }
    })()
    return registration.disposal
  }
}

export default WebhookRuntime
