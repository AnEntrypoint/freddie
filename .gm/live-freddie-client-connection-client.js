/**
 * Browser wire client. The plugin selects fixture or HTTP transport, provides
 * the shared API client, and lets the runtime object layer start the stream
 * controller with its sinks.
 */
import { ConnectionController } from './connection.js'
import { FixtureApiClient } from './fixture.js'
import { WebApiClient } from './web-api-client.js'
import { createWebConnectionRpc } from './rpc.js'
import { isLoopbackHostname } from '../loopback-hostname.js'

// ---- Contract re-exports (browser-safe apiproxy channels + core types) ----
export {
  RpcId,
  AbstractApiClient,
  transportError,
} from './api.js'

/** Required services (none — this is the wire root). */
export const inject = []

/**
 * Client plugin body: pick the api by page mode and provide ctx.connection.
 * @param ctx - client cordis context.
 */
export function apply(ctx) {
  const pageLocation = typeof location === 'undefined' ? undefined : location
  const fixture = pageLocation !== undefined && new URLSearchParams(pageLocation.search).has('fixture')
  const fixtureClient = fixture ? new FixtureApiClient() : undefined
  const transport = globalThis.__FREDDIE_TRANSPORT__
  const api = fixtureClient ?? transport?.createApiClient() ?? new WebApiClient()
  const rpc = fixtureClient?.rpc ?? createWebConnectionRpc(transport?.fetch)
  let started = false
  let description
  const descriptionListeners = new Set()
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
    rpc,
    start(sinks, config) {
      if (started) throw new Error('connection: the stream loop is already owned by another consumer')
      started = true
      const controller = new ConnectionController(api, {
        ...sinks,
        onConnected: (next) => {
          publishDescription(next)
          // A description subscriber may synchronously stop the loop. In that
          // case publishDescription(undefined) has already retracted this
          // generation, so do not leak its stale connected notification to
          // the consumer sink afterward.
          if (!Object.is(description, next)) return
          sinks.onConnected?.(next)
        },
        onStateChange: (state) => {
          if (state === 'reconnecting') publishDescription(undefined)
          sinks.onStateChange?.(state)
        },
      }, config ?? {})
      controller.start()
      return {
        stop: () => {
          controller.stop()
          publishDescription(undefined)
        },
      }
    },
  }
  ctx.provide('connection', handle)
}
