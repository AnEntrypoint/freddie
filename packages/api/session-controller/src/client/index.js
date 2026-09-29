/**
 * Session Controller client half: mounts the `session` Remote namespace and
 * mirrors Host `api-session/*` events into `ctx.sessionModel`.
 * @module @freddie/freddie-session-controller/client
 */

import { ClientSessionModel } from './model.js'
import sessionRemote from '../typert.remote-client.js'

export { ClientSessionModel } from './model.js'

/** Stable Cordis plugin name. */
export const name = 'session-controller'

/** Required Client service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the `session` namespace and mirror its Host events, unwinding in
 * reverse order so no listener outlives the namespace it reads through.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after the namespace is mounted and every event is bound.
 */
export async function apply(ctx) {
  const { remote } = ctx
  const disposers = [await remote.$mount(sessionRemote)]
  const carrierReadLazilyBecauseItMayBeWithdrawn = {
    get $stream() { return remote.$stream },
    session: remote.session,
  }
  const model = new ClientSessionModel(ctx, carrierReadLazilyBecauseItMayBeWithdrawn)
  disposers.push(remote.$on('api-session/added', summary => { model.upsert(summary) }))
  disposers.push(remote.$on('api-session/removed', sessionId => { model.remove(sessionId) }))
  disposers.push(remote.$on('api-session/status', (sessionId, running, errored) => {
    model.setRunning(sessionId, running, errored)
  }))
  disposers.push(remote.$on('api-session/activity', (sessionId, time) => {
    model.setActivity(sessionId, time)
  }))
  disposers.push(remote.$on('api-session/error', (sessionId, message) => {
    model.setError(sessionId, message)
  }))
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
