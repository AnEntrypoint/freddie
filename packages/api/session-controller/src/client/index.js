import { ClientSessionModel } from './model.js'
import sessionRemote from '../typert.remote-client.js'

export { ClientSessionModel } from './model.js'

export const name = 'session-controller'

export const inject = ['remote']

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
