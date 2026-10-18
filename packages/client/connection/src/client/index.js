import { ConnectionController } from './connection.js'
import { WebApiClient } from './web-api-client.js'
import { createWebConnectionRpc } from './rpc.js'
import { isLoopbackHostname } from '../loopback-hostname.js'

export {
  RpcId,
  AbstractApiClient,
  transportError,
} from './api.js'

export const inject = []

export async function apply(ctx) {
  const pageLocation = typeof location === 'undefined' ? undefined : location
  const fixture = pageLocation !== undefined && new URLSearchParams(pageLocation.search).has('fixture')
  const fixtureClient = fixture ? new (await import('./fixture.js')).FixtureApiClient() : undefined
  const transport = globalThis.__FREDDIE_TRANSPORT__
  const api = fixtureClient ?? transport?.createApiClient() ?? new WebApiClient()
  const rpc = fixtureClient?.rpc ?? createWebConnectionRpc(transport?.fetch)
  let started = false
  let description
  let state = 'connecting'
  const descriptionListeners = new Set()
  const stateListeners = new Set()
  const publishDescription = (next) => {
    if (Object.is(description, next)) return
    description = next
    for (const listener of [...descriptionListeners]) {
      try {
        listener()
      } catch (error) {
        console.error('[web-runtime] host-description listener threw:', error)
      }
    }
  }
  const publishState = (next) => {
    if (Object.is(state, next)) return
    state = next
    for (const listener of [...stateListeners]) {
      try {
        listener()
      } catch (error) {
        console.error('[web-runtime] connection-state listener threw:', error)
      }
    }
  }
  const handle = {
    api,
    isLoopback: pageLocation === undefined || isLoopbackHostname(pageLocation.hostname),
    hostDescription: {
      getSnapshot: () => description,
      subscribe: (listener) => {
        descriptionListeners.add(listener)
        return () => { descriptionListeners.delete(listener) }
      },
    },
    state: {
      getSnapshot: () => state,
      subscribe: (listener) => {
        stateListeners.add(listener)
        return () => { stateListeners.delete(listener) }
      },
    },
    rpc,
    start(sinks, config) {
      if (started) throw new Error('connection: the stream loop is already owned by another consumer')
      started = true
      let owned = true
      const controller = new ConnectionController(api, {
        ...sinks,
        onConnected: (next) => {
          publishDescription(next)
          if (!Object.is(description, next)) return
          sinks.onConnected?.(next)
        },
        onStateChange: (next) => {
          publishState(next)
          if (next === 'reconnecting') publishDescription(undefined)
          sinks.onStateChange?.(next)
        },
      }, config ?? {})
      controller.start()
      return {
        stop: () => {
          controller.stop()
          if (owned) {
            owned = false
            started = false
          }
          publishState('offline')
          publishDescription(undefined)
        },
      }
    },
  }
  ctx.provide('connection', handle)
}
