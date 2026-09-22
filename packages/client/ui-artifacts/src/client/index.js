import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './ArtifactsView.js'

export const inject = ['slots', 'remote', 'remote.sessionArtifacts']

export function apply(ctx) {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'artifacts',
    order: 7,
    label: 'Artifacts',
    inject: sessionId => ({
      sessionId,
      list: () => ctx.remote.sessionArtifacts.list({ sessionId }),
      put: request => ctx.remote.sessionArtifacts.put({ sessionId, ...request }),
      remove: request => ctx.remote.sessionArtifacts.deleteArtifact({ sessionId, ...request }),
      share: request => ctx.remote.sessionArtifacts.share({ sessionId, ...request }),
    }),
  }, webjsxSlot('freddie-artifacts-view')))
}
