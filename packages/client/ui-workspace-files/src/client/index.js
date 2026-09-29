import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './WorkspaceFilesView.js'

export const inject = ['slots', 'remote', 'remote.workspaceFiles']

export function apply(ctx) {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'workspace-files',
    order: 8,
    label: 'Files',
    inject: sessionId => ({
      sessionId,
      list: request => ctx.remote.workspaceFiles.list({ sessionId, ...request }),
      read: request => ctx.remote.workspaceFiles.read({ sessionId, ...request }),
      readBytes: request => ctx.remote.workspaceFiles.readBytes({ sessionId, ...request }),
      stat: request => ctx.remote.workspaceFiles.stat({ sessionId, ...request }),
    }),
  }, webjsxSlot('freddie-workspace-files-view')))
}
