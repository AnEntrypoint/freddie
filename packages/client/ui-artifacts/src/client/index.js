import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './ArtifactsView.js'

function settled(call) {
  return call.then(result => result?.ok === true && typeof result.value === 'object' && result.value !== null && 'ok' in result.value ? result.value : result)
}

export const inject = ['slots', 'remote', 'remote.sessionArtifacts']

export function apply(ctx) {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'artifacts',
    order: 7,
    label: 'Artifacts',
    inject: sessionId => ({
      sessionId,
      list: () => settled(ctx.remote.sessionArtifacts.list({ sessionId })),
      put: request => settled(ctx.remote.sessionArtifacts.put({ sessionId, ...request })),
      remove: request => settled(ctx.remote.sessionArtifacts.deleteArtifact({ sessionId, ...request })),
      share: request => settled(ctx.remote.sessionArtifacts.share({ sessionId, ...request })),
    }),
  }, webjsxSlot('freddie-artifacts-view')))
}
