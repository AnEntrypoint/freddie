/** Browser observability view registration. */

import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './ObservabilityDock.js'

export const inject = ['connection', 'sessions', 'slots']

/** Mount operational activity as a dedicated session view rather than crowding the composer. */
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
        treeActivity: ctx.sessions.treeActivity(),
        treeTerminals: ctx.sessions.treeTerminals(),
      },
      openSession: (targetSessionId) => { ctx.sessions.open(targetSessionId) },
      openTerminal: async () => {
        const response = await ctx.connection.api.terminal.open({ sessionId, type: 'shell' })
        if (response.result?.ok) ctx.sessions.noteTerminalActivity(sessionId, { type: 'snapshot', snapshot: response.result.value.terminal })
        return response
      },
      inputTerminal: async (terminalId, data) => await ctx.connection.api.terminal.input({ sessionId, terminalId, data }),
      snapshotTerminal: async (terminalId) => await ctx.connection.api.terminal.snapshot({ sessionId, terminalId }),
      resizeTerminal: async (terminalId, cols, rows) => await ctx.connection.api.terminal.resize({ sessionId, terminalId, cols, rows }),
      closeTerminal: async (terminalId) => await ctx.connection.api.terminal.close({ sessionId, terminalId }),
    }),
  }, webjsxSlot('freddie-observability-dock')))
}
