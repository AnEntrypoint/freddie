/** Browser observability view registration. */

import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './ObservabilityDock.js'

export const inject = ['connection', 'sessions', 'slots', 'remote', 'remote.gm']

/** Mount GM graph traversal as the session Overview. */
export function apply(ctx) {
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
      prdAdd: (request) => ctx.remote.gm.prdAdd(sessionId, request),
      prdResolve: (request) => ctx.remote.gm.prdResolve(sessionId, request),
      mutableAdd: (request) => ctx.remote.gm.mutableAdd(sessionId, request),
      mutableResolve: (request) => ctx.remote.gm.mutableResolve(sessionId, request),
      transition: (request) => ctx.remote.gm.transition(sessionId, request),
    }),
  }, webjsxSlot('freddie-observability-dock')))
}
