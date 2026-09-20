/** Browser observability view registration. */

import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './ObservabilityDock.js'

export const inject = ['connection', 'sessions', 'slots']

/** Mount GM graph traversal as the session Overview. */
export function apply(ctx) {
  const gmRemote = () => ctx.get('remote.gm')
  const missing = async () => ({
    ok: false,
    error: { code: 'gm-remote-unavailable', message: 'GM edit Remote is not mounted', details: {} },
  })

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'observability',
    order: 5,
    label: 'Overview',
    inject: (sessionId) => ({
      sessionId,
      hooks: {
        connection: ctx.connection.state,
        terminals: ctx.sessions.terminalActivity(sessionId),
      },
      prdAdd: (request) => {
        const gm = gmRemote()
        if (gm === undefined || typeof gm.prdAdd !== 'function') return missing()
        return gm.prdAdd(sessionId, request)
      },
      prdResolve: (request) => {
        const gm = gmRemote()
        if (gm === undefined || typeof gm.prdResolve !== 'function') return missing()
        return gm.prdResolve(sessionId, request)
      },
      mutableAdd: (request) => {
        const gm = gmRemote()
        if (gm === undefined || typeof gm.mutableAdd !== 'function') return missing()
        return gm.mutableAdd(sessionId, request)
      },
      mutableResolve: (request) => {
        const gm = gmRemote()
        if (gm === undefined || typeof gm.mutableResolve !== 'function') return missing()
        return gm.mutableResolve(sessionId, request)
      },
      transition: (request) => {
        const gm = gmRemote()
        if (gm === undefined || typeof gm.transition !== 'function') return missing()
        return gm.transition(sessionId, request)
      },
    }),
  }, webjsxSlot('freddie-observability-dock')))
}
