/**
 * Fire-and-forget webhook rule registry and Workspace-backed Session runtime.
 *
 * @typedef {{ readonly kind: K; readonly source: import('./brand.js').WebhookSourceId; readonly deliveryId: import('./brand.js').WebhookDeliveryId; readonly event: unknown; readonly receivedAt: number }} VerifiedWebhookDelivery
 *   One authenticated and parsed provider delivery. `kind` is the provider family (e.g. `github`);
 *   `event` is that provider's normalized lossless JSON.
 * @template K
 * @typedef {{ readonly provider: string; readonly model: string; readonly maxTokens?: number }} WebhookModelSelection
 *   Optional explicit model route and output cap for a webhook-created Agent.
 * @typedef {{ readonly workspacePath: string; readonly title: string; readonly prompt: string; readonly agentPreset: string; readonly permissionPreset: string; readonly model?: WebhookModelSelection }} WebhookSessionRequest
 *   The sole runtime action: create and prompt one root Session. `workspacePath` is an existing local
 *   directory to resolve or create as a Workspace; omitting `model` uses the complete current default,
 *   including reasoning effort.
 * @typedef {object} WebhookRule
 *   Trusted code that optionally creates one Session for a delivery.
 * @property {import('./brand.js').WebhookRuleId} id
 * @property {string} kind
 * @property {function(Readonly<VerifiedWebhookDelivery<string>>, AbortSignal): (WebhookSessionRequest | null | Promise<WebhookSessionRequest | null>)} run
 */

import { Service } from '@freddie/cordis'
import { errorChain } from '@freddie/freddie-llm'
import { deepFreeze, snapshotJsonValue } from '@freddie/freddie-values'
import { createWebhookSession } from './session.js'

export * from './brand.js'

/**
 * One effect-owned rule registration and the invocations that currently use it.
 * @typedef {object} WebhookRuleRegistration
 * @property {WebhookRule} rule
 * @property {AbortController} controller
 * @property {Set<Promise<void>>} active - contained invocations not yet settled.
 * @property {boolean} closing
 * @property {Promise<void>} [disposal] - the memoized teardown, once started.
 */

/** Validate and detach one delivery before sharing it across arbitrary rules. */
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

/** Fire-and-forget rule runtime. Session creation is the only built-in action. */
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
      /* v8 ignore next -- caller-owned registration effects normally dispose first; this covers provider-first unload. */
      await Promise.all(
        [...this.rules.values()].map(rule => this.disposeRegistration(rule)),
      )
    }, 'webhookRuntime.lifecycle()')
  }

  /**
   * Register one trusted programmatic rule.
   * @param {WebhookRule} rule - unique id, provider kind, and arbitrary callback.
   * @returns {() => Promise<void>} awaitable effect disposer that aborts and drains this rule's active callbacks.
   */
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
      /* v8 ignore next -- no await separates the public liveness check from this initializer. */
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

  /**
   * Start every currently matching rule and return before any callback settles.
   * @param {VerifiedWebhookDelivery<string>} delivery - authenticated provider data; snapshotted before dispatch.
   * @throws synchronously when the runtime is closing or the delivery is malformed.
   */
  dispatch(delivery) {
    if (this.closing) throw new Error('webhook runtime is closing')
    const snapshot = snapshotDelivery(delivery)
    for (const registration of [...this.rules.values()]) {
      if (registration.closing || registration.rule.kind !== snapshot.kind) continue
      this.startInvocation(registration, snapshot)
    }
  }

  /** Start one contained invocation and attach it to registration teardown. */
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

  /** Memoized registration teardown: hide, abort, then drain. */
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
