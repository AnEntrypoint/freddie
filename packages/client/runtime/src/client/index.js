import { SlotRegistry } from './slots.js'
import { SessionRuntime } from './sessions/service.js'
import { WorkspaceRuntime } from './workspaces/service.js'
import { ConversationEventRegistry } from './conversation/event-registry.js'
import { ConversationViewRegistry } from './conversation/view-registry.js'

export { isAppendSurfaceEvent, isReplacementSurfaceEvent } from '@freddie/freddie-session/surface'

export { SlotRegistry } from './slots.js'
export { ConversationEventRegistry } from './conversation/event-registry.js'
export { ConversationViewRegistry } from './conversation/view-registry.js'
export { ConversationNodeAssembler } from './sessions/conversation-assembler.js'
export { ConversationLocationIndex } from './sessions/conversation-location-index.js'
export { conversationContextKey } from './contract/conversation.js'
export { SessionCreateError, SessionRuntime, scopeOf, workspaceTitleOf } from './sessions/service.js'
export { indexSubagentDescendants } from './sessions/subagent-lineage.js'
export { TerminalActivityStore } from './sessions/terminal-activity.js'
export { SessionProvideChannel } from './sessions/provide.js'
export { createScope } from './agents/scope.js'
export { DirectoryBrowseError, WorkspaceCreateError, WorkspaceRuntime } from './workspaces/service.js'
export { abbreviateHomePath, resolveWorkspacePath } from './workspaces/path.js'
export { createSnapshotStore, defineStore, shallowEqual, singleFlight } from './contract/store.js'
export {
  EMPTY_CHAT_SNAPSHOT, EMPTY_CONVERSATION_VIEWS, toAssistantBlock, toAssistantBlocks,
} from './sessions/conversation.js'
export { emptyAssistantBlock } from './sessions/partial.js'
export { isTokenDelta } from './sessions/assistant-timing.js'
export { contextForm, contextProvenance, sessionRecallLabels } from './sessions/context-provenance.js'
export { displayFailureMessage } from './sessions/failure-display.js'
export { PendingWait } from './sessions/pending.js'

export const inject = ['connection', 'typert', 'remote', 'remote.commands']

export function apply(ctx) {
  ctx.plugin(SlotRegistry)
  const conversation = {
    events: new ConversationEventRegistry(ctx),
    views: new ConversationViewRegistry(ctx),
  }
  const connection = ctx.get('connection')
  const sessions = new SessionRuntime(ctx, connection.api, ctx.remote, conversation)
  ctx.typert.contexts.registerClient('agent', {
    identity: candidate => sessions.scopeOf(candidate),
  })
  const workspaces = new WorkspaceRuntime(ctx, connection.api, sessions)
  let lastInstanceId
  ctx.effect(
    () => workspaces.startInitialSelection(),
    'runtime: initial Workspace selection',
  )
  const loop = connection.start({
    onMuxEnvelope: (envelope) => {
      sessions.handleMuxEnvelope(envelope)
    },
    onHostEnvelope: (envelope) => {
      sessions.handleHostEnvelope(envelope)
      workspaces.handleHostEnvelope(envelope)
      const frame = envelope.payload
      if (frame.type === 'host/remote-event') ctx.remote.$dispatch(frame.event, frame.args)
    },
    onConnected: (description) => {
      if (lastInstanceId !== undefined && description.instanceId !== undefined && description.instanceId !== lastInstanceId) {
        window.location.reload()
        return
      }
      lastInstanceId = description.instanceId
      sessions.handleConnected()
      workspaces.handleConnected()
      ctx.emit('connection/reset')
    },
    onStateChange: (state) => {
      if (state === 'reconnecting') {
        sessions.handleDisconnected()
      }
    },
  })
  ctx.effect(() => () => { loop.stop() }, 'runtime: connection stream loop')
}
